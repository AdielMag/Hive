import React, { useEffect, useState } from "react";
import {
  Bot,
  Brain,
  Clock,
  Coins,
  Cpu,
  Loader2,
  Maximize2,
  Square,
  Terminal,
  Wrench,
} from "lucide-react";
import type { SubagentView } from "../../lib/ai/subagents.ts";
import { formatCost, formatDuration } from "../../lib/format.ts";
import { useSessionStore } from "../../store/session-store.ts";

export interface SubagentCardProps {
  view: SubagentView;
  /** @deprecated unused; subagent details open in a popup. */
  renderNested?: unknown;
}

export const SubagentCard: React.FC<SubagentCardProps> = ({ view }) => {
  const isRunning =
    view.status === "running" || view.status === "queued" || view.status === "background";

  // Background agents expose their runner id; a running foreground agent does not, so the bridge
  // resolves it from type + description.
  const stopSubagent = useSessionStore((s) => s.stopSubagent);
  const [stopping, setStopping] = useState(false);
  useEffect(() => {
    if (!isRunning) setStopping(false);
  }, [isRunning]);
  useEffect(() => {
    if (!stopping) return;
    // If the stop failed (error is surfaced by the store) let the user retry.
    const t = setTimeout(() => setStopping(false), 6000);
    return () => clearTimeout(t);
  }, [stopping]);
  const canStop = isRunning;

  const effectiveDuration = view.durationMs
    ? formatDuration(view.durationMs)
    : undefined;

  const openSubagentModal = useSessionStore((s) => s.openSubagentModal);
  const activeTab = useSessionStore((s) => s.tabs.find((t) => t.id === s.activeTabId));
  const activeKey = useSessionStore((s) => s.activeKey);

  const handleOpenModal = (e: React.MouseEvent) => {
    e.stopPropagation();
    openSubagentModal({
      view,
      parentSessionPath: activeTab?.sessionPath,
      parentActiveKey: activeTab?.activeKey ?? activeKey ?? undefined,
      projectId: activeTab?.projectId,
    });
  };

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
        onClick={handleOpenModal}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleOpenModal(e as unknown as React.MouseEvent);
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
          {isRunning ? (
            <div
              className="msg-agent-card__activity"
              onClick={handleOpenModal}
              title="Open in popup"
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  handleOpenModal(e as any);
                }
              }}
            >
              <span className="pulse-dot" />
              <span className="msg-agent-card__activity-text">
                {view.activity || (view.status === "queued" ? "Queued in runner..." : "Working...")}
              </span>
              <span className="msg-agent-card__activity-action">Open</span>
            </div>
          ) : view.resultText ? (
            <div
              className="msg-agent-card__activity msg-agent-card__activity--done"
              onClick={handleOpenModal}
              title="Open in popup"
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  handleOpenModal(e as any);
                }
              }}
            >
              <span className="msg-agent-card__activity-text">Execution complete</span>
              <span className="msg-agent-card__activity-action">Open</span>
            </div>
          ) : null}
        </div>

        <div className="msg-agent-card__right">
          <span className={`msg-agent-card__status-chip status-${view.status}`}>
            {isRunning && <Loader2 size={11} className="spin" />}
            {view.status}
          </span>
          {canStop && (
            <button
              type="button"
              className="ui-btn ui-btn--ghost ui-btn--icon msg-agent-card__stop"
              title={
                stopping
                  ? "Stopping…"
                  : view.status === "queued"
                  ? "Cancel this queued subagent"
                  : "Stop this subagent"
              }
              aria-label={`Stop subagent ${view.description}`}
              disabled={stopping}
              onClick={(e) => {
                e.stopPropagation();
                setStopping(true);
                void stopSubagent({ agentId: view.stopId, type: view.type, description: view.description });
              }}
              onKeyDown={(e) => e.stopPropagation()}
            >
              {stopping ? <Loader2 size={13} className="spin" /> : <Square size={12} fill="currentColor" />}
            </button>
          )}
          <button
            type="button"
            className="ui-btn ui-btn--ghost ui-btn--icon"
            title="Open in popup"
            aria-label={`Open subagent ${view.description} in popup`}
            onClick={handleOpenModal}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <Maximize2 size={13} />
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
    </div>
  );
};
