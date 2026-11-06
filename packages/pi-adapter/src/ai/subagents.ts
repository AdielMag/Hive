import type { AnyMessage, AssistantBlock, Timeline, ToolResultView, ToolRun } from "../transcript.ts";

export const SUBAGENT_TOOL_NAMES = new Set(["Agent", "SubagentWorkflow", "subagent"]);

export function isSubagentTool(name?: string | null): boolean {
  return typeof name === "string" && SUBAGENT_TOOL_NAMES.has(name);
}

/**
 * Returns the unified `subagent` tool details only when `results` is a real array.
 * Legacy `Agent` details are plain objects and must not be mistaken for this shape.
 */
export function getSubagentDetails(raw: unknown): SubagentDetails | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const results = (raw as { results?: unknown }).results;
  if (!Array.isArray(results)) return undefined;
  return raw as SubagentDetails;
}

/** First non-empty line, capped so multi-paragraph task text doesn't become a card title. */
function firstLine(text: string, max = 80): string {
  const line = text.split(/\r?\n/).find((l) => l.trim().length > 0)?.trim() ?? "";
  return line.length > max ? `${line.slice(0, max - 1)}\u2026` : line;
}

export interface SingleSubagentResult {
  agent: string;
  agentSource?: "user" | "project" | "unknown";
  task: string;
  exitCode: number;
  messages: AnyMessage[];
  stderr?: string;
  usage?: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    cost?: number;
    contextTokens?: number;
    turns?: number;
  };
  model?: string;
  stopReason?: string;
  errorMessage?: string;
  step?: number;
  retriedWith?: string;
  firstError?: string;
}

export interface SubagentDetails {
  mode: "single" | "parallel" | "chain";
  agentScope?: string;
  projectAgentsDir?: string | null;
  results: SingleSubagentResult[];
}

export interface AgentDetails {
  displayName?: string;
  description: string;
  subagentType: string;
  toolUses?: number;
  tokens?: string;
  totalTokens?: number;
  cost?: number;
  turnCount?: number;
  maxTurns?: number;
  durationMs?: number;
  status: "queued" | "running" | "completed" | "steered" | "aborted" | "stopped" | "error" | "background";
  activity?: string;
  spinnerFrame?: number;
  modelName?: string;
  tags?: string[];
  agentId?: string;
  error?: string;
}

export interface NotificationDetails {
  id: string;
  description: string;
  status: string;
  toolUses?: number;
  turnCount?: number;
  maxTurns?: number;
  totalTokens?: number;
  totalCost?: number;
  durationMs?: number;
  outputFile?: string;
  error?: string;
  resultPreview?: string;
  others?: NotificationDetails[];
}

export interface SubagentView {
  toolCallId: string;
  /** True for the pi `subagent` tool: synchronous, no stop RPC, `agentId` is the call id. */
  unified?: boolean;
  agentId?: string;
  /** Real runner id (never the `name` arg fallback); required to stop the agent. */
  stopId?: string;
  outputFile?: string;
  type: string;
  description: string;
  prompt: string;
  model?: string;
  thinking?: string;
  tags: string[];
  background: boolean;
  status: "queued" | "running" | "completed" | "steered" | "aborted" | "stopped" | "error" | "background";
  activity?: string;
  toolUses?: number;
  turns?: number;
  maxTurns?: number;
  tokens?: string;
  totalTokens?: number;
  cost?: number;
  durationMs?: number;
  error?: string;
  resultText?: string;
  subagentDetails?: SubagentDetails;
  messages?: AnyMessage[];
}

/**
 * Parses numeric token count from a number or string (e.g. "17.1k token", "25k", "1,500").
 */
