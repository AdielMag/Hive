/**
 * Conversation view. Performance notes:
 *  - the timeline is rebuilt only when the transcript revision changes (useMemo),
 *  - settled rows are memoized on a cheap signature, so streaming re-renders just the live message,
 *  - auto-scroll only pins to the bottom when the user is already there (no fighting manual scrolling).
 */
import React, { createContext, memo, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowDown,
  Bot,
  Brain,
  Check,
  CheckCircle2,
  ChevronRight,
  Copy,
  FilePlus2,
  FileText,
  FolderTree,
  Globe,
  Loader2,
  PencilLine,
  RotateCcw,
  Search,
  Sparkles,
  Terminal,
  Timer,
  Wrench,
} from "lucide-react";
import { createTranscript } from "@hive/pi-adapter";
import { buildTimeline, type AssistantBlock, type Timeline, type TimelineItem, type ToolResultView, type ToolRun } from "@hive/pi-adapter";
import { useSessionStore } from "../store/session-store.ts";
import { useActiveRegistry } from "../store/ai-registry-store.ts";
import { indexSkills, parseSkillBlock, type SkillIndex } from "../lib/ai/skills.ts";
import { indexSubagents, parseGetResultText, resolveSubagentView, type NotificationDetails, type SubagentIndex } from "../lib/ai/subagents.ts";
import { SkillLoadCard } from "./transcript/SkillLoadCard.tsx";
import { SubagentCard } from "./transcript/SubagentCard.tsx";
import { Markdown } from "./code/Markdown.tsx";
import { CodeBlock } from "./code/CodeBlock.tsx";
import { ImageThumbnail } from "./ImageThumbnail.tsx";
import { languageFromPath } from "../lib/highlight/languages.ts";
import { copyText } from "../lib/clipboard.ts";
import { formatCost, formatElapsed, formatTokens } from "../lib/format.ts";
import { QueuedMessagesList } from "./transcript/QueuedMessages.tsx";
import { AuthErrorActions } from "./AuthErrorActions.tsx";
import { detectAuthError } from "../lib/auth-errors.ts";
import { useContributions } from "../modules/registry.ts";
import { ModuleToolCard } from "../modules/ModuleViews.tsx";
import { isFilePath, openFileInTab, renderTextWithFileLinks } from "../lib/file-links.tsx";

export function scrollToToolCall(id: string): void {
  const sel = CSS.escape(id);
  const el = document.querySelector(`[data-tool-call-id="${sel}"]`) || document.querySelector(`[data-item-key="${sel}"]`);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("is-flash");
    setTimeout(() => el.classList.remove("is-flash"), 1600);
  }
}

interface TranscriptAnnotations {
  skills: SkillIndex;
  subagents: SubagentIndex;
}

/** Cheap content signature, so a re-index that found nothing new keeps the previous object identity. */
function annotationsSig(a: TranscriptAnnotations): string {
  const join = <V,>(m: Map<string, V>, f: (v: V) => string) => [...m].map(([k, v]) => `${k}=${f(v)}`).join("|");
  return [
    join(a.skills.loads, (v) => `${v.name}:${v.filePath}`),
    join(a.skills.usedBy, (v) => v),
    join(a.subagents.notifications, (v) => `${v.itemKey}:${JSON.stringify(v.details)}`),
    join(a.subagents.results, (v) => `${v.status}:${v.toolCallId}`),
    join(a.subagents.cards, (v) => v),
  ].join("\n");
}

const TranscriptContext = createContext<{
  annotations: TranscriptAnnotations;
  renderNested: (timeline: Timeline) => React.ReactNode;
  /** Whether the session is currently executing a run. */
  sessionRunning: boolean;
} | null>(null);

const EMPTY_TRANSCRIPT = createTranscript();

