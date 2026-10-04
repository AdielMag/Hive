/**
 * Transcript reconstruction from Pi's RPC stream. Pure functions, browser-safe, unit-tested.
 *
 * Source of truth is Pi's session entries (fetched with `get_entries`, using the last seen entry id
 * as a durable `since` cursor, docs/rpc-commands.md:685). While a run is streaming, a live overlay is
 * built from events: `message_update` records are delta-only (docs/json.md:72), so blocks are
 * assembled from deltas and replaced by the authoritative `*_end` content and finally by the
 * `message_end` message. Completed messages stay in `live` until an entries sync persists them.
 */
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import type { PiStreamEvent } from "@hive/protocol";

export interface UsageLike {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost?: { total: number };
}

/** Loose message shape: tolerate unknown roles and fields (docs/message-types.md "AgentMessage union"). */
export interface AnyMessage {
  role: string;
  timestamp?: number;
  [key: string]: unknown;
}

export type AssistantBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string; redacted?: boolean }
  | {
      type: "toolCall";
      id: string;
      name: string;
      arguments: Record<string, unknown>;
      /** Raw streamed argument JSON while the call is still being generated. */
      argsText?: string;
      complete: boolean;
    }
  | { type: "unknown"; raw: unknown };

export interface ToolRun {
  toolCallId: string;
  toolName: string;
  args: unknown;
  status: "running" | "done" | "error";
  partial?: unknown;
  result?: unknown;
  startedAt: number;
  endedAt?: number;
}

export interface RetryState {
  attempt: number;
  maxAttempts: number;
  delayMs: number;
  errorMessage: string;
}

export interface TranscriptError {
  at: number;
  source: string;
  message: string;
}

export interface TranscriptState {
  byId: Readonly<Record<string, SessionEntry>>;
  /** Entry ids in append order. */
  order: readonly string[];
  leafId: string | null;
  /** Last entry id seen in append order; the `since` cursor for incremental syncs. */
  cursor: string | null;
  /** Messages completed during the current run that are not yet in synced entries. */
  live: readonly AnyMessage[];
  streaming: { message: AnyMessage & { content: AssistantBlock[] } } | null;
  tools: Readonly<Record<string, ToolRun>>;
  running: boolean;
  queue: { steering: readonly string[]; followUp: readonly string[] };
  retry: RetryState | null;
  compaction: { reason: string } | null;
  /** Latest cumulative provider usage (live ring approximation). */
  lastUsage: UsageLike | null;
  errors: readonly TranscriptError[];
  /** Bumped whenever entries or live messages change (cheap memo key). */
  revision: number;
}

export function createTranscript(): TranscriptState {
  return {
    byId: {},
    order: [],
    leafId: null,
    cursor: null,
    live: [],
    streaming: null,
    tools: {},
    running: false,
    queue: { steering: [], followUp: [] },
    retry: null,
    compaction: null,
    lastUsage: null,
    errors: [],
    revision: 0,
  };
}

const messageKey = (m: AnyMessage) => `${m.role}:${m.timestamp ?? "?"}`;

function normalizeBlocks(content: unknown): AssistantBlock[] {
  if (!Array.isArray(content)) return [];
  return content.map(normalizeBlock);
}

function normalizeBlock(block: unknown): AssistantBlock {
  const b = block as Record<string, unknown> | null;
  if (b && b.type === "text") return { type: "text", text: String(b.text ?? "") };
  if (b && b.type === "thinking")
    return { type: "thinking", thinking: String(b.thinking ?? ""), redacted: b.redacted === true };
  if (b && b.type === "toolCall")
    return {
      type: "toolCall",
      id: String(b.id ?? ""),
      name: String(b.name ?? ""),
      arguments: (b.arguments as Record<string, unknown>) ?? {},
      complete: true,
    };
  return { type: "unknown", raw: block };
}

function setBlock(blocks: AssistantBlock[], index: number, block: AssistantBlock): AssistantBlock[] {
  const next = blocks.slice();
  while (next.length < index) next.push({ type: "text", text: "" });
  next[index] = block;
  return next;
}

function appendLive(live: readonly AnyMessage[], message: AnyMessage): readonly AnyMessage[] {
  const key = messageKey(message);
  const existing = live.findIndex((m) => messageKey(m) === key);
  if (existing === -1) return [...live, message];
  const next = live.slice();
  next[existing] = message;
  return next;
}

type AssistantEvent = { type: string; contentIndex?: number; delta?: string; content?: unknown; [k: string]: unknown };

