import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowDown,
  Bot,
  Brain,
  CheckCircle2,
  Clock,
  Coins,
  Cpu,
  ExternalLink,
  FileText,
  Loader2,
  Maximize2,
  Square,
  Terminal,
  Wrench,
  X,
} from "lucide-react";
import { getSubagentDetails, type SubagentView } from "../lib/ai/subagents.ts";
import { formatCost, formatDuration } from "../lib/format.ts";
import { useSubagentOutput } from "../hooks/useSubagentOutput.ts";
import { Markdown } from "./code/Markdown.tsx";
import { useSessionStore } from "../store/session-store.ts";
import { toast } from "../modules/toast-store.ts";
import { NestedTimeline } from "./Transcript.tsx";

export interface SubagentViewerProps {
  view: SubagentView;
  sessionPath?: string;
  activeKey?: string;
  onOpenTab?: () => void;
  onOpenModal?: () => void;
  onClose?: () => void;
  isModal?: boolean;
}

export const SubagentViewer: React.FC<SubagentViewerProps> = ({
  view,
  sessionPath,
  activeKey,
  onOpenTab,
  onOpenModal,
  onClose,
  isModal = false,
}) => {
  const liveTool = useSessionStore((s) => (view.toolCallId ? s.transcript.tools[view.toolCallId] : undefined));

  const liveDetails =
    getSubagentDetails((liveTool?.result as { details?: unknown } | undefined)?.details) ||
    getSubagentDetails((liveTool?.partial as { details?: unknown } | undefined)?.details) ||
    view.subagentDetails;

  const results = liveDetails?.results ?? [];
  const [selectedTaskIndex, setSelectedTaskIndex] = useState(0);
  // A reused viewer must not keep the previous call's task pill.
  useEffect(() => {
    setSelectedTaskIndex(0);
  }, [view.toolCallId]);
  const effectiveIndex = selectedTaskIndex < results.length ? selectedTaskIndex : 0;
  const activeResult = results[effectiveIndex];

  const { timeline, prompt: outputPrompt, loading, error: transcriptError } = useSubagentOutput(
    view,
    true,
    { sessionPath, key: activeKey },
    effectiveIndex,
  );

  const [activeSection, setActiveSection] = useState<"transcript" | "prompt" | "result">("transcript");
  const [stopping, setStopping] = useState(false);
  const stopSubagent = useSessionStore((s) => s.stopSubagent);

  const isRunning =
    view.status === "running" || view.status === "queued" || view.status === "background" || liveTool?.status === "running";

  useEffect(() => {
    if (!isRunning) setStopping(false);
  }, [isRunning]);

  const finalAssistantText = React.useMemo(() => {
    // Mid-run assistant chatter is not a final answer.
    if (!activeResult?.messages || activeResult.exitCode === -1) return undefined;
    for (let i = activeResult.messages.length - 1; i >= 0; i--) {
      const msg = activeResult.messages[i];
      if (msg?.role === "assistant") {
        if (typeof msg.content === "string" && msg.content.trim()) return msg.content;
        if (Array.isArray(msg.content)) {
          const textParts = msg.content
            .filter((p) => p && typeof p === "object" && (p as { type?: string }).type === "text")
            .map((p) => (p as { text?: string }).text ?? "")
            .join("\n")
            .trim();
          if (textParts) return textParts;
        }
      }
    }
    return undefined;
  }, [activeResult?.messages, activeResult?.exitCode]);

  const promptText = activeResult?.task || view.prompt || outputPrompt;
  const resultText =
    activeResult?.errorMessage ||
    finalAssistantText ||
    view.resultText ||
    activeResult?.stderr;
  const effectiveDuration = view.durationMs ? formatDuration(view.durationMs) : undefined;
  const displayModel = activeResult?.model || view.model;
  const displayType = activeResult?.agent || view.type;

  // Auto-scroll logic for the transcript section
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef<boolean>(true);
  const [showJump, setShowJump] = useState(false);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distanceToBottom < 60;
    pinnedRef.current = atBottom;
    setShowJump(!atBottom && el.scrollHeight > el.clientHeight + 100);
  };

  useLayoutEffect(() => {
    if (activeSection !== "transcript") return;
    const el = scrollRef.current;
    if (el && pinnedRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [timeline, activeSection]);

  const jumpToBottom = () => {
    const el = scrollRef.current;
    if (!el) return;
    pinnedRef.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setShowJump(false);
  };

  return (
    <div className={`subagent-viewer ${isModal ? "subagent-viewer--modal" : ""}`}>
      {/* Header Top Area */}
      <div className="subagent-viewer__top">
        <div className="subagent-viewer__header-row">
          <div className="subagent-viewer__title-group">
            <div className="subagent-viewer__icon">
              <Bot size={16} />
            </div>
            <span className="subagent-viewer__type-pill">{displayType}</span>
            <h2 className="subagent-viewer__title" title={view.description}>
              {view.description || "Subagent Execution"}
            </h2>
          </div>

          <div className="subagent-viewer__actions">
            <span className={`subagent-viewer__status-pill status-${view.status}`}>
              {isRunning && <Loader2 size={11} className="spin" />}
              {view.status}
            </span>

            {isRunning && !view.unified && (
              <button
                type="button"
                className="ui-btn ui-btn--danger subagent-viewer__action-btn"
                disabled={stopping}
                onClick={async () => {
                  setStopping(true);
                  try {
                    const ok = await stopSubagent({
                      agentId: view.stopId,
                      type: view.type,
                      description: view.description,
                    });
                    if (ok === false) toast({ message: "Couldn't stop the subagent", kind: "error" });
                  } catch (e) {
                    toast({ message: `Couldn't stop the subagent: ${e instanceof Error ? e.message : String(e)}`, kind: "error" });
                  } finally {
                    setStopping(false);
                  }
                }}
                title={stopping ? "Stopping subagent…" : "Stop this subagent"}
              >
                {stopping ? <Loader2 size={12} className="spin" /> : <Square size={11} fill="currentColor" />}
                <span>Stop</span>
              </button>
            )}

            {onOpenTab && (
              <button
                type="button"
                className="ui-btn ui-btn--ghost subagent-viewer__action-btn"
                onClick={onOpenTab}
                title="Open in dedicated tab"
              >
                <ExternalLink size={13} />
                <span>Open in Tab</span>
              </button>
            )}

            {onOpenModal && (
              <button
                type="button"
                className="ui-btn ui-btn--ghost subagent-viewer__action-btn"
                onClick={onOpenModal}
                title="Inspect in popup modal"
              >
                <Maximize2 size={13} />
                <span>Popup</span>
              </button>
            )}

            {onClose && (
              <button
                type="button"
                className="ui-btn ui-btn--ghost ui-btn--icon"
                onClick={onClose}
                title="Close"
                aria-label="Close"
              >
                <X size={15} />
              </button>
            )}
          </div>
        </div>

        {/* Live Activity Banner */}
        {isRunning && (
          <div className="subagent-viewer__activity-banner">
            <span className="pulse-dot" />
            <span className="subagent-viewer__activity-label">Active</span>
            <span className="subagent-viewer__activity-text">
              {view.activity || (view.status === "queued" ? "Queued in runner..." : "Executing autonomous task...")}
            </span>
          </div>
        )}

        {/* Stats & Meta row */}
        <div className="subagent-viewer__meta-row">
          {displayModel && (
            <span className="subagent-viewer__stat" title="Model">
              <Cpu size={12} /> {displayModel}
            </span>
          )}
          {view.thinking && (
            <span className="subagent-viewer__stat" title="Thinking Level">
              <Brain size={12} /> {view.thinking}
            </span>
          )}
          {view.toolUses !== undefined && (
            <span className="subagent-viewer__stat" title="Tool calls made by subagent">
              <Wrench size={12} /> {view.toolUses} {view.toolUses === 1 ? "tool" : "tools"}
            </span>
          )}
          {view.turns !== undefined && (
            <span className="subagent-viewer__stat" title="Conversation turns">
              <Terminal size={12} /> turn {view.turns}
              {view.maxTurns ? `/${view.maxTurns}` : ""}
            </span>
          )}
          {view.tokens && (
            <span className="subagent-viewer__stat" title="Tokens used">
              {view.tokens}
            </span>
          )}
          {view.cost !== undefined && view.cost > 0 && (
            <span className="subagent-viewer__stat" title="Estimated cost">
              <Coins size={12} /> {formatCost(view.cost)}
            </span>
          )}
          {effectiveDuration && (
            <span className="subagent-viewer__stat" title="Duration">
              <Clock size={12} /> {effectiveDuration}
            </span>
          )}
          {view.agentId && !view.unified && (
            <span className="subagent-viewer__stat mono" title={`Agent ID: ${view.agentId}`}>
              id: {view.agentId.slice(0, 8)}
            </span>
          )}
        </div>

        {/* Multi-Task / Multi-Step selector */}
        {results.length > 1 && (
          <div className="subagent-viewer__task-bar">
            <span className="subagent-viewer__task-bar-label">
              {liveDetails?.mode === "chain" ? "Chain Steps:" : "Tasks:"}
            </span>
            <div className="subagent-viewer__task-pills">
              {results.map((res, idx) => {
                const isItemRunning = res.exitCode === -1;
                const isItemError = !!res.errorMessage || (res.exitCode !== 0 && res.exitCode !== -1);
                return (
                  <button
                    key={idx}
                    type="button"
                    className={`subagent-viewer__task-pill ${effectiveIndex === idx ? "is-active" : ""}`}
                    onClick={() => setSelectedTaskIndex(idx)}
                  >
                    <span className="subagent-viewer__task-pill-idx">{idx + 1}</span>
                    <span className="subagent-viewer__task-pill-agent">{res.agent}</span>
                    {isItemRunning ? (
                      <Loader2 size={10} className="spin" />
                    ) : isItemError ? (
                      <AlertCircle size={10} className="text-rose-500" />
                    ) : (
                      <CheckCircle2 size={10} className="text-emerald-500" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Navigation Bar */}
      <div className="subagent-viewer__nav">
        <button
          type="button"
          className={`subagent-viewer__tab-btn ${activeSection === "transcript" ? "is-active" : ""}`}
          onClick={() => setActiveSection("transcript")}
        >
          <Terminal size={13} />
          <span>Execution Transcript</span>
          {timeline.items.length > 0 && (
            <span className="subagent-viewer__tab-badge">{timeline.items.length}</span>
          )}
        </button>

        {promptText && (
          <button
            type="button"
            className={`subagent-viewer__tab-btn ${activeSection === "prompt" ? "is-active" : ""}`}
            onClick={() => setActiveSection("prompt")}
          >
            <FileText size={13} />
            <span>Task Prompt</span>
          </button>
        )}

        {resultText && (
          <button
            type="button"
            className={`subagent-viewer__tab-btn ${activeSection === "result" ? "is-active" : ""}`}
            onClick={() => setActiveSection("result")}
          >
            <CheckCircle2 size={13} />
            <span>Result</span>
          </button>
        )}
      </div>

      {/* Content Area */}
      <div ref={scrollRef} className="subagent-viewer__body ui-scroll" onScroll={onScroll}>
        {activeSection === "transcript" && (
          <>
            {timeline.items.length > 0 ? (
              <NestedTimeline timeline={timeline} sessionRunning={isRunning} />
            ) : loading ? (
              <div className="subagent-viewer__empty-hint">
                <Loader2 size={16} className="spin" /> Reading subagent transcript...
              </div>
            ) : transcriptError ? (
              <div className="subagent-viewer__empty-hint">
                <AlertCircle size={16} /> {transcriptError}
              </div>
            ) : (
              <div className="subagent-viewer__empty-hint">
                {isRunning ? (
                  <>
                    <Loader2 size={16} className="spin" /> Waiting for subagent execution steps...
                  </>
                ) : (
                  "No transcript recorded for this subagent"
                )}
              </div>
            )}
          </>
        )}

        {activeSection === "prompt" && promptText && (
          <div className="subagent-viewer__markdown-pane">
            <Markdown text={promptText} />
          </div>
        )}

        {activeSection === "result" && resultText && (
          <div className="subagent-viewer__markdown-pane">
            <Markdown text={resultText} />
          </div>
        )}

        {showJump && activeSection === "transcript" && (
          <button
            type="button"
            className="subagent-viewer__jump"
            onClick={jumpToBottom}
            title="Jump to latest turn"
            aria-label="Jump to latest turn"
          >
            <ArrowDown size={16} />
          </button>
        )}
      </div>
    </div>
  );
};