export function parseTokenCount(tokens: unknown): number | undefined {
  if (typeof tokens === "number" && Number.isFinite(tokens)) return tokens;
  if (typeof tokens !== "string" || !tokens.trim()) return undefined;
  const t = tokens.trim().toLowerCase();
  const m = t.match(/^([\d.,]+)\s*([km])?/i);
  if (!m) return undefined;
  const numVal = parseFloat(m[1]!.replace(/,/g, ""));
  if (!Number.isFinite(numVal)) return undefined;
  const unit = m[2]?.toLowerCase();
  if (unit === "k") return Math.round(numVal * 1_000);
  if (unit === "m") return Math.round(numVal * 1_000_000);
  return Math.round(numVal);
}

/**
 * Parses `Agent ID: <id>` and `Output file: <path>` from tool result text.
 */
export function parseAgentResultText(text: string): { agentId?: string; outputFile?: string } {
  if (!text || typeof text !== "string") return {};
  const idMatch = text.match(/(?:Agent ID|Task ID):\s*(\S+)/i);
  const outMatch = text.match(/(?:Output file|Script):\s*(.+)/i);
  return {
    agentId: idMatch?.[1]?.trim(),
    outputFile: outMatch?.[1]?.trim(),
  };
}

/**
 * Parses `Agent: <id>` and `Status: <status>` from `get_subagent_result` output text.
 */
export function parseGetResultText(text: string): { agentId?: string; status?: string } {
  if (!text || typeof text !== "string") return {};
  const idMatch = text.match(/^Agent:\s*(\S+)/m);
  const statusMatch = text.match(/Status:\s*(\w+)/i);
  return {
    agentId: idMatch?.[1]?.trim(),
    status: statusMatch?.[1]?.trim().toLowerCase(),
  };
}

export interface SubagentIndex {
  notifications: Map<string, { details: NotificationDetails; itemKey: string }>;
  results: Map<string, { status: string; toolCallId: string }>;
  cards: Map<string, string>;
}

/**
 * Scans timeline to index background notifications, get_subagent_result outcomes,
 * and mapping of agentId to toolCallId.
 */
export function indexSubagents(timeline: Timeline): SubagentIndex {
  const notifications = new Map<string, { details: NotificationDetails; itemKey: string }>();
  const results = new Map<string, { status: string; toolCallId: string }>();
  const cards = new Map<string, string>();

  // Helper to register notification details (including flattend 'others')
  const registerNotification = (d: NotificationDetails, itemKey: string) => {
    if (d?.id) {
      notifications.set(d.id, { details: d, itemKey });
    }
    if (Array.isArray(d?.others)) {
      for (const other of d.others) {
        if (other?.id) {
          notifications.set(other.id, { details: other, itemKey });
        }
      }
    }
  };

  for (const item of timeline.items) {
    if (item.kind === "custom" && item.customType === "subagent-notification") {
      const details = item.details as NotificationDetails | undefined;
      if (details) {
        registerNotification(details, item.key);
      }
    } else if (item.kind === "assistant") {
      for (const block of item.blocks) {
        if (block.type === "toolCall") {
          const res = timeline.toolResults[block.id];
          if (isSubagentTool(block.name)) {
            if (block.name === "subagent") {
              // Keyed by call id: agent names repeat across calls, so they can't identify a run.
              cards.set(block.id, block.id);
              continue;
            }
            const parsed = parseAgentResultText(res?.text ?? "");
            const details = res?.details as AgentDetails | { taskId?: string } | undefined;
            const agentId =
              (details && "agentId" in details && typeof details.agentId === "string" ? details.agentId : undefined) ||
              (details && "taskId" in details && typeof details.taskId === "string" ? details.taskId : undefined) ||
              parsed.agentId;
            if (agentId) {
              cards.set(agentId, block.id);
            }
          } else if (block.name === "get_subagent_result") {
            const parsed = parseGetResultText(res?.text ?? "");
            const argId = typeof block.arguments?.agent_id === "string" ? block.arguments.agent_id : undefined;
            const agentId = parsed.agentId || argId;
            if (agentId && parsed.status) {
              results.set(agentId, { status: parsed.status, toolCallId: block.id });
            }
          }
        }
      }
    }
  }

  return { notifications, results, cards };
}