function applyAssistantEvent(blocks: AssistantBlock[], ev: AssistantEvent): AssistantBlock[] {
  const i = ev.contentIndex ?? blocks.length;
  const current = blocks[i];
  switch (ev.type) {
    case "text_start":
      return setBlock(blocks, i, { type: "text", text: "" });
    case "text_delta": {
      const text = current?.type === "text" ? current.text : "";
      return setBlock(blocks, i, { type: "text", text: text + String(ev.delta ?? "") });
    }
    case "text_end":
      return setBlock(blocks, i, {
        type: "text",
        text: typeof ev.content === "string" ? ev.content : current?.type === "text" ? current.text : "",
      });
    case "thinking_start":
      return setBlock(blocks, i, { type: "thinking", thinking: "" });
    case "thinking_delta": {
      const thinking = current?.type === "thinking" ? current.thinking : "";
      return setBlock(blocks, i, { type: "thinking", thinking: thinking + String(ev.delta ?? "") });
    }
    case "thinking_end":
      return setBlock(blocks, i, {
        type: "thinking",
        thinking:
          typeof ev.content === "string" ? ev.content : current?.type === "thinking" ? current.thinking : "",
      });
    case "toolcall_start":
      return setBlock(blocks, i, {
        type: "toolCall",
        id: String(ev.id ?? ""),
        name: String(ev.toolName ?? ""),
        arguments: {},
        argsText: "",
        complete: false,
      });
    case "toolcall_delta": {
      if (current?.type !== "toolCall") return blocks;
      return setBlock(blocks, i, { ...current, argsText: (current.argsText ?? "") + String(ev.delta ?? "") });
    }
    case "toolcall_end": {
      const call = normalizeBlock(ev.toolCall);
      return setBlock(blocks, i, call);
    }
    default:
      // "start" | "done" | "error" are translated into message_start/message_end by Pi's agent loop.
      return blocks;
  }
}

/** Apply one streamed event. Pure: returns a new state object (or the same one when nothing changed). */
export function applyEvent(state: TranscriptState, event: PiStreamEvent): TranscriptState {
  const e = event as { type: string; [k: string]: unknown };
  switch (e.type) {
    case "agent_start":
      return { ...state, running: true };
    case "agent_settled":
      return { ...state, running: false, retry: null, streaming: null };
    case "message_start": {
      const message = e.message as AnyMessage;
      if (message?.role !== "assistant") return state;
      return {
        ...state,
        running: true,
        streaming: { message: { ...message, content: normalizeBlocks(message.content) } },
      };
    }
    case "message_update": {
      const usage = (e.usage as UsageLike | undefined) ?? state.lastUsage;
      if (!state.streaming) return usage === state.lastUsage ? state : { ...state, lastUsage: usage };
      const content = applyAssistantEvent(state.streaming.message.content, e.assistantMessageEvent as AssistantEvent);
      return { ...state, lastUsage: usage, streaming: { message: { ...state.streaming.message, content } } };
    }
    case "message_end": {
      const message = e.message as AnyMessage;
      if (!message) return state;
      const next: TranscriptState = { ...state, live: appendLive(state.live, message), revision: state.revision + 1 };
      if (message.role === "assistant") {
        next.streaming = null;
        const usage = message.usage as UsageLike | undefined;
        if (usage && usage.totalTokens + usage.input + usage.output > 0) next.lastUsage = usage;
      }
      return next;
    }
    case "tool_execution_start": {
      const id = String(e.toolCallId);
      return {
        ...state,
        tools: {
          ...state.tools,
          [id]: { toolCallId: id, toolName: String(e.toolName), args: e.args, status: "running", startedAt: Date.now() },
        },
      };
    }
    case "tool_execution_update": {
      const id = String(e.toolCallId);
      // The run may be unknown when the transcript was rebuilt from the session file mid-execution
      // (tab switch / reopen): adopt it from the update so long-running tools show live progress.
      const run: ToolRun = state.tools[id] ?? {
        toolCallId: id,
        toolName: String(e.toolName ?? ""),
        args: e.args,
        status: "running",
        startedAt: Date.now(),
      };
      return { ...state, tools: { ...state.tools, [id]: { ...run, partial: e.partialResult } } };
    }
    case "tool_execution_end": {
      const id = String(e.toolCallId);
      const run = state.tools[id] ?? {
        toolCallId: id,
        toolName: String(e.toolName),
        args: undefined,
        status: "running" as const,
        startedAt: Date.now(),
      };
      return {
        ...state,
        tools: {
          ...state.tools,
          [id]: { ...run, status: e.isError ? "error" : "done", result: e.result, endedAt: Date.now() },
        },
      };
    }
    case "queue_update":
      return {
        ...state,
        queue: {
          steering: (e.steering as readonly string[]) ?? [],
          followUp: (e.followUp as readonly string[]) ?? [],
        },
      };
    case "auto_retry_start":
      return {
        ...state,
        retry: {
          attempt: Number(e.attempt),
          maxAttempts: Number(e.maxAttempts),
          delayMs: Number(e.delayMs),
          errorMessage: String(e.errorMessage ?? ""),
        },
      };
    case "auto_retry_end":
      return {
        ...state,
        retry: null,
        errors:
          e.success === false
            ? [...state.errors, { at: Date.now(), source: "retry", message: String(e.finalError ?? "Retry failed") }]
            : state.errors,
      };
    case "compaction_start":
      return { ...state, compaction: { reason: String(e.reason) } };
    case "compaction_end":
      return {
        ...state,
        compaction: null,
        errors: e.errorMessage
          ? [...state.errors, { at: Date.now(), source: "compaction", message: String(e.errorMessage) }]
          : state.errors,
      };
    case "entry_appended": {
      const entry = e.entry as SessionEntry;
      if (!entry || state.byId[entry.id]) return state;
      return applyEntries(state, [entry], entry.parentId === state.leafId ? entry.id : state.leafId, "append");
    }
    case "extension_error":
      return {
        ...state,
        errors: [
          ...state.errors,
          { at: Date.now(), source: `extension ${String(e.extensionPath)} (${String(e.event)})`, message: String(e.error) },
        ],
      };
    default:
      return state;
  }
}

