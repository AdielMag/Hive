import React, { useState } from "react";
import { ChevronRight, ExternalLink, RotateCcw, Square } from "lucide-react";
import type { ModuleHost } from "@hive/module-sdk/renderer";
import type { ActionsJob, ActionsRun } from "../shared.ts";
import { isActiveState, useActionsStore } from "./actions-store.ts";
import { StatusIcon } from "./StatusIcon.tsx";
import { durationLabel } from "./timing.ts";

function jobMs(job: ActionsJob, now: number): number {
  if (!job.startedAt) return 0;
  const start = Date.parse(job.startedAt);
  const end = job.state === "running" ? now : job.completedAt ? Date.parse(job.completedAt) : start;
  return Number.isNaN(start) || Number.isNaN(end) ? 0 : Math.max(0, end - start);
}

/** First failed step across jobs, for the failure callout. */
export function firstFailure(jobs: ActionsJob[] | undefined): { job: ActionsJob; step: string } | null {
  for (const job of jobs ?? []) {
    if (job.state !== "failure") continue;
    const step = job.steps.find((s) => s.state === "failure");
    return { job, step: step?.name ?? "job" };
  }
  return null;
}

const JobNode: React.FC<{ job: ActionsJob; longest: number; host: ModuleHost; now: number }> = ({ job, longest, host, now }) => {
  const [open, setOpen] = useState(job.state === "failure" || job.state === "running");
  const pct = longest > 0 ? Math.max(4, Math.round((jobMs(job, now) / longest) * 100)) : 0;
  return (
    <li className={`ga-job ga-job--${job.state}${open ? " is-open" : ""}`}>
      <div className="ga-job__row">
        <button type="button" className="ga-job__toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          <ChevronRight size={12} className="ga-job__chev" />
          <StatusIcon state={job.state} size={12} disc />
          <span className="ga-job__name" title={job.name}>
            {job.name}
          </span>
          <span className="ga-job__time">{durationLabel(job.state, job.startedAt, job.completedAt, now) ?? ""}</span>
        </button>
        <button type="button" className="ga-ib ga-job__open" title="Open job on GitHub" aria-label={`Open ${job.name} on GitHub`} onClick={() => void host.openExternal(job.url)}>
          <ExternalLink size={11} />
        </button>
      </div>
      <div className="ga-bar" aria-hidden="true">
        <div className={`ga-bar__fill ga-bar__fill--${job.state}`} style={{ width: `${pct}%` }} />
      </div>
      {open && job.steps.length > 0 && (
        <ol className="ga-steps">
          {job.steps.map((step) => (
            <li key={step.number} className={`ga-step ga-step--${step.state}`}>
              <StatusIcon state={step.state} size={11} />
              <span className="ga-step__name" title={step.name}>
                {step.name}
              </span>
              <span className="ga-step__time">{durationLabel(step.state, step.startedAt, step.completedAt, now) ?? ""}</span>
            </li>
          ))}
        </ol>
      )}
    </li>
  );
};

export const RunDetail: React.FC<{ run: ActionsRun; host: ModuleHost; now: number }> = ({ run, host, now }) => {
  const jobs = useActionsStore((s) => s.jobs[run.id]);
  const rerunRun = useActionsStore((s) => s.rerunRun);
  const cancelRun = useActionsStore((s) => s.cancelRun);
  const [busy, setBusy] = useState(false);
  const act = (fn: () => Promise<boolean>) => {
    setBusy(true);
    void fn().finally(() => setBusy(false));
  };
  const failure = firstFailure(jobs);
  const longest = Math.max(0, ...(jobs ?? []).map((j) => jobMs(j, now)));

  return (
    <div className="ga-detail">
      <div className="ga-detail__actions">
        {isActiveState(run.state) ? (
          <button type="button" className="ga-btn ga-btn--danger" disabled={busy} onClick={() => act(() => cancelRun(run))}>
            <Square size={10} /> Cancel run
          </button>
        ) : (
          <>
            <button type="button" className="ga-btn" disabled={busy} onClick={() => act(() => rerunRun(run, false))}>
              <RotateCcw size={11} /> Re-run all
            </button>
            {run.state === "failure" && (
              <button type="button" className="ga-btn" disabled={busy} onClick={() => act(() => rerunRun(run, true))}>
                <RotateCcw size={11} /> Re-run failed
              </button>
            )}
          </>
        )}
        <button type="button" className="ga-btn ga-btn--ghost" onClick={() => void host.openExternal(run.url)}>
          <ExternalLink size={11} /> GitHub
        </button>
      </div>
      {failure && (
        <div className="ga-failure" role="status">
          <span className="ga-failure__where">{failure.job.name}</span>
          <span className="ga-failure__step">failed at {failure.step}</span>
        </div>
      )}
      {!jobs ? (
        <div className="ga-detail__note">Loading jobs...</div>
      ) : jobs.length === 0 ? (
        <div className="ga-detail__note">No jobs yet.</div>
      ) : (
        <ul className="ga-jobs">
          {jobs.map((job) => (
            <JobNode key={job.id} job={job} longest={longest} host={host} now={now} />
          ))}
        </ul>
      )}
    </div>
  );
};