/** Counts tool calls made by the subagent (one per assistant toolCall part; results are not double-counted). */
function countToolUsesInMessages(messages?: AnyMessage[]): number {
  if (!messages || !Array.isArray(messages)) return 0;
  let count = 0;
  for (const msg of messages) {
    if (msg.role !== "assistant" || !Array.isArray(msg.content)) continue;
    for (const part of msg.content) {
      if (part && typeof part === "object" && (part as { type?: string }).type === "toolCall") count++;
    }
  }
  return count;
}

function countTurnsInMessages(messages?: AnyMessage[]): number {
  if (!messages || !Array.isArray(messages)) return 0;
  return messages.filter((m) => m.role === "assistant").length;
}

/** Describes the latest step of a running subagent, looking only at the most recent assistant message. */
function describeSubagentActivity(result?: SingleSubagentResult): string | undefined {
  if (!result) return undefined;
  const fallback = result.agent ? `Running ${result.agent}...` : undefined;
  const last = [...(result.messages ?? [])].reverse().find((m) => m?.role === "assistant");
  if (!last || !Array.isArray(last.content)) return fallback;
  const toolCalls = last.content.filter(
    (p): p is { type: "toolCall"; name?: string } =>
      Boolean(p) && typeof p === "object" && (p as { type?: string }).type === "toolCall",
  );
  const lastTool = toolCalls[toolCalls.length - 1];
  return lastTool?.name ? `Using ${lastTool.name}...` : fallback;
}

/**
 * Resolves all metadata and live updates for a subagent tool call into a SubagentView.
 */