/**
 * Merge entries from `get_entries`. `append` adds entries after the cursor; `replace` resets
 * (used for the first load or when the cursor is no longer valid).
 */
export function applyEntries(
  state: TranscriptState,
  entries: readonly SessionEntry[],
  leafId: string | null,
  mode: "append" | "replace",
): TranscriptState {
  const byId: Record<string, SessionEntry> = mode === "replace" ? {} : { ...state.byId };
  const order: string[] = mode === "replace" ? [] : state.order.slice();
  const persisted = new Set<string>();
  for (const entry of entries) {
    if (!byId[entry.id]) order.push(entry.id);
    byId[entry.id] = entry;
    if (entry.type === "message") persisted.add(messageKey(entry.message as unknown as AnyMessage));
  }
  const last = entries.length > 0 ? entries[entries.length - 1] : undefined;
  const live = mode === "replace" ? [] : state.live.filter((m) => !persisted.has(messageKey(m)));
  return {
    ...state,
    // A full (re)load has no streaming events to learn usage from; take it from the persisted branch.
    lastUsage: mode === "replace" ? lastUsageOnBranch(byId, leafId) : state.lastUsage,
    byId,
    order,
    leafId,
    cursor: last ? last.id : mode === "replace" ? null : state.cursor,
    live,
    revision: state.revision + 1,
  };
}

/**
 * Usage of the last successful assistant message on the branch ending at `leafId` (what Pi uses for
 * context size). Returns null if a compaction happened after it, since that usage is then stale.
 */
function lastUsageOnBranch(byId: Record<string, SessionEntry>, leafId: string | null): UsageLike | null {
  const seen = new Set<string>();
  let id = leafId;
  while (id && !seen.has(id)) {
    seen.add(id);
    const entry = byId[id];
    if (!entry) break;
    if (entry.type === "compaction") return null;
    if (entry.type === "message") {
      const msg = entry.message as unknown as AnyMessage & { usage?: UsageLike; stopReason?: string };
      const u = msg.role === "assistant" ? msg.usage : undefined;
      if (u && msg.stopReason !== "aborted" && msg.stopReason !== "error") {
        const total = u.totalTokens || u.input + u.output + u.cacheRead + u.cacheWrite;
        if (total > 0) return { ...u, totalTokens: total };
      }
    }
    id = entry.parentId;
  }
  return null;
}

/** Entries on the active branch, root first (walks parentId from the leaf). */
export function activePath(state: TranscriptState): SessionEntry[] {
  const path: SessionEntry[] = [];
  const seen = new Set<string>();
  let id = state.leafId;
  while (id && !seen.has(id)) {
    seen.add(id);
    const entry = state.byId[id];
    if (!entry) break;
    path.push(entry);
    id = entry.parentId;
  }
  return path.reverse();
}

export interface ImageRef {
  mimeType: string;
  data: string;
}

export interface ToolResultView {
  toolCallId: string;
  toolName: string;
  isError: boolean;
  text: string;
  images: ImageRef[];
  details?: unknown;
}

export type TimelineItem =
  | { kind: "user"; key: string; text: string; images: ImageRef[]; timestamp?: number }
  | {
      kind: "assistant";
      key: string;
      blocks: AssistantBlock[];
      streaming: boolean;
      provider?: string;
      model?: string;
      stopReason?: string;
      errorMessage?: string;
      usage?: UsageLike;
    }
  | {
      kind: "bash";
      key: string;
      command: string;
      output: string;
      exitCode: number | undefined;
      cancelled: boolean;
      truncated: boolean;
    }
  | { kind: "custom"; key: string; customType: string; text: string; images: ImageRef[]; details?: unknown }
  | { kind: "summary"; key: string; variant: "compaction" | "branch"; summary: string; tokensBefore?: number }
  | { kind: "marker"; key: string; text: string }
  | { kind: "unknown"; key: string; label: string; raw: unknown };

