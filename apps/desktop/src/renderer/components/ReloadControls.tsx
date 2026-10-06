/**
 * Per-session Pi reload UI in the composer: a toolbar button that starts the reload, and a strip above
 * the editor showing progress ("Reloading…"), what changed, or why it failed. While a session reloads its
 * composer is locked (see Composer), because Pi is replacing its extension runtime underneath it.
 */
import React from "react";
import { CheckCircle2, Loader2, RefreshCw, TriangleAlert, X } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useSessionStore } from "../store/session-store.ts";
import "../styles/reload-controls.css";

export const ReloadButton: React.FC = () => {
  const { activeKey, running, phase, reloadPi } = useSessionStore(
    useShallow((s) => ({
      activeKey: s.activeKey,
      running: s.transcript.running,
      phase: s.activeKey ? s.reloadStates[s.activeKey]?.phase : undefined,
      reloadPi: s.reloadPi,
    })),
  );
  const reloading = phase === "reloading";
  const disabled = !activeKey || running || reloading;
  const title = !activeKey
    ? "Reload Pi (open a session first)"
    : reloading
      ? "Reloading…"
      : running
        ? "Reload is unavailable while the agent is running"
        : phase === "error"
          ? "Retry reload"
          : "Reload Pi: extensions, skills, prompts, MCP";
  return (
    <button
      type="button"
      className={`reload-btn${reloading ? " is-reloading" : ""}${phase === "error" ? " is-error" : ""}`}
      onClick={() => void reloadPi()}
      disabled={disabled}
      title={title}
      aria-label="Reload Pi"
    >
      <RefreshCw size={12} className={reloading ? "spin" : undefined} />
    </button>
  );
};

/** Progress/result strip for the active session's reload. Renders nothing when idle. */
export const ReloadStatusBar: React.FC = () => {
  const { activeKey, state, dismissReload, reloadPi } = useSessionStore(
    useShallow((s) => ({
      activeKey: s.activeKey,
      state: s.activeKey ? s.reloadStates[s.activeKey] : undefined,
      dismissReload: s.dismissReload,
      reloadPi: s.reloadPi,
    })),
  );
  if (!activeKey || !state) return null;
  const { phase, message, detail } = state;
  return (
    <div className={`reload-bar is-${phase}`} role={phase === "error" ? "alert" : "status"} aria-live="polite" title={detail}>
      <span className="reload-bar__icon">
        {phase === "reloading" ? (
          <Loader2 size={14} className="spin" />
        ) : phase === "success" ? (
          <CheckCircle2 size={14} />
        ) : (
          <TriangleAlert size={14} />
        )}
      </span>
      <span className="reload-bar__text">
        {phase === "reloading" && <strong>Reloading Pi</strong>}
        {phase === "success" && <strong>Reloaded</strong>}
        {phase === "error" && <strong>Reload failed</strong>}
        <span className="reload-bar__msg">{phase === "reloading" ? "· session paused until it finishes" : `· ${message}`}</span>
      </span>
      {phase === "error" && (
        <button type="button" className="reload-bar__action" onClick={() => void reloadPi()}>
          Retry
        </button>
      )}
      {phase !== "reloading" && (
        <button
          type="button"
          className="reload-bar__close"
          onClick={() => dismissReload(activeKey)}
          title="Dismiss"
          aria-label="Dismiss"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
};
