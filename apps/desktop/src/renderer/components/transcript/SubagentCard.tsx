import React, { useState } from "react";
import {
  Bot,
  Brain,
  ChevronDown,
  ChevronRight,
  Clock,
  Coins,
  Cpu,
  Loader2,
  Terminal,
  Wrench,
} from "lucide-react";
import type { Timeline } from "@hive/pi-adapter";
import type { SubagentView } from "../../lib/ai/subagents.ts";
import { formatCost, formatDuration } from "../../lib/format.ts";
import { useSubagentOutput } from "../../hooks/useSubagentOutput.ts";
import { Markdown } from "../code/Markdown.tsx";

export interface SubagentCardProps {
  view: SubagentView;
  renderNested?: (timeline: Timeline) => React.ReactNode;
}

export const SubagentCard: React.FC<SubagentCardProps> = ({ view, renderNested }) => {
  const [expanded, setExpanded] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);

  const { timeline, prompt: outputPrompt, loading, error: transcriptError } = useSubagentOutput(
    view,
    expanded,
  );

  const isRunning =
    view.status === "running" || view.status === "queued" || view.status === "background";

  const effectiveDuration = view.durationMs
    ? formatDuration(view.durationMs)
    : undefined;

  const promptText = view.prompt || outputPrompt;

  const toneClass =
    view.status === "completed"
      ? "is-completed"
      : view.status === "error" || view.status === "aborted" || view.status === "stopped"
      ? "is-error"
      : view.status === "background"
      ? "is-background"
      : "is-running";

  return (
    <div
      className={`msg-agent-card ui-card ${toneClass}`}
      data-tool-call-id={view.toolCallId}
      role="region"
      aria-label={`Subagent ${view.type}: ${view.description}`}
    >
      {/* Top Header */}
      <div
        className="msg-agent-card__header"
        onClick={() => setExpanded((prev) => !prev)}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded((prev) => !prev);
          }
        }}
      >
        <div className="msg-agent-card__icon">
          <Bot size={15} />
        </div>

        <div className="msg-agent-card__title-area">
          <div className="msg-agent-card__top-line">
            <span className="msg-agent-card__type ui-chip ui-chip--accent">
              {view.type}
            </span>
            <span className="msg-agent-card__desc" title={view.description}>
              {view.description}
            </span>
            <div className="msg-agent-card__badges">
              {view.model && (
                <span className="ui-chip ui-chip--neutral" title="Model">
                  <Cpu size={10} /> {view.model}
                </span>
              )}
              {view.thinking && (
                <span className="ui-chip ui-chip--neutral" title="Thinking level">
                  <Brain size={10} /> {view.thinking}
                </span>
              )}
              {view.tags.map((tag, idx) => (
                <span key={idx} className="ui-chip ui-chip--neutral">
                  {tag}
                </span>
              ))}
            </div>
          </div>

          {/* Live activity line */}
          {isRunning && (
            <div className="msg-agent-card__activity">
              <span className="pulse-dot" />
              <span>{view.activity || (view.status === "queued" ? "Queued in runner..." : "Working...")}</span>
            </div>
          )}
        </div>

        <div className="msg-agent-card__right">
          <span className={`msg-agent-card__status-chip status-${view.status}`}>
            {isRunning && <Loader2 size={11} className="spin" />}
            {view.status}
          </span>
          <button
            type="button"
            className="ui-btn ui-btn--ghost ui-btn--icon"
            title={expanded ? "Collapse subagent details" : "Expand subagent details"}
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="msg-agent-card__stats">
        {view.toolUses !== undefined && (
          <span className="msg-agent-card__stat" title="Tool calls made by subagent">
            <Wrench size={11} /> {view.toolUses} {view.toolUses === 1 ? "tool" : "tools"}
          </span>
        )}
        {view.turns !== undefined && (
          <span className="msg-agent-card__stat" title="Conversation turns">
            <Terminal size={11} /> turn {view.turns}
            {view.maxTurns ? `/${view.maxTurns}` : ""}
          </span>
        )}
        {view.tokens && (
          <span className="msg-agent-card__stat" title="Tokens used">
            {view.tokens}
          </span>
        )}
        {view.cost !== undefined && view.cost > 0 && (
          <span className="msg-agent-card__stat" title="Subagent estimated cost">
            <Coins size={11} /> {formatCost(view.cost)}
          </span>
        )}
        {effectiveDuration && (
          <span className="msg-agent-card__stat" title="Duration">
            <Clock size={11} /> {effectiveDuration}
          </span>
        )}
        {view.agentId && (
          <span className="msg-agent-card__id mono" title={`Agent ID: ${view.agentId}`}>
            id: {view.agentId.slice(0, 8)}
          </span>
        )}
      </div>

      {/* Expanded Content Area */}
      {expanded && (
        <div className="msg-agent-card__body">
          {/* Subagent Prompt */}
          {promptText && (
            <div className="msg-agent-card__prompt-section">
              <button
                type="button"
                className="msg-agent-card__section-toggle"
                onClick={() => setShowPrompt((p) => !p)}
              >
                {showPrompt ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                <span>Prompt instructions</span>
              </button>
              {showPrompt && (
                <div className="msg-agent-card__prompt-text ui-scroll">
                  <Markdown text={promptText} />
                </div>
              )}
            </div>
          )}

          {/* Subagent's Own Transcript */}
          <div className="msg-agent-card__transcript-section">
            <div className="msg-agent-card__section-title">Subagent Execution Transcript</div>
            {timeline.items.length > 0 && renderNested ? (
              <div className="msg-agent-card__nested-timeline">
                {renderNested(timeline)}
              </div>
            ) : loading ? (
              <div className="msg-agent-card__empty-hint">
                <Loader2 size={14} className="spin" /> Reading subagent transcript...
              </div>
            ) : transcriptError ? (
              <div className="msg-agent-card__empty-hint">{transcriptError}</div>
            ) : (
              <div className="msg-agent-card__empty-hint">
                {isRunning ? "Waiting for subagent turns..." : "No transcript recorded"}
              </div>
            )}
          </div>

          {/* Final Result Output */}
          {view.resultText && (
            <div className="msg-agent-card__result-section">
              <div className="msg-agent-card__section-title">Result</div>
              <div className="msg-agent-card__result-text">
                <Markdown text={view.resultText} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