export interface Timeline {
  items: TimelineItem[];
  toolResults: Record<string, ToolResultView>;
}

function contentText(content: unknown): { text: string; images: ImageRef[] } {
  if (typeof content === "string") return { text: content, images: [] };
  if (!Array.isArray(content)) return { text: "", images: [] };
  const texts: string[] = [];
  const images: ImageRef[] = [];
  for (const block of content as Array<Record<string, unknown>>) {
    if (block?.type === "text") texts.push(String(block.text ?? ""));
    else if (block?.type === "image") images.push({ mimeType: String(block.mimeType), data: String(block.data) });
  }
  return { text: texts.join("\n"), images };
}

function messageItem(message: AnyMessage, key: string, isFirstSystem: boolean): TimelineItem | null {
  switch (message.role) {
    case "user": {
      const { text, images } = contentText(message.content);
      return { kind: "user", key, text, images, ...(message.timestamp ? { timestamp: message.timestamp } : {}) };
    }
    case "assistant":
      return {
        kind: "assistant",
        key,
        blocks: normalizeBlocks(message.content),
        streaming: false,
        provider: message.provider as string,
        model: message.model as string,
        stopReason: message.stopReason as string,
        ...(message.errorMessage ? { errorMessage: String(message.errorMessage) } : {}),
        ...(message.usage ? { usage: message.usage as UsageLike } : {}),
      };
    case "toolResult":
      return null; // rendered inside its tool call
    case "bashExecution":
      return {
        kind: "bash",
        key,
        command: String(message.command ?? ""),
        output: String(message.output ?? ""),
        exitCode: message.exitCode as number | undefined,
        cancelled: message.cancelled === true,
        truncated: message.truncated === true,
      };
    case "custom": {
      if (message.display === false) return null;
      const { text, images } = contentText(message.content);
      return { kind: "custom", key, customType: String(message.customType ?? "custom"), text, images, details: message.details };
    }
    case "compactionSummary":
      return {
        kind: "summary",
        key,
        variant: "compaction",
        summary: String(message.summary ?? ""),
        tokensBefore: message.tokensBefore as number,
      };
    case "branchSummary":
      return { kind: "summary", key, variant: "branch", summary: String(message.summary ?? "") };
    case "system": {
      if (isFirstSystem) return null;
      const sections = Object.keys((message.sections as Record<string, unknown>) ?? {});
      const added = ((message.toolsAdded as Array<{ name: string }>) ?? []).map((t) => `+${t.name}`);
      const removed = ((message.toolsRemoved as Array<{ name: string }>) ?? []).map((t) => `-${t.name}`);
      const parts = [
        sections.length ? `sections: ${sections.join(", ")}` : "",
        [...added, ...removed].length ? `tools: ${[...added, ...removed].join(" ")}` : "",
      ].filter(Boolean);
      return { kind: "marker", key, text: `Instructions updated${parts.length ? ` (${parts.join("; ")})` : ""}` };
    }
    default:
      return { kind: "unknown", key, label: `message role "${message.role}"`, raw: message };
  }
}

function toolResultView(message: AnyMessage): ToolResultView {
  const { text, images } = contentText(message.content);
  return {
    toolCallId: String(message.toolCallId),
    toolName: String(message.toolName),
    isError: message.isError === true,
    text,
    images,
    details: message.details,
  };
}

/** Build the display timeline: active branch + live overlay + streaming message. */
export function buildTimeline(state: TranscriptState): Timeline {
  const items: TimelineItem[] = [];
  const toolResults: Record<string, ToolResultView> = {};
  let sawSystem = false;
  // Model / thinking-level changes are only shown once a message is actually sent after them.
  // Only the latest change of each kind is kept.
  const pendingChanges = new Map<"model" | "thinking", TimelineItem>();
  const flushPendingChanges = () => {
    for (const item of pendingChanges.values()) items.push(item);
    pendingChanges.clear();
  };
  const setPendingChange = (kind: "model" | "thinking", item: TimelineItem) => {
    pendingChanges.delete(kind); // re-insert so ordering follows the latest change
    pendingChanges.set(kind, item);
  };

  for (const entry of activePath(state)) {
    const key = entry.id;
    switch (entry.type) {
      case "message": {
        const message = entry.message as unknown as AnyMessage;
        if (message.role === "toolResult") toolResults[String(message.toolCallId)] = toolResultView(message);
        const isFirstSystem = message.role === "system" && !sawSystem;
        if (message.role === "system") sawSystem = true;
        const item = messageItem(message, key, isFirstSystem);
        if (item) {
          flushPendingChanges();
          items.push(item);
        }
        break;
      }
      case "model_change":
        setPendingChange("model", { kind: "marker", key, text: `Model → ${entry.provider}/${entry.modelId}` });
        break;
      case "thinking_level_change":
        setPendingChange("thinking", { kind: "marker", key, text: `Thinking → ${entry.thinkingLevel}` });
        break;
      case "compaction":
        items.push({
          kind: "summary",
          key,
          variant: "compaction",
          summary: entry.summary,
          tokensBefore: entry.tokensBefore,
        });
        break;
      case "branch_summary":
        items.push({ kind: "summary", key, variant: "branch", summary: entry.summary });
        break;
      case "custom_message": {
        if (!entry.display) break;
        const { text, images } = contentText(entry.content);
        items.push({ kind: "custom", key, customType: entry.customType, text, images, details: (entry as { details?: unknown }).details });
        break;
      }
      default:
        // custom, label, session_info, usage, context_edit: not part of the visible conversation.
        break;
    }
  }

  for (const message of state.live) {
    if (message.role === "toolResult") toolResults[String(message.toolCallId)] = toolResultView(message);
    const item = messageItem(message, `live:${messageKey(message)}`, false);
    if (item) {
      flushPendingChanges();
      items.push(item);
    }
  }

  if (state.streaming) {
    flushPendingChanges();
    const m = state.streaming.message;
    items.push({
      kind: "assistant",
      key: "streaming",
      blocks: m.content,
      streaming: true,
      provider: m.provider as string,
      model: m.model as string,
    });
  }

  return { items, toolResults };
}