export function resolveSubagentView(params: {
  block: AssistantBlock & { type: "toolCall" };
  run?: ToolRun;
  result?: ToolResultView;
  subagentIndex?: SubagentIndex;
  /** Whether the owning session is currently executing (used to interpret a call with no result and no live run). */
  sessionRunning?: boolean;
}): SubagentView {
  const { block, run, result, subagentIndex, sessionRunning } = params;
  const args = block.arguments ?? {};

  // Extract raw details from first available source
  const rawDetails =
    result?.details ||
    (run?.result as { details?: unknown } | undefined)?.details ||
    (run?.partial as { details?: unknown } | undefined)?.details;

  const subagentDetails = getSubagentDetails(rawDetails);
  const legacyDetails = subagentDetails ? undefined : (rawDetails as AgentDetails | undefined);

  const parsed = parseAgentResultText(result?.text ?? "");
  const taskId = typeof (result?.details as { taskId?: unknown } | undefined)?.taskId === "string"
    ? (result?.details as { taskId: string }).taskId
    : undefined;

  const isSubagentToolCall = block.name === "subagent";
  // The pi `subagent` tool runs synchronously and has no stop RPC, so it gets no stopId.
  const stopId = isSubagentToolCall ? undefined : legacyDetails?.agentId || taskId || parsed.agentId;
  // Unique per call: agent names repeat across calls and would collide in tab/card indexes.
  const agentId = isSubagentToolCall ? block.id : stopId || (typeof args.name === "string" ? args.name : undefined);
  const outputFile = parsed.outputFile;

  let subagentType = (legacyDetails?.subagentType || args.subagent_type || block.name) as string;
  let description = (legacyDetails?.description || args.description || (block.name === "SubagentWorkflow" ? "Workflow" : "Subagent")) as string;
  let prompt = (args.prompt as string) || (typeof args.script === "string" ? args.script : "");

  if (isSubagentToolCall || subagentDetails) {
    if (args.chain || subagentDetails?.mode === "chain") {
      const chainItems = (Array.isArray(args.chain) ? args.chain : []) as Array<{ agent?: string; task?: string }>;
      subagentType =
        subagentDetails?.results?.map((r) => r.agent).filter(Boolean).join(" → ") ||
        (chainItems.length > 0 ? chainItems.map((c) => c.agent).filter(Boolean).join(" → ") : "chain");
      description = subagentDetails?.results?.length
        ? `${subagentDetails.results.length} chain steps`
        : chainItems.length
        ? `${chainItems.length} chain steps`
        : "Chain";
      prompt = chainItems.length
        ? chainItems.map((c, i) => `Step ${i + 1} [${c.agent}]: ${c.task}`).join("\n\n")
        : "";
    } else if (args.tasks || subagentDetails?.mode === "parallel") {
      const taskItems = (Array.isArray(args.tasks) ? args.tasks : []) as Array<{ agent?: string; task?: string }>;
      subagentType =
        subagentDetails?.results?.map((r) => r.agent).filter(Boolean).join(", ") ||
        (taskItems.length > 0 ? taskItems.map((t) => t.agent).filter(Boolean).join(", ") : "parallel");
      description = subagentDetails?.results?.length
        ? `${subagentDetails.results.length} parallel tasks`
        : taskItems.length
        ? `${taskItems.length} parallel tasks`
        : "Parallel";
      prompt = taskItems.length
        ? taskItems.map((t) => `[${t.agent}]: ${t.task}`).join("\n\n")
        : "";
    } else {
      const firstResult = subagentDetails?.results?.[0];
      subagentType = firstResult?.agent || (typeof args.agent === "string" ? args.agent : subagentType);
      description = firstLine(firstResult?.task || (typeof args.task === "string" ? args.task : description));
      prompt = (typeof args.task === "string" ? args.task : firstResult?.task) || prompt;
    }
  }

  const isWorkflow = block.name === "SubagentWorkflow";
  // `subagent` is synchronous: its result text is the agent's answer, so never infer background from it.
  const isBackgroundSpawn =
    !isSubagentToolCall && (
      isWorkflow ||
      args.run_in_background === true ||
      (args.run_in_background === undefined && (legacyDetails?.status === "background" || /in background/i.test(result?.text ?? "")))
    );
  const background = isBackgroundSpawn;

  // Model & thinking
  const model = subagentDetails?.results?.find((r) => r.model)?.model || legacyDetails?.modelName || (args.model as string | undefined);
  let thinking = args.thinking as string | undefined;
  const allTags: string[] = [...(legacyDetails?.tags ?? [])];
  const isThinkingTag = (t: string) => t.toLowerCase().startsWith("thinking:");
  if (!thinking) {
    const thinkingTag = allTags.find(isThinkingTag);
    if (thinkingTag) {
      thinking = thinkingTag.slice("thinking:".length).trim();
    }
  }
  const tags = allTags.filter((t) => !isThinkingTag(t));

  const hasFinished = !!(agentId && (subagentIndex?.notifications.has(agentId) || subagentIndex?.results.has(agentId)));
  const fallbackStatus: SubagentView["status"] = result
    ? result.isError
      ? "error"
      : isBackgroundSpawn && !hasFinished
        ? "background"
        : "completed"
    : run
      ? run.status === "running" ? "running" : run.status === "error" ? "error" : "completed"
      : sessionRunning === false && block.complete !== false
        ? "aborted"
        : "running";

  let status = (legacyDetails?.status ?? fallbackStatus) as SubagentView["status"];
  let toolUses = legacyDetails?.toolUses;
  let turns = legacyDetails?.turnCount;
  let maxTurns = legacyDetails?.maxTurns ?? (typeof args.max_turns === "number" ? args.max_turns : undefined);
  let tokens = legacyDetails?.tokens;
  const rawResult = result as unknown as { usage?: { totalTokens?: number } } | undefined;
  let totalTokens: number | undefined =
    typeof legacyDetails?.totalTokens === "number"
      ? legacyDetails.totalTokens
      : typeof rawResult?.usage?.totalTokens === "number"
      ? rawResult.usage.totalTokens
      : parseTokenCount(tokens);
  let cost = legacyDetails?.cost;
  let durationMs = legacyDetails?.durationMs;
  let error = legacyDetails?.error || (result?.isError ? result.text : undefined);
  let activity = legacyDetails?.activity;
  let messages: AnyMessage[] | undefined;

  if (subagentDetails && Array.isArray(subagentDetails.results)) {
    const resList = subagentDetails.results;
    cost = resList.reduce((acc, r) => acc + (r.usage?.cost ?? 0), 0);
    totalTokens = resList.reduce(
      (acc, r) => acc + (r.usage?.input ?? 0) + (r.usage?.output ?? 0) + (r.usage?.cacheRead ?? 0) + (r.usage?.cacheWrite ?? 0),
      0,
    );
    if (totalTokens > 0) {
      tokens = totalTokens >= 1000 ? `${Math.round(totalTokens / 1000)}k` : String(totalTokens);
    }
    toolUses = resList.reduce((acc, r) => acc + countToolUsesInMessages(r.messages), 0);
    turns = resList.reduce((acc, r) => acc + (r.usage?.turns ?? countTurnsInMessages(r.messages)), 0);

    const anyRunning = resList.some((r) => r.exitCode === -1);
    const anyFailed = resList.some((r) => r.errorMessage || (r.exitCode !== 0 && r.exitCode !== -1));
    const firstErr = resList.find((r) => r.errorMessage)?.errorMessage || resList.find((r) => r.stderr)?.stderr;
    if (firstErr) error = firstErr;

    // A final result is authoritative: a placeholder exitCode -1 must not keep the call spinning.
    if (!result && run?.status !== "error" && (anyRunning || run?.status === "running")) {
      status = "running";
      const runningRes = resList.find((r) => r.exitCode === -1) || resList[0];
      activity = describeSubagentActivity(runningRes);
    } else if (result?.isError || anyFailed || (run && run.status === "error")) {
      status = "error";
    } else if (result || (resList.length > 0 && resList.every((r) => r.exitCode === 0))) {
      status = "completed";
    } else if (sessionRunning === false && block.complete !== false) {
      status = "aborted";
    } else {
      status = "running";
    }

    messages = subagentDetails.mode === "single" ? resList[0]?.messages ?? [] : resList.flatMap((r) => r.messages ?? []);
  }

  // Check background completion notification
  if (agentId && subagentIndex?.notifications.has(agentId)) {
    const notif = subagentIndex.notifications.get(agentId)!.details;
    status = (notif.status.toLowerCase() as SubagentView["status"]) || "completed";
    if (typeof notif.toolUses === "number") toolUses = notif.toolUses;
    if (typeof notif.turnCount === "number") turns = notif.turnCount;
    if (typeof notif.maxTurns === "number") maxTurns = notif.maxTurns;
    if (typeof notif.totalCost === "number") cost = notif.totalCost;
    if (typeof notif.durationMs === "number") durationMs = notif.durationMs;
    if (typeof notif.totalTokens === "number") {
      totalTokens = notif.totalTokens;
      tokens = `${Math.round(notif.totalTokens / 1000)}k`;
    }
    if (notif.error) error = notif.error;
  } else if (agentId && subagentIndex?.results.has(agentId)) {
    // Check get_subagent_result outcome
    const getRes = subagentIndex.results.get(agentId)!;
    status = (getRes.status as SubagentView["status"]) || status;
  }

  return {
    toolCallId: block.id,
    unified: isSubagentToolCall,
    agentId,
    stopId,
    outputFile,
    type: subagentType,
    description,
    prompt,
    model,
    thinking,
    tags,
    background,
    status,
    activity,
    toolUses,
    turns,
    maxTurns,
    tokens,
    totalTokens,
    cost,
    durationMs,
    error,
    resultText: result?.text,
    subagentDetails,
    messages,
  };
}