export const Transcript: React.FC<{ tabId?: string }> = ({ tabId }) => {
  const activeTabId = useSessionStore((s) => s.activeTabId);
  const displayedTabId = useSessionStore((s) => s.displayedTabId);
  const targetTabId = tabId ?? displayedTabId ?? activeTabId;
  const storeTranscript = useSessionStore((s) => s.transcript);
  const transcriptsByTab = useSessionStore((s) => s.transcriptsByTab);
  const targetTab = useSessionStore((s) => s.tabs.find((t) => t.id === targetTabId));
  const projects = useSessionStore((s) => s.projects);
  const storeProject = useSessionStore((s) => s.activeProject);
  const activeProject = targetTab ? projects.find((p) => p.id === targetTab.projectId) ?? storeProject : storeProject;

  // The displayed session lives in the top-level store fields; every other session is read from its cache.
  const isDisplayed = !targetTabId || targetTabId === displayedTabId;
  const tabTranscript = targetTabId ? transcriptsByTab[targetTabId] : undefined;
  const transcript = isDisplayed ? storeTranscript : tabTranscript ?? EMPTY_TRANSCRIPT;

  useEffect(() => {
    if (!isDisplayed && targetTabId && !tabTranscript && targetTab?.sessionPath) {
      void useSessionStore.getState().ensureTabTranscriptLoaded(targetTabId);
    }
  }, [isDisplayed, targetTabId, tabTranscript, targetTab?.sessionPath]);

  const registry = useActiveRegistry();

  const timeline = useMemo(() => buildTimeline(transcript), [transcript]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const [showJump, setShowJump] = useState(false);

  // Every row reads this through context, which bypasses TimelineRow's memo. Keep its identity stable
  // while streaming (the timeline object changes on every token) so settled rows don't all re-render.
  const annotationsRef = useRef<{ sig: string; value: TranscriptAnnotations } | null>(null);
  const annotations = useMemo<TranscriptAnnotations>(() => {
    const pCtx = {
      cwd: activeProject?.path ?? "",
      homeDir: registry?.homeDir ?? "",
    };
    const value = { skills: indexSkills(timeline, registry, pCtx), subagents: indexSubagents(timeline) };
    const sig = annotationsSig(value);
    if (annotationsRef.current?.sig === sig) return annotationsRef.current.value;
    annotationsRef.current = { sig, value };
    return value;
  }, [timeline, registry, activeProject?.path]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    pinned.current = atBottom;
    setShowJump(!atBottom);
  }, []);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [timeline, transcript.queue]);

  const jump = () => {
    const el = scrollRef.current;
    if (!el) return;
    pinned.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  };

  const renderNested = useCallback(
    (nestedTimeline: Timeline) => <NestedTimeline timeline={nestedTimeline} />,
    [],
  );

  const sessionRunning = transcript.running;
  const ctxValue = useMemo(
    () => ({ annotations, renderNested, sessionRunning }),
    [annotations, renderNested, sessionRunning],
  );
  const empty = timeline.items.length === 0 && !transcript.running;

  return (
    <TranscriptContext.Provider value={ctxValue}>
      <div className="transcript-wrap">
        <div ref={scrollRef} className="transcript" onScroll={onScroll}>
          <div className="transcript__inner">
            {empty && (
              <div className="transcript__empty">
                <div className="transcript__empty-icon">
                  <Sparkles size={20} />
                </div>
                <div className="transcript__empty-title">What are we building?</div>
                <div className="transcript__empty-sub">Ask Pi a question or hand it a task in this project.</div>
              </div>
            )}
            {timeline.items.map((item) => (
              <TimelineRow key={item.key} item={item} results={resultsFor(item, timeline.toolResults)} tools={transcript.tools} />
            ))}
            {transcript.running && !transcript.streaming && (
              <div className="transcript__working">
                <Loader2 size={13} className="spin" /> Working…
              </div>
            )}
            <QueuedMessagesList />
          </div>
        </div>
        {showJump && (
          <button className="transcript__jump" onClick={jump} title="Jump to latest">
            <ArrowDown size={14} />
          </button>
        )}
      </div>
    </TranscriptContext.Provider>
  );
};