/**
 * Builds a timeline from a standalone list of messages (e.g. from a subagent transcript).
 */
export function messagesToTimeline(messages: AnyMessage[], keyPrefix = "msg"): Timeline {
  const items: TimelineItem[] = [];
  const toolResults: Record<string, ToolResultView> = {};
  let idx = 0;
  for (const message of messages) {
    idx++;
    const key = `${keyPrefix}:${idx}:${messageKey(message)}`;
    if (message.role === "toolResult") {
      toolResults[String(message.toolCallId)] = toolResultView(message);
    }
    const item = messageItem(message, key, false);
    if (item) items.push(item);
  }
  return { items, toolResults };
}

export type ContextCategory = "system" | "user" | "assistant" | "thinking" | "tool" | "extension" | "summary";

/** A finer-grained slice inside a category (e.g. one skill inside "System prompt & tools"). */
export interface ContextBreakdownNode {
  key: string;
  label: string;
  tokens: number;
  /** Share of the whole context (not of the parent). */
  percentage: number;
  count?: number;
  detail?: string;
  children?: ContextBreakdownNode[];
}

export interface ContextCategoryBreakdown {
  /** Stable key (e.g. "system", "tool:bash"). */
  key: string;
  label: string;
  category: ContextCategory;
  tokens: number;
  percentage: number;
  /** Number of messages/blocks folded into this bucket (0 for pure overhead). */
  count: number;
  /** Optional finer split; children always sum to `tokens`. Absent when there is nothing to split. */
  children?: ContextBreakdownNode[];
}

/**
 * Optional description of what lives inside the system prompt, used to split the "System prompt &
 * tools" bucket. Sizes are chars/4 estimates; anything they don't explain becomes "Base prompt & other".
 */
export interface ContextSystemParts {
  skills?: Array<{ name: string; description?: string; filePath?: string }>;
  tools?: Array<{ name: string; description?: string; active?: boolean }>;
  /** Context files (AGENTS.md, SYSTEM.md…) already measured in characters. */
  contextFiles?: Array<{ label: string; path?: string; chars: number }>;
}

export interface ContextTopItem {
  label: string;
  detail?: string;
  category: ContextCategory;
  tokens: number;
}

export interface ContextBreakdownResult {
  totalTokens: number;
  /** True when the total comes from Pi's usage numbers rather than a local estimate. */
  isExact: boolean;
  /** Raw chars/4 estimate of the conversation messages alone (before reconciling with the total). */
  estimatedMessageTokens: number;
  messageCount: number;
  categories: ContextCategoryBreakdown[];
  topItems: ContextTopItem[];
}

/** Matches Pi's own heuristic (compaction.js ESTIMATED_IMAGE_CHARS). */
const ESTIMATED_IMAGE_CHARS = 4800;
const SYSTEM_LABEL = "System prompt & tools";

const toTokens = (chars: number) => Math.ceil(chars / 4);

function contentChars(content: unknown): number {
  if (typeof content === "string") return content.length;
  if (!Array.isArray(content)) return 0;
  let chars = 0;
  for (const block of content as Array<Record<string, unknown>>) {
    if (block?.type === "text") chars += String(block.text ?? "").length;
    else if (block?.type === "image") chars += ESTIMATED_IMAGE_CHARS;
  }
  return chars;
}

function imageChars(content: unknown): number {
  if (!Array.isArray(content)) return 0;
  return (content as Array<Record<string, unknown>>).filter((b) => b?.type === "image").length * ESTIMATED_IMAGE_CHARS;
}