/**
 * Parses raw lines from a subagent `.output` JSONL file into user prompt and messages.
 */
export function parseOutputLines(lines: unknown[]): { prompt?: string; messages: AnyMessage[] } {
  const messages: AnyMessage[] = [];
  let prompt: string | undefined;

  for (const line of lines) {
    if (!line || typeof line !== "object") continue;
    const entry = line as Record<string, unknown>;

    // Subagent JSONL wrapper entry: { isSidechain: true, agentId, type, message, ... }
    if (entry.message && typeof entry.message === "object") {
      const msg = entry.message as AnyMessage;
      if (!prompt && msg.role === "user" && typeof msg.content === "string") {
        prompt = msg.content;
      }
      messages.push(msg);
    } else if (typeof entry.role === "string") {
      // Direct AnyMessage
      const msg = entry as unknown as AnyMessage;
      if (!prompt && msg.role === "user" && typeof msg.content === "string") {
        prompt = msg.content;
      }
      messages.push(msg);
    }
  }

  return { prompt, messages };
}

/**
 * Determines whether any subagents or workflows in the timeline are currently running in the background.
 */
export function hasActiveSubagents(timeline: Timeline): boolean {
  const index = indexSubagents(timeline);
  for (const item of timeline.items) {
    if (item.kind !== "assistant") continue;
    for (const block of item.blocks) {
      if (block.type !== "toolCall") continue;
      if (!isSubagentTool(block.name)) continue;
      const res = timeline.toolResults[block.id];
      if (!res) return true;
      if (res.isError) continue;
      const view = resolveSubagentView({ block, result: res, subagentIndex: index });
      if (view.status === "running" || view.status === "queued" || view.status === "background") {
        return true;
      }
    }
  }
  return false;
}

