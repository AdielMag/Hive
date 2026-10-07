/**
 * Agent time strip above the composer editor: total time the LLM worked in this session, plus the run in
 * progress (live) or the last finished turn. Hidden until the session has at least one timed turn.
 */
import React, { useEffect, useMemo, useState } from "react";
import { Timer } from "lucide-react";
import { computeTurnStats } from "@hive/pi-adapter";
import { useSessionStore } from "../store/session-store.ts";
import { formatElapsed } from "../lib/format.ts";
import "../styles/run-time-bar.css";

/** Re-render once a second while `active`; returns the current time. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

export const RunTimeBar: React.FC = () => {
  const transcript = useSessionStore((s) => s.transcript);
  const running = transcript.running;
  const stats = useMemo(() => computeTurnStats(transcript), [transcript.revision, transcript.running, transcript.runStartedAt, transcript.leafId, transcript.tools]);
  const now = useNow(running);

  const activeStart = stats.activeStart;
  const runStart = stats.runStartedAt ?? activeStart;
  // Time spent waiting for the user to answer a question is not agent time: the clock pauses meanwhile.
  const waiting = running && stats.waitingSince !== null;
  const paused = waiting ? Math.max(0, now - (stats.waitingSince ?? now)) : 0;
  const excluded = stats.activeWaitedMs + paused;
  const turnMs = running && activeStart !== null ? Math.max(0, now - activeStart - excluded) : 0;
  const totalMs = stats.completedMs + turnMs;
  if (!running && stats.turns === 0) return null;
  if (running && totalMs === 0 && runStart === null) return null;

  return (
    <div
      className={`run-time-bar${running ? " is-running" : ""}`}
      role="timer"
      aria-label="Agent time"
      title="Time the agent has worked in this session (from each message until it answered, asked or finished)"
    >
      <span className="run-time-bar__item">
        <Timer size={12} />
        Session <strong>{formatElapsed(totalMs)}</strong>
      </span>
      {running && runStart !== null ? (
        <>
          <span className="run-time-bar__sep">·</span>
          <span className="run-time-bar__item run-time-bar__item--live">
            {waiting ? "Paused · waiting for you " : "Now "}
            <strong>{formatElapsed(Math.max(0, now - runStart - excluded))}</strong>
          </span>
        </>
      ) : stats.turns > 0 ? (
        <>
          <span className="run-time-bar__sep">·</span>
          <span className="run-time-bar__item">
            Last turn <strong>{formatElapsed(stats.lastMs)}</strong>
          </span>
        </>
      ) : null}
    </div>
  );
};