function snippet(text: string, max = 48): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function argSummary(args: unknown): string | undefined {
  if (!args || typeof args !== "object") return undefined;
  const a = args as Record<string, unknown>;
  for (const k of ["path", "file_path", "command", "pattern", "url", "query", "description"]) {
    const v = a[k];
    if (typeof v === "string" && v) return snippet(v, 60);
  }
  return undefined;
}

/**
 * Messages currently in the model context: active branch (from the latest compaction's kept
 * point onward, plus its summary) + completed live messages + the streaming message.
 * Live sessions never receive `entry_appended`, so most of a running session lives in `state.live`.
 */
function contextMessages(state: TranscriptState): AnyMessage[] {
  const path = activePath(state);
  let start = 0;
  let summary: AnyMessage | null = null;
  for (let i = path.length - 1; i >= 0; i--) {
    const e = path[i]!;
    if (e.type === "compaction") {
      const kept = path.findIndex((p) => p.id === e.firstKeptEntryId);
      start = kept >= 0 && kept < i ? kept : i + 1;
      summary = { role: "compactionSummary", summary: e.summary };
      break;
    }
  }
  const out: AnyMessage[] = summary ? [summary] : [];
  for (const entry of path.slice(start)) {
    if (entry.type === "message") out.push(entry.message as unknown as AnyMessage);
    else if (entry.type === "branch_summary") out.push({ role: "branchSummary", summary: entry.summary });
    else if (entry.type === "custom_message")
      out.push({ role: "custom", customType: entry.customType, content: entry.content });
  }
  out.push(...state.live);
  if (state.streaming) out.push(state.streaming.message);
  return out;
}

/** JSON-schema scaffolding (parameters, types, required…) we can't see per tool; rough constant. */
const TOOL_SCHEMA_OVERHEAD_CHARS = 240;

interface RawNode {
  key: string;
  label: string;
  tokens: number;
  count?: number;
  detail?: string;
  children?: RawNode[];
}

/**
 * Normalises `nodes` so their (rounded) tokens sum to exactly `target`, recursing into children.
 * Largest-first; the exact sum is preserved. Returns [] when fewer than `minNodes` survive.
 */