export const NestedTimeline: React.FC<{ timeline: Timeline; sessionRunning?: boolean }> = ({ timeline, sessionRunning = false }) => {
  const outerCtx = useContext(TranscriptContext);
  const fallbackRender = useCallback((t: Timeline) => <NestedTimeline timeline={t} sessionRunning={sessionRunning} />, [sessionRunning]);
  const effectiveCtx = useMemo(() => outerCtx ?? {
    annotations: {
      skills: { loads: new Map(), usedBy: new Map() },
      subagents: { notifications: new Map(), results: new Map(), cards: new Map() },
    },
    renderNested: fallbackRender,
    sessionRunning,
  }, [outerCtx, fallbackRender, sessionRunning]);

  return (
    <TranscriptContext.Provider value={effectiveCtx}>
      <div className="nested-timeline" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {timeline.items.map((item) => (
          <TimelineRow
            key={item.key}
            item={item}
            results={resultsFor(item, timeline.toolResults)}
            tools={{}}
          />
        ))}
      </div>
    </TranscriptContext.Provider>
  );
};

function resultsFor(item: TimelineItem, all: Record<string, ToolResultView>): ToolResultView[] | undefined {
  if (item.kind !== "assistant") return undefined;
  const out: ToolResultView[] = [];
  for (const b of item.blocks) if (b.type === "toolCall" && all[b.id]) out.push(all[b.id]!);
  return out;
}

type ToolRuns = ReturnType<typeof useSessionStore.getState>["transcript"]["tools"];

interface RowProps {
  item: TimelineItem;
  results?: ToolResultView[];
  tools: ToolRuns;
}

const resultSig = (r?: ToolResultView[]) => (r ? r.map((x) => `${x.toolCallId}:${x.isError}:${x.text.length}`).join("|") : "");

const TimelineRow = memo(
  ({ item, results, tools }: RowProps) => {
    const ctx = useContext(TranscriptContext);

    switch (item.kind) {
      case "user":
        return <UserMessage text={item.text} images={item.images} itemKey={item.key} />;
      case "assistant":
        return <AssistantMessage item={item} results={results ?? []} tools={tools} itemKey={item.key} />;
      case "bash":
        return (
          <div className="msg-tool is-open" data-item-key={item.key}>
            <div className="msg-tool__head">
              <Terminal size={13} className="msg-tool__icon" />
              <span className="msg-tool__name">Shell</span>
              <span className="msg-tool__arg mono">$ {item.command}</span>
              {item.exitCode !== undefined && item.exitCode !== 0 && <span className="ui-chip ui-chip--danger">exit {item.exitCode}</span>}
            </div>
            {item.output && <CodeBlock code={item.output} language="text" bare lineNumbers={false} />}
          </div>
        );
      case "turn":
        return (
          <div className="msg-turn" data-item-key={item.key} title="Time from your message until the agent answered, asked or finished">
            <span className="msg-turn__label">
              <Timer size={11} />
              Worked for {formatElapsed(item.ms)}
            </span>
          </div>
        );
      case "marker":
        return <div className="msg-marker" data-item-key={item.key}>{item.text}</div>;
      case "summary":
        return (
          <div className="msg-summary" data-item-key={item.key}>
            <div className="msg-summary__title">{item.variant === "compaction" ? "Context compacted" : "Branch summary"}</div>
            <Markdown text={item.summary} />
          </div>
        );
      case "custom": {
        if (item.customType === "subagent-notification") {
          const notif = item.details as NotificationDetails | undefined;
          const targetCard = notif?.id && ctx ? ctx.annotations.subagents.cards.get(notif.id) : undefined;
          const isOk = notif?.status === "completed";
          return (
            <div className="msg-agent-action-row" data-item-key={item.key}>
              <Bot size={14} className="msg-agent-action-row__icon" />
              <span className="msg-agent-action-row__label">Subagent finished:</span>
              <span className="msg-agent-action-row__target" title={notif?.description || item.text}>
                {notif?.description || item.text}
              </span>
              <span className={`ui-chip ui-chip--${isOk ? "ok" : "danger"}`}>
                {notif?.status ?? "done"}
              </span>
              {targetCard && (
                <button
                  className="msg-agent-action-row__link"
                  onClick={() => scrollToToolCall(targetCard)}
                >
                  View agent card
                </button>
              )}
            </div>
          );
        }
        return item.text ? (
          <div className="msg-summary" data-item-key={item.key}>
            <div className="msg-summary__title">{item.customType}</div>
            <Markdown text={item.text} />
          </div>
        ) : null;
      }
      default:
        return null;
    }
  },
  (a, b) => {
    if (a.item.key !== b.item.key) return false;
    if (a.item.kind === "assistant" && (a.item.streaming || (b.item.kind === "assistant" && b.item.streaming))) return false;
    if (resultSig(a.results) !== resultSig(b.results)) return false;
    // Live tool progress only matters for rows with tool calls that have no result yet.
    if (a.item.kind === "assistant" && a.tools !== b.tools) {
      return !a.item.blocks.some((bl) => bl.type === "toolCall" && !a.results?.some((r) => r.toolCallId === bl.id));
    }
    if (a.item.kind === "turn" && b.item.kind === "turn") return a.item.ms === b.item.ms;
    return a.item.kind === b.item.kind;
  },
);
TimelineRow.displayName = "TimelineRow";