/**
 * Collects all subagents on a timeline, resolved via `resolveSubagentView`.
 */
export function collectSubagents(timeline: Timeline, sessionRunning?: boolean): SubagentView[] {
  const subagentIndex = indexSubagents(timeline);
  const list: SubagentView[] = [];

  for (const item of timeline.items) {
    if (item.kind !== "assistant") continue;
    for (const block of item.blocks) {
      if (block.type !== "toolCall") continue;
      if (isSubagentTool(block.name)) {
        const res = timeline.toolResults[block.id];
        const view = resolveSubagentView({ block, result: res, subagentIndex, sessionRunning });
        list.push(view);
      }
    }
  }

  return list;
}

export interface SubagentSummary {
  totalCost: number;
  totalTokens: number;
  totalToolUses: number;
  totalTurns: number;
  count: number;
  activeCount: number;
  completedCount: number;
  failedCount: number;
}

/**
 * Aggregates summary statistics over a collection of subagents.
 */
export function summarizeSubagents(agents: SubagentView[]): SubagentSummary {
  let totalCost = 0;
  let totalTokens = 0;
  let totalToolUses = 0;
  let totalTurns = 0;
  let activeCount = 0;
  let completedCount = 0;
  let failedCount = 0;

  for (const a of agents) {
    if (typeof a.cost === "number" && Number.isFinite(a.cost)) {
      totalCost += a.cost;
    }
    const t = a.totalTokens ?? parseTokenCount(a.tokens);
    if (typeof t === "number" && Number.isFinite(t)) {
      totalTokens += t;
    }
    if (typeof a.toolUses === "number") {
      totalToolUses += a.toolUses;
    }
    if (typeof a.turns === "number") {
      totalTurns += a.turns;
    }

    if (a.status === "running" || a.status === "queued" || a.status === "background") {
      activeCount++;
    } else if (a.status === "completed" || a.status === "steered") {
      completedCount++;
    } else {
      failedCount++;
    }
  }

  return {
    totalCost,
    totalTokens,
    totalToolUses,
    totalTurns,
    count: agents.length,
    activeCount,
    completedCount,
    failedCount,
  };
}
