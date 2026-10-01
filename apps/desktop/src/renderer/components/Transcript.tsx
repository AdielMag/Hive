/**
 * Conversation view. Performance notes:
 *  - the timeline is rebuilt only when the transcript revision changes (useMemo),
 *  - settled rows are memoized on a cheap signature, so streaming re-renders just the live message,
 *  - auto-scroll only pins to the bottom when the user is already there (no fighting manual scrolling).
 */
import React, { memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
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
  Search,
  Sparkles,
  Terminal,
  Wrench,
} from "lucide-react";
import { buildTimeline, type AssistantBlock, type TimelineItem, type ToolResultView } from "@pi-studio/pi-adapter";
import { useSessionStore } from "../store/session-store.ts";
import { Markdown } from "./code/Markdown.tsx";
import { CodeBlock } from "./code/CodeBlock.tsx";
import { languageFromPath } from "../lib/highlight/languages.ts";
import { copyText } from "../lib/clipboard.ts";
import { formatCost, formatTokens } from "../lib/format.ts";

export const Transcript: React.FC = () => {
  const transcript = useSessionStore((s) => s.transcript);
  const timeline = useMemo(() => buildTimeline(transcript), [transcript]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const [showJump, setShowJump] = useState(false);

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
  }, [timeline]);

  const jump = () => {
    const el = scrollRef.current;
    if (!el) return;
    pinned.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  };

  const empty = timeline.items.length === 0 && !transcript.running;

  return (
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
        </div>
      </div>
      {showJump && (
        <button className="transcript__jump" onClick={jump} title="Jump to latest">
          <ArrowDown size={14} />
        </button>
      )}
    </div>
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
    switch (item.kind) {
      case "user":
        return <UserMessage text={item.text} images={item.images} />;
      case "assistant":
        return <AssistantMessage item={item} results={results ?? []} tools={tools} />;
      case "bash":
        return (
          <div className="msg-tool is-open">
            <div className="msg-tool__head">
              <Terminal size={13} className="msg-tool__icon" />
              <span className="msg-tool__name">Shell</span>
              <span className="msg-tool__arg mono">$ {item.command}</span>
              {item.exitCode !== undefined && item.exitCode !== 0 && <span className="ui-chip ui-chip--danger">exit {item.exitCode}</span>}
            </div>
            {item.output && <CodeBlock code={item.output} language="text" bare lineNumbers={false} />}
          </div>
        );
      case "marker":
        return <div className="msg-marker">{item.text}</div>;
      case "summary":
        return (
          <div className="msg-summary">
            <div className="msg-summary__title">{item.variant === "compaction" ? "Context compacted" : "Branch summary"}</div>
            <Markdown text={item.summary} />
          </div>
        );
      case "custom":
        return item.text ? (
          <div className="msg-summary">
            <div className="msg-summary__title">{item.customType}</div>
            <Markdown text={item.text} />
          </div>
        ) : null;
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
    return a.item.kind === b.item.kind;
  },
);
TimelineRow.displayName = "TimelineRow";

const UserMessage: React.FC<{ text: string; images: Array<{ mimeType: string; data: string }> }> = ({ text, images }) => {
  const [copied, setCopied] = useState(false);
  return (
    <div className="msg-user">
      <div className="msg-user__bubble selectable">
        {images.length > 0 && (
          <div className="msg-user__images">
            {images.map((img, i) => (
              <img key={i} src={`data:${img.mimeType};base64,${img.data}`} alt="attachment" />
            ))}
          </div>
        )}
        {text && <div className="msg-user__text">{text}</div>}
      </div>
      {text && (
        <button
          className="msg-action"
          title="Copy message"
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
  );
};

const AssistantMessage: React.FC<{
  item: Extract<TimelineItem, { kind: "assistant" }>;
  results: ToolResultView[];
  tools: ToolRuns;
}> = ({ item, results, tools }) => {
  const [copied, setCopied] = useState(false);
  const text = item.blocks
    .filter((b): b is Extract<AssistantBlock, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("\n\n");
  const lastTextIndex = item.blocks.map((b) => b.type).lastIndexOf("text");

  return (
    <div className="msg-assistant">
      {item.blocks.map((block, idx) => {
        if (block.type === "thinking") return <ThinkingBlock key={idx} text={block.thinking} live={item.streaming && idx === item.blocks.length - 1} />;
        if (block.type === "text") return block.text ? <Markdown key={idx} text={block.text} streaming={item.streaming && idx === lastTextIndex} /> : null;
        if (block.type === "toolCall") {
          return <ToolCall key={block.id || idx} block={block} result={results.find((r) => r.toolCallId === block.id)} running={tools[block.id]?.status === "running"} />;
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

const ToolCall: React.FC<{ block: ToolCallBlockT; result?: ToolResultView; running: boolean }> = ({ block, result, running }) => {
  const [open, setOpen] = useState(false);
  const meta = TOOL_META[block.name] ?? { icon: <Wrench size={13} />, label: block.name };
  const summary = toolSummary(block.name, block.arguments ?? {});
  const path = str(block.arguments?.path ?? block.arguments?.file_path);
  const status = result ? (result.isError ? "error" : "done") : running || !block.complete ? "running" : "pending";

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
      for (const [i, img] of result.images.entries()) {
        pieces.push(<img key={`img${i}`} className="msg-tool__image" src={`data:${img.mimeType};base64,${img.data}`} alt="tool output" />);
      }
    } else if (!block.complete && block.argsText) {
      pieces.push(<CodeBlock key="partial" code={block.argsText} language="json" streaming bare lineNumbers={false} />);
    }
    body = <div className="msg-tool__body">{pieces}</div>;
  }

  return (
    <div className={`msg-tool${open ? " is-open" : ""}`}>
      <button className="msg-tool__head" onClick={() => setOpen(!open)}>
        <ChevronRight size={13} className="msg-chevron" />
        <span className="msg-tool__icon">{meta.icon}</span>
        <span className="msg-tool__name">{meta.label}</span>
        <span className="msg-tool__arg mono" title={summary}>
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