const UserMessage: React.FC<{ text: string; images: Array<{ mimeType: string; data: string }>; itemKey: string }> = ({
  text,
  images,
  itemKey,
}) => {
  const [copied, setCopied] = useState(false);
  const rewind = useSessionStore((s) => s.rewindToUserMessage);
  const parsedSkill = useMemo(() => parseSkillBlock(text), [text]);

  return (
    <div data-item-key={itemKey}>
      {parsedSkill && (
        <div style={{ marginBottom: 8 }}>
          <SkillLoadCard
            load={{
              name: parsedSkill.name,
              body: parsedSkill.body,
              baseDir: "",
              filePath: parsedSkill.location,
              source: "/skill",
            }}
          />
        </div>
      )}
      {(!parsedSkill || parsedSkill.rest) && (
        <div className="msg-user">
          <div className="msg-user__bubble selectable">
            {images.length > 0 && (
              <div className="msg-user__images">
                {images.map((img, i) => (
                  <ImageThumbnail
                    key={i}
                    src={`data:${img.mimeType};base64,${img.data}`}
                    alt={`Attachment ${i + 1}`}
                  />
                ))}
              </div>
            )}
            {(parsedSkill?.rest || text) && <div className="msg-user__text">{renderTextWithFileLinks(parsedSkill?.rest || text)}</div>}
          </div>
          {(parsedSkill?.rest || text) && (
            <div className="msg-actions">
            <button
              className="msg-action"
              title="Edit and resend (rewinds the conversation to here)"
              onClick={() => void rewind(itemKey, "edit")}
            >
              <PencilLine size={12} />
            </button>
            <button
              className="msg-action"
              title="Retry (rewind and run this message again)"
              onClick={() => void rewind(itemKey, "resend")}
            >
              <RotateCcw size={12} />
            </button>
            <button
              className="msg-action"
              title="Copy message"
              onClick={async () => {
                const copyTarget = parsedSkill?.rest || text;
                if (await copyText(copyTarget)) {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1200);
                }
              }}
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
            </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const AssistantMessage: React.FC<{
  item: Extract<TimelineItem, { kind: "assistant" }>;
  results: ToolResultView[];
  tools: ToolRuns;
  itemKey: string;
}> = ({ item, results, tools, itemKey }) => {
  const [copied, setCopied] = useState(false);
  const rewind = useSessionStore((s) => s.rewindToUserMessage);
  const text = item.blocks
    .filter((b): b is Extract<AssistantBlock, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("\n\n");
  const lastTextIndex = item.blocks.map((b) => b.type).lastIndexOf("text");

  return (
    <div className="msg-assistant" data-item-key={itemKey}>
      {item.blocks.map((block, idx) => {
        if (block.type === "thinking") return <ThinkingBlock key={idx} text={block.thinking} live={item.streaming && idx === item.blocks.length - 1} />;
        if (block.type === "text") return block.text ? <Markdown key={idx} text={block.text} streaming={item.streaming && idx === lastTextIndex} /> : null;
        if (block.type === "toolCall") {
          return (
            <ToolCall
              key={block.id || idx}
              block={block}
              result={results.find((r) => r.toolCallId === block.id)}
              run={tools[block.id]}
              running={tools[block.id]?.status === "running"}
            />
          );
        }
        return null;
      })}

      {item.streaming && item.blocks.length === 0 && (
        <div className="transcript__working">
          <Loader2 size={13} className="spin" /> Thinking…
        </div>
      )}

      {item.errorMessage && (
        <div className="msg-error">
          <AlertCircle size={14} />
          <span className="selectable">{item.errorMessage}</span>
          {(() => {
            const auth = detectAuthError(item.errorMessage, item.provider);
            return auth ? <AuthErrorActions auth={auth} /> : null;
          })()}
        </div>
      )}

      {!item.streaming && text && (
        <div className="msg-footer">
          {item.model && <span>{item.model}</span>}
          {item.usage && (
            <span title={`in ${item.usage.input} · out ${item.usage.output} · cache read ${item.usage.cacheRead} · cache write ${item.usage.cacheWrite}`}>
              {formatTokens(item.usage.totalTokens)} tok
            </span>
          )}
          {item.usage?.cost?.total ? <span>{formatCost(item.usage.cost.total)}</span> : null}
          <button
            className="msg-action msg-action--inline"
            title="Regenerate response"
            onClick={() => {
              // Find the user message this response answers, then rewind to it and run it again.
              const { byId } = useSessionStore.getState().transcript;
              let id = byId[itemKey]?.parentId ?? null;
              while (id) {
                const e = byId[id];
                if (!e) return;
                if (e.type === "message" && (e.message as unknown as { role?: string }).role === "user") {
                  void rewind(e.id, "resend");
                  return;
                }
                id = e.parentId;
              }
            }}
          >
            <RotateCcw size={12} />
          </button>
          {text && (
            <button
              className="msg-action msg-action--inline"
              title="Copy response (markdown)"
              onClick={async () => {
                if (await copyText(text)) {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1200);
                }
              }}
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

const ThinkingBlock: React.FC<{ text: string; live: boolean }> = ({ text, live }) => {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  return (
    <div className={`msg-thinking${open ? " is-open" : ""}`}>
      <button className="msg-thinking__head" onClick={() => setOpen(!open)}>
        <ChevronRight size={13} className="msg-chevron" />
        <Brain size={13} />
        <span>{live ? "Thinking…" : "Thought process"}</span>
        <span className="msg-thinking__len">{formatTokens(Math.round(text.length / 4))} tok</span>
      </button>
      {open && <div className="msg-thinking__body selectable">{text}</div>}
    </div>
  );
};

// ---- Tool calls ----

type ToolCallBlockT = Extract<AssistantBlock, { type: "toolCall" }>;

const TOOL_META: Record<string, { icon: React.ReactNode; label: string }> = {
  read: { icon: <FileText size={13} />, label: "Read" },
  bash: { icon: <Terminal size={13} />, label: "Bash" },
  edit: { icon: <PencilLine size={13} />, label: "Edit" },
  write: { icon: <FilePlus2 size={13} />, label: "Write" },
  grep: { icon: <Search size={13} />, label: "Grep" },
  find: { icon: <Search size={13} />, label: "Find" },
  ls: { icon: <FolderTree size={13} />, label: "List" },
  web_search: { icon: <Globe size={13} />, label: "Web search" },
  fetch: { icon: <Globe size={13} />, label: "Fetch" },
  subagent: { icon: <Bot size={13} />, label: "Subagent" },
};

const str = (v: unknown) => (typeof v === "string" ? v : v === undefined ? "" : JSON.stringify(v));

function toolSummary(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case "read":
    case "write":
    case "edit":
    case "ls": {
      const p = str(args.path ?? args.file_path);
      const range = args.offset ? `:${args.offset}${args.limit ? `-${Number(args.offset) + Number(args.limit)}` : ""}` : "";
      return p + range;
    }
    case "bash":
      return str(args.command);
    case "grep":
    case "find":
      return [str(args.pattern ?? args.query), str(args.path)].filter(Boolean).join("  in ");
    default: {
      const first = Object.values(args).find((v) => typeof v === "string") as string | undefined;
      return first ?? JSON.stringify(args);
    }
  }
}

function editAsDiff(args: Record<string, unknown>): string | null {
  const edits = Array.isArray(args.edits)
    ? (args.edits as Array<{ oldText?: string; newText?: string }>)
    : typeof args.oldText === "string"
      ? [{ oldText: args.oldText as string, newText: args.newText as string }]
      : null;
  if (!edits?.length) return null;
  return edits
    .map((e) => [
      ...(e.oldText ?? "").split("\n").map((l) => `- ${l}`),
      ...(e.newText ?? "").split("\n").map((l) => `+ ${l}`),
    ].join("\n"))
    .join("\n@@\n");
}

const ToolCall: React.FC<{
  block: ToolCallBlockT;
  result?: ToolResultView;
  run?: ToolRun;
  running: boolean;
}> = ({ block, result, run, running }) => {
  const ctx = useContext(TranscriptContext);
  const [open, setOpen] = useState(false);
  const toolCards = useContributions("toolCards");

  // 1. Skill load card
  if (ctx?.annotations.skills.loads.has(block.id)) {
    const load = ctx.annotations.skills.loads.get(block.id)!;
    return <SkillLoadCard load={load} toolCallId={block.id} />;
  }

  // 2. Subagent card (Agent / SubagentWorkflow)
  if (block.name === "Agent" || block.name === "SubagentWorkflow") {
    const view = resolveSubagentView({
      block,
      run,
      result,
      subagentIndex: ctx?.annotations.subagents,
      sessionRunning: ctx?.sessionRunning,
    });
    return <SubagentCard view={view} renderNested={ctx?.renderNested} />;
  }

  // 3. Compact subagent action row (get_subagent_result / steer_subagent)
  if (block.name === "get_subagent_result" || block.name === "steer_subagent") {
    const isSteer = block.name === "steer_subagent";
    const parsed = parseGetResultText(result?.text ?? "");
    const targetId = parsed.agentId || (typeof block.arguments?.agent_id === "string" ? block.arguments.agent_id : undefined);
    const targetCard = targetId && ctx ? ctx.annotations.subagents.cards.get(targetId) : undefined;
    return (
      <div className="msg-agent-action-row" data-tool-call-id={block.id}>
        <Bot size={13} className="msg-agent-action-row__icon" />
        <span className="msg-agent-action-row__label">{isSteer ? "Steer subagent" : "Subagent result"}</span>
        {targetId && <span className="msg-agent-action-row__target">({targetId.slice(0, 8)})</span>}
        {parsed.status && <span className="ui-chip ui-chip--neutral">{parsed.status}</span>}
        {targetCard && (
          <button className="msg-agent-action-row__link" onClick={() => scrollToToolCall(targetCard)}>
            Jump to agent
          </button>
        )}
      </div>
    );
  }

  // 4. Module-owned card (e.g. the inline plan review)
  const moduleCard = toolCards.find((c) => c.match({ name: block.name, arguments: block.arguments ?? {} }));
  if (moduleCard) {
    return (
      <ModuleToolCard
        card={moduleCard}
        call={{
          id: block.id,
          name: block.name,
          arguments: block.arguments ?? {},
          complete: block.complete,
          running,
          result: result ? { text: result.text, isError: result.isError } : undefined,
        }}
      />
    );
  }

  // 5. Standard tool call
  const meta = TOOL_META[block.name] ?? { icon: <Wrench size={13} />, label: block.name };
  const summary = toolSummary(block.name, block.arguments ?? {});
  const path = str(block.arguments?.path ?? block.arguments?.file_path);
  const targetFilePath = path || (isFilePath(summary) ? summary : undefined);
  const status = result ? (result.isError ? "error" : "done") : running || !block.complete ? "running" : "pending";
  const usedSkill = ctx?.annotations.skills.usedBy.get(block.id);

  let body: React.ReactNode = null;
  if (open) {
    const args = block.arguments ?? {};
    const pieces: React.ReactNode[] = [];
    if (block.name === "edit") {
      const diff = editAsDiff(args);
      if (diff) pieces.push(<CodeBlock key="diff" code={diff} language="diff" bare lineNumbers={false} />);
    } else if (block.name === "write" && typeof args.content === "string") {
      pieces.push(<CodeBlock key="content" code={args.content} language={languageFromPath(path)} bare />);
    } else if (block.name === "bash") {
      pieces.push(<CodeBlock key="cmd" code={str(args.command)} language="shellscript" bare lineNumbers={false} />);
    } else if (block.name !== "read") {
      pieces.push(<CodeBlock key="args" code={JSON.stringify(args, null, 2)} language="json" bare lineNumbers={false} />);
    }
    if (result) {
      if (result.text) {
        const lang = result.isError ? null : block.name === "read" ? languageFromPath(path) : null;
        const startLine = block.name === "read" && Number(args.offset) > 0 ? Number(args.offset) : 1;
        pieces.push(
          <div key="result" className={`msg-tool__result${result.isError ? " is-error" : ""}`}>
            <CodeBlock code={result.text} language={lang} bare lineNumbers={block.name === "read"} startLine={startLine} />
          </div>,
        );
      }
      if (result.images.length > 0) {
        pieces.push(
          <div key="tool-images" className="msg-tool__image-wrap">
            {result.images.map((img, i) => (
              <ImageThumbnail
                key={`img${i}`}
                className="msg-tool__image-thumb"
                src={`data:${img.mimeType};base64,${img.data}`}
                alt={`Tool output ${i + 1}`}
              />
            ))}
          </div>,
        );
      }
    } else if (!block.complete && block.argsText) {
      pieces.push(<CodeBlock key="partial" code={block.argsText} language="json" streaming bare lineNumbers={false} />);
    }
    body = <div className="msg-tool__body">{pieces}</div>;
  }

  return (
    <div className={`msg-tool${open ? " is-open" : ""}`} data-tool-call-id={block.id}>
      <button className="msg-tool__head" onClick={() => setOpen(!open)}>
        <ChevronRight size={13} className="msg-chevron" />
        <span className="msg-tool__icon">{meta.icon}</span>
        <span className="msg-tool__name">{meta.label}</span>
        {usedSkill && (
          <span className="msg-tool__skill-badge" title={`Invoked under skill ${usedSkill}`}>
            <Sparkles size={10} /> skill: {usedSkill}
          </span>
        )}
        <span
          className={`msg-tool__arg mono${targetFilePath ? " is-clickable" : ""}`}
          title={targetFilePath ? `Open ${targetFilePath} in tab · ${summary}` : summary}
          onClick={
            targetFilePath
              ? (e) => {
                  e.stopPropagation();
                  void openFileInTab(targetFilePath);
                }
              : undefined
          }
        >
          {summary}
        </span>
        {status === "running" || status === "pending" ? (
          <Loader2 size={13} className="spin msg-tool__status" />
        ) : status === "error" ? (
          <AlertCircle size={13} className="msg-tool__status is-error" />
        ) : (
          <CheckCircle2 size={13} className="msg-tool__status is-ok" />
        )}
      </button>
      {body}
    </div>
  );
};
