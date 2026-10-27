import React from "react";
import { ChevronDown, ExternalLink, GitBranch, Loader2, RotateCcw, Square, Wrench, Zap } from "lucide-react";
import type { ModuleHost } from "@hive/module-sdk/renderer";
import type { ActionsRun } from "../shared.ts";
import { isActiveState, useActionsStore } from "./actions-store.ts";
import { hueOf } from "./group-runs.ts";
import { RunDetail } from "./RunDetail.tsx";
import { StatusIcon } from "./StatusIcon.tsx";
import { runAgo, runDuration } from "./timing.ts";

const Avatar: React.FC<{ name: string }> = ({ name }) => (
  <span className="ga-avatar" style={{ background: `hsl(${hueOf(name)} 42% 38%)` }} aria-hidden="true">
    {name.charAt(0).toUpperCase()}
  </span>
);

export const RunCard: React.FC<{ run: ActionsRun; host: ModuleHost; now: number }> = ({ run, host, now }) => {
  const expanded = useActionsStore((s) => s.expandedRunId === run.id);
  const isFixing = useActionsStore((s) => s.fixingRunId === run.id);
  const toggleRun = useActionsStore((s) => s.toggleRun);
  const rerunRun = useActionsStore((s) => s.rerunRun);
  const cancelRun = useActionsStore((s) => s.cancelRun);
  const fixRun = useActionsStore((s) => s.fixRun);
  const duration = runDuration(run, now);
  const active = isActiveState(run.state);
  const toggle = () => toggleRun(run.id);

  return (
    <article id={`ga-run-${run.id}`} className={`ga-card ga-card--${run.state}${expanded ? " is-open" : ""}${isFixing ? " is-fixing" : ""}`}>
      <div
        className="ga-card__head"
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle();
          }
        }}
      >
        <StatusIcon state={run.state} size={13} disc />
        <div className="ga-card__main">
          <div className="ga-card__title" title={run.title}>
            {run.title}
          </div>
          <div className="ga-card__sub">
            <span className="ga-card__wf">{run.workflowName}</span>
            <span className="ga-card__num">#{run.runNumber}</span>
            {run.attempt > 1 && <span className="ga-tag">attempt {run.attempt}</span>}
          </div>
          <div className="ga-card__chips">
            <span className="ga-pill" title={run.branch || run.sha}>
              <GitBranch size={10} />
              <span className="ga-pill__text">{run.branch || run.sha.slice(0, 7)}</span>
            </span>
            <span className="ga-pill ga-pill--event">
              <Zap size={10} />
              {run.event.replace(/_/g, " ")}
            </span>
            {run.actor && (
              <span className="ga-pill ga-pill--actor" title={run.actor}>
                <Avatar name={run.actor} />
                <span className="ga-pill__text">{run.actor}</span>
              </span>
            )}
            {isFixing && (
              <span className="ga-pill ga-pill--fixing" role="status">
                <Loader2 size={10} className="ga-spin" />
                <span className="ga-pill__text">Diagnosing...</span>
              </span>
            )}
          </div>
        </div>
        <div className="ga-card__side">
          <span className="ga-card__ago">{runAgo(run, now)}</span>
          {duration && <span className={`ga-card__dur${run.state === "running" ? " is-live" : ""}`}>{duration}</span>}
          <ChevronDown size={12} className="ga-card__chev" />
        </div>
      </div>
      <div className={`ga-card__tools${isFixing ? " is-busy" : ""}`}>
        {active ? (
          <button type="button" className="ga-ib" title="Cancel run" aria-label="Cancel run" onClick={() => void cancelRun(run)}>
            <Square size={11} />
          </button>
        ) : (
          <button type="button" className="ga-ib" title="Re-run all jobs" aria-label="Re-run all jobs" onClick={() => void rerunRun(run, false)}>
            <RotateCcw size={12} />
          </button>
        )}
        {run.state === "failure" && (
          <button
            type="button"
            className={`ga-ib${isFixing ? " is-busy" : ""}`}
            disabled={isFixing}
            title={isFixing ? "Diagnosing failure: opening session..." : "Fix it: open a new session with the failure details"}
            aria-label={isFixing ? "Diagnosing failure: opening session..." : "Fix it: open a new session with the failure details"}
            onClick={(e) => {
              e.stopPropagation();
              void fixRun(run);
            }}
          >
            {isFixing ? <Loader2 size={12} className="ga-spin" /> : <Wrench size={12} />}
          </button>
        )}
        <button type="button" className="ga-ib" title="Open on GitHub" aria-label="Open run on GitHub" onClick={() => void host.openExternal(run.url)}>
          <ExternalLink size={12} />
        </button>
      </div>
      {(run.state === "running" || isFixing) && (
        <div className={`ga-progress${isFixing ? " ga-progress--fix" : ""}`} aria-hidden="true" />
      )}
      {expanded && <RunDetail run={run} host={host} now={now} />}
    </article>
  );
};
