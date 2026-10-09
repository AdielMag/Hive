import React from "react";
import type { ActionsRun } from "../shared.ts";
import { STATE_LABEL } from "./timing.ts";

const MAX_BARS = 28;

/** Last runs as a row of small bars (oldest left, newest right), coloured by outcome. Click to jump to the run. */
export const HistoryStrip: React.FC<{ runs: ActionsRun[]; activeId: number | null; onPick: (run: ActionsRun) => void }> = ({ runs, activeId, onPick }) => {
  const bars = runs.slice(0, MAX_BARS).reverse();
  if (bars.length < 2) return null;
  const durations = bars.map((r) => Math.max(0, Date.parse(r.updatedAt) - Date.parse(r.startedAt || r.createdAt)) || 0);
  const longest = Math.max(...durations, 1);
  return (
    <div className="ga-strip" role="list" aria-label="Recent runs">
      {bars.map((run, i) => {
        const pct = 28 + Math.round(((durations[i] ?? 0) / longest) * 72);
        return (
          <button
            key={run.id}
            type="button"
            role="listitem"
            className={`ga-strip__bar ga-strip__bar--${run.state}${run.id === activeId ? " is-active" : ""}`}
            style={{ height: `${run.state === "running" || run.state === "queued" ? 60 : pct}%` }}
            title={`#${run.runNumber} ${run.title} (${STATE_LABEL[run.state]})`}
            aria-label={`Run ${run.runNumber}, ${STATE_LABEL[run.state]}`}
            onClick={() => onPick(run)}
          />
        );
      })}
    </div>
  );
};