function fitNodes(nodes: RawNode[], target: number, total: number, minNodes = 1): ContextBreakdownNode[] {
  const live = nodes.filter((n) => n.tokens > 0);
  const sum = live.reduce((a, n) => a + n.tokens, 0);
  if (live.length === 0 || sum <= 0 || target <= 0) return [];
  const sorted = [...live].sort((a, b) => b.tokens - a.tokens);
  // Largest-remainder apportionment: floor everything, hand leftover units to the biggest fractions.
  const exact = sorted.map((n) => (n.tokens * target) / sum);
  const targets = exact.map(Math.floor);
  let left = target - targets.reduce((a, t) => a + t, 0);
  const byFraction = exact.map((x, i) => ({ i, frac: x - Math.floor(x) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of byFraction) {
    if (left <= 0) break;
    targets[i]! += 1;
    left -= 1;
  }
  const out: ContextBreakdownNode[] = [];
  sorted.forEach((n, i) => {
    const t = targets[i]!;
    if (t <= 0) return;
    const kids = n.children?.length ? fitNodes(n.children, t, total) : [];
    out.push({
      key: n.key,
      label: n.label,
      tokens: t,
      percentage: total > 0 ? (t / total) * 100 : 0,
      ...(n.count != null ? { count: n.count } : {}),
      ...(n.detail ? { detail: n.detail } : {}),
      ...(kids.length > 0 ? { children: kids } : {}),
    });
  });
  return out.length >= minNodes ? out : [];
}

const sumTokens = (nodes: RawNode[]) => nodes.reduce((a, n) => a + n.tokens, 0);

/** Estimated token cost of each known piece of the system prompt (unscaled, before reconciling). */
const partNodesCache = new WeakMap<ContextSystemParts, RawNode[]>();

function systemPartNodes(parts: ContextSystemParts): RawNode[] {
  const cached = partNodesCache.get(parts);
  if (cached) return cached;
  const groups: RawNode[] = [];

  const skills: RawNode[] = (parts.skills ?? []).map((s, i) => ({
    key: `system:skill:${i}:${s.name}`,
    label: s.name,
    // Mirrors the <skill> entry Pi injects: name + description + location.
    tokens: toTokens(
      `<skill><name>${s.name}</name><description>${s.description ?? ""}</description><location>${s.filePath ?? ""}</location></skill>`
        .length,
    ),
    ...(s.description ? { detail: snippet(s.description, 80) } : {}),
  }));
  if (skills.length > 0) {
    groups.push({ key: "system:skills", label: "Skills", tokens: sumTokens(skills), count: skills.length, children: skills });
  }

  const tools: RawNode[] = (parts.tools ?? [])
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => t.active !== false)
    .map(({ t, i }) => ({
      key: `system:tool:${i}:${t.name}`,
      label: t.name,
      // Listed once in the prompt and once as a schema (name + description + parameter scaffolding).
      tokens: toTokens((t.name.length + (t.description?.length ?? 0)) * 2 + TOOL_SCHEMA_OVERHEAD_CHARS),
      ...(t.description ? { detail: snippet(t.description, 80) } : {}),
    }));
  if (tools.length > 0) {
    groups.push({ key: "system:tools", label: "Tool definitions", tokens: sumTokens(tools), count: tools.length, children: tools });
  }

  const files: RawNode[] = (parts.contextFiles ?? [])
    .map((f, i) => ({ f, i }))
    .filter(({ f }) => f.chars > 0)
    .map(({ f, i }) => ({
      key: `system:file:${i}:${f.path ?? f.label}`,
      label: f.label,
      tokens: toTokens(f.chars),
      ...(f.path ? { detail: f.path } : {}),
    }));
  if (files.length > 0) {
    groups.push({ key: "system:files", label: "Context files", tokens: sumTokens(files), count: files.length, children: files });
  }
  partNodesCache.set(parts, groups);
  return groups;
}

/**
 * Splits the context window by source. Message sizes are chars/4 estimates (same heuristic as Pi).
 * When `exactTotalTokens` is known (get_session_stats.contextUsage / last usage), whatever the
 * messages don't explain is attributed to the system prompt + tool definitions (which never appear
 * as messages); if the messages over-estimate, they are scaled down to fit the total.
 */
export function estimateContextBreakdown(
  state: TranscriptState,
  exactTotalTokens?: number | null,
  systemParts?: ContextSystemParts | null,
): ContextBreakdownResult {
  type Bucket = {
    label: string;
    category: ContextCategory;
    tokens: number;
    count: number;
    subs: Map<string, RawNode>;
  };
  const buckets = new Map<string, Bucket>();
  const add = (
    key: string,
    label: string,
    category: ContextCategory,
    tokens: number,
    sub?: { key: string; label: string },
    /** False for the 2nd+ part of one message, so the message is only counted once. */
    bump = true,
  ) => {
    if (tokens <= 0) return;
    const b = buckets.get(key) ?? { label, category, tokens: 0, count: 0, subs: new Map<string, RawNode>() };
    b.tokens += tokens;
    if (bump) b.count += 1;
    if (sub) {
      const n = b.subs.get(sub.key) ?? { key: `${key}:${sub.key}`, label: sub.label, tokens: 0, count: 0 };
      n.tokens += tokens;
      if (bump) n.count = (n.count ?? 0) + 1;
      b.subs.set(sub.key, n);
    }
    buckets.set(key, b);
  };
  const top: ContextTopItem[] = [];
  const callArgs = new Map<string, string | undefined>();

  const messages = contextMessages(state);
  for (const msg of messages) {
    switch (msg.role) {
      case "system": {
        let chars = contentChars(msg.content);
        for (const s of Object.values((msg.sections as Record<string, string | undefined>) ?? {})) chars += s?.length ?? 0;
        if (msg.toolsAdded) chars += JSON.stringify(msg.toolsAdded).length;
        add("system", SYSTEM_LABEL, "system", toTokens(chars));
        break;
      }
      case "user": {
        const imgChars = imageChars(msg.content);
        const t = toTokens(contentChars(msg.content));
        add("user", "Your messages", "user", toTokens(contentChars(msg.content) - imgChars), { key: "text", label: "Text" });
        add("user", "Your messages", "user", toTokens(imgChars), { key: "images", label: "Images / attachments" }, toTokens(contentChars(msg.content) - imgChars) <= 0);
        top.push({ label: "You", detail: snippet(contentText(msg.content).text) || "(attachment)", category: "user", tokens: t });
        break;
      }
      case "assistant": {
        let text = 0;
        let thinking = 0;
        let firstText = "";
        for (const block of normalizeBlocks(msg.content)) {
          if (block.type === "text") {
            text += block.text.length;
            if (!firstText.trim()) firstText = block.text;
          } else if (block.type === "thinking") {
            thinking += block.thinking.length;
          } else if (block.type === "toolCall") {
            const argChars = block.argsText?.length || JSON.stringify(block.arguments ?? {}).length;
            callArgs.set(block.id, argSummary(block.arguments));
            add(`tool:${block.name}`, `Tool · ${block.name}`, "tool", toTokens(block.name.length + argChars), {
              key: "calls",
              label: "Calls (arguments)",
            });
          }
        }
        add("assistant", "Assistant replies", "assistant", toTokens(text));
        add("thinking", "Reasoning", "thinking", toTokens(thinking));
        if (text > 0) top.push({ label: "Assistant", detail: snippet(firstText), category: "assistant", tokens: toTokens(text) });
        if (thinking > 0) top.push({ label: "Reasoning", category: "thinking", tokens: toTokens(thinking) });
        break;
      }
      case "toolResult": {
        const name = String(msg.toolName || "tool");
        const t = toTokens(contentChars(msg.content));
        add(`tool:${name}`, `Tool · ${name}`, "tool", t, { key: "results", label: "Results (output)" });
        const detail = callArgs.get(String(msg.toolCallId));
        top.push({ label: name, ...(detail ? { detail } : {}), category: "tool", tokens: t });
        break;
      }
      case "bashExecution": {
        const cmdTokens = toTokens(String(msg.command ?? "").length);
        const t = toTokens(String(msg.command ?? "").length + String(msg.output ?? "").length);
        const outTokens = Math.max(0, t - cmdTokens); // parts sum to the original total
        add("tool:bash", "Tool · bash", "tool", cmdTokens, { key: "calls", label: "Calls (arguments)" });
        add("tool:bash", "Tool · bash", "tool", outTokens, { key: "results", label: "Results (output)" }, cmdTokens <= 0);
        top.push({ label: "bash", detail: snippet(String(msg.command ?? "")), category: "tool", tokens: t });
        break;
      }
      case "custom": {
        const t = toTokens(contentChars(msg.content));
        const ext = String(msg.customType ?? "extension");
        add("extension", "Extension messages", "extension", t, { key: ext, label: ext });
        top.push({ label: String(msg.customType ?? "extension"), category: "extension", tokens: t });
        break;
      }
      case "compactionSummary":
      case "branchSummary": {
        const t = toTokens(String(msg.summary ?? "").length);
        add("summary", "Summaries", "summary", t, {
          key: msg.role === "compactionSummary" ? "compaction" : "branch",
          label: msg.role === "compactionSummary" ? "Compaction summary" : "Branch summary",
        });
        top.push({
          label: msg.role === "compactionSummary" ? "Compaction summary" : "Branch summary",
          category: "summary",
          tokens: t,
        });
        break;
      }
      default:
        break;
    }
  }

  const estimated = [...buckets.values()].reduce((acc, b) => acc + b.tokens, 0);
  const isExact = typeof exactTotalTokens === "number" && exactTotalTokens > 0;
  const partNodes = systemParts ? systemPartNodes(systemParts) : [];
  const partsTokens = sumTokens(partNodes);
  const newSystemBucket = (): Bucket => ({
    label: SYSTEM_LABEL,
    category: "system",
    tokens: 0,
    count: 0,
    subs: new Map<string, RawNode>(),
  });
  // Without Pi's exact total there's no residual to subdivide, so count the known parts directly.
  const total = isExact ? (exactTotalTokens as number) : estimated + partsTokens;

  let scale = 1;
  if (isExact) {
    if (total >= estimated) {
      const overhead = total - estimated;
      if (overhead > 0) {
        const sys = buckets.get("system") ?? newSystemBucket();
        sys.tokens += overhead;
        buckets.set("system", sys);
      }
    } else {
      scale = total / estimated;
    }
  } else if (partsTokens > 0) {
    const sys = buckets.get("system") ?? newSystemBucket();
    sys.tokens += partsTokens;
    buckets.set("system", sys);
  }

  const categories: ContextCategoryBreakdown[] = [...buckets.entries()]
    .map(([key, b]) => ({
      key,
      label: b.label,
      category: b.category,
      count: b.count,
      tokens: Math.round(b.tokens * scale),
      percentage: 0,
    }))
    .filter((c) => c.tokens > 0)
    .sort((a, b) => b.tokens - a.tokens);

  // Make the rounded parts sum exactly to the total.
  const drift = total - categories.reduce((acc, c) => acc + c.tokens, 0);
  if (categories.length > 0 && drift !== 0) categories[0]!.tokens += drift;
  for (const c of categories) c.percentage = total > 0 ? (c.tokens / total) * 100 : 0;

  // Finer split. Children are normalised to the category's final tokens, so they always sum to it.
  for (const c of categories) {
    let raw: RawNode[];
    if (c.key === "system") {
      raw = [...partNodes];
      const remainder = c.tokens - partsTokens;
      // Whatever the known parts don't explain: the base prompt, guidelines, estimation error.
      if (remainder > 0) raw.push({ key: "system:base", label: "Base prompt & other", tokens: remainder });
    } else {
      raw = [...(buckets.get(c.key)?.subs.values() ?? [])];
    }
    const kids = fitNodes(raw, c.tokens, total, c.key === "system" && partNodes.length > 0 ? 1 : 2);
    if (kids.length > 0) c.children = kids;
  }

  const topItems = top
    .filter((t) => t.tokens > 0)
    .map((t) => ({ ...t, tokens: Math.max(1, Math.round(t.tokens * scale)) }))
    .sort((a, b) => b.tokens - a.tokens)
    .slice(0, 6);

  return {
    totalTokens: total,
    isExact,
    estimatedMessageTokens: estimated,
    messageCount: messages.length,
    categories,
    topItems,
  };
}
