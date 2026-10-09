import React, { useEffect, useState } from "react";
import { AlertCircle, ChevronDown, ChevronRight, ExternalLink, GitBranch, KeyRound, Play, RefreshCw } from "lucide-react";
import type { ModuleHost } from "@hive/module-sdk/renderer";
import type { ActionsJob, ActionsRun, RunStatusFilter } from "../shared.ts";
import { isActiveState, setPanelMounted, useActionsStore } from "./actions-store.ts";
import { StatusIcon } from "./StatusIcon.tsx";
import { durationLabel, runAgo, runDuration } from "./timing.ts";

const STATUS_OPTIONS: Array<{ value: RunStatusFilter; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "in_progress", label: "In progress" },
  { value: "queued", label: "Queued" },
  { value: "success", label: "Success" },
  { value: "failure", label: "Failed" },
  { value: "cancelled", label: "Cancelled" },
];

/** Re-renders every second while `active`, so running durations tick. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return active ? now : Date.now();
}

const TokenForm: React.FC<{ hint?: string }> = ({ hint }) => {
  const saveToken = useActionsStore((s) => s.saveToken);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="ga-token"
      onSubmit={(e) => {
        e.preventDefault();
        if (!value.trim()) return;
        setBusy(true);
        void saveToken(value).finally(() => {
          setBusy(false);
          setValue("");
        });
      }}
    >
      {hint && <div className="ga-token__hint">{hint}</div>}
      <input
        type="password"
        className="ga-input"
        placeholder="GitHub token (repo / actions:read)"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        autoComplete="off"
        spellCheck={false}
      />
      <button type="submit" className="ga-btn" disabled={busy || !value.trim()}>
        Save token
      </button>
    </form>
  );
};

const JobList: React.FC<{ jobs: ActionsJob[] | undefined; host: ModuleHost; now: number }> = ({ jobs, host, now }) => {
  if (!jobs) return <div className="ga-muted ga-pad">Loading jobs...</div>;
  if (jobs.length === 0) return <div className="ga-muted ga-pad">No jobs yet.</div>;
  return (
    <div className="ga-jobs">
      {jobs.map((job) => (
        <details key={job.id} className="ga-job" open={job.state === "running" || job.state === "failure"}>
          <summary>
            <StatusIcon state={job.state} size={13} />
            <span className="ga-job__name">{job.name}</span>
            <span className="ga-dim">{durationLabel(job.state, job.startedAt, job.completedAt, now) ?? ""}</span>
            <button
              type="button"
              className="ga-ib"
              title="Open job on GitHub"
              onClick={(e) => {
                e.preventDefault();
                void host.openExternal(job.url);
              }}
            >
              <ExternalLink size={11} />
            </button>
          </summary>
          <ul className="ga-steps">
            {job.steps.map((step) => (
              <li key={step.number} className="ga-step">
                <StatusIcon state={step.state} size={11} />
                <span className="ga-step__name">{step.name}</span>
                <span className="ga-dim">{durationLabel(step.state, step.startedAt, step.completedAt, now) ?? ""}</span>
              </li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
};

const RunRow: React.FC<{ run: ActionsRun; host: ModuleHost; now: number }> = ({ run, host, now }) => {
  const expanded = useActionsStore((s) => s.expandedRunId === run.id);
  const jobs = useActionsStore((s) => s.jobs[run.id]);
  const toggleRun = useActionsStore((s) => s.toggleRun);
  const duration = runDuration(run, now);
  return (
    <div className={`ga-run${expanded ? " ga-run--open" : ""}`}>
      <div className="ga-run__head" role="button" tabIndex={0} onClick={() => toggleRun(run.id)} onKeyDown={(e) => e.key === "Enter" && toggleRun(run.id)}>
        <StatusIcon state={run.state} />
        <div className="ga-run__main">
          <div className="ga-run__title" title={run.title}>
            {run.title}
          </div>
          <div className="ga-run__meta">
            <span>
              {run.workflowName} #{run.runNumber}
              {run.attempt > 1 ? ` (attempt ${run.attempt})` : ""}
            </span>
            <span className="ga-chip" title={run.branch}>
              <GitBranch size={10} />
              {run.branch || run.sha.slice(0, 7)}
            </span>
            <span>{run.event}</span>
            {run.actor && <span>{run.actor}</span>}
          </div>
          <div className="ga-run__meta ga-dim">
            <span>{runAgo(run, now)}</span>
            {duration && <span>{duration}</span>}
          </div>
        </div>
        {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
      </div>
      {expanded && (
        <div className="ga-run__body">
          <button type="button" className="ga-btn ga-btn--link" onClick={() => void host.openExternal(run.url)}>
            <ExternalLink size={11} /> Open run on GitHub
          </button>
          <JobList jobs={jobs} host={host} now={now} />
        </div>
      )}
    </div>
  );
};

export const ActionsPanel: React.FC<{ host: ModuleHost }> = ({ host }) => {
  const s = useActionsStore();
  const hasActive = s.runs.some((r) => isActiveState(r.state));
  const now = useNow(s.runs.some((r) => r.state === "running") || s.jobs[s.expandedRunId ?? -1]?.some((j) => j.state === "running") === true);
  const project = host.sessions.activeProject();

  useEffect(() => {
    setPanelMounted(1);
    void useActionsStore.getState().refresh({ silent: true });
    return () => setPanelMounted(-1);
  }, []);

  if (!project) return <div className="ga-msg">No project active. Select or open a project first.</div>;

  const err = s.error;
  const repoName = s.repo ? `${s.repo.owner}/${s.repo.repo}` : null;
  const showToken = err?.code === "unauthorized" || err?.code === "not_found" || err?.code === "rate_limited" || (s.repo?.tokenSource === "none" && s.runs.length > 0);

  return (
    <div className="ga">
      <div className="ga-head">
        <div className="ga-head__title">
          <Play size={15} color="var(--accent-base)" />
          <span>Actions</span>
          {repoName && (
            <button type="button" className="ga-repo" title="Open on GitHub" onClick={() => void host.openExternal(`https://github.com/${repoName}/actions`)}>
              {repoName}
            </button>
          )}
        </div>
        <div className="ga-head__tools">
          {s.repo?.tokenSource === "saved" && (
            <button type="button" className="ga-ib" title="Remove saved GitHub token" onClick={() => void s.clearToken()}>
              <KeyRound size={13} />
            </button>
          )}
          <button type="button" className="ga-ib" title="Refresh" disabled={s.loading} onClick={() => void s.refresh()}>
            <RefreshCw size={13} className={s.loading ? "ga-spin" : undefined} />
          </button>
        </div>
      </div>

      {s.repo && (
        <div className="ga-filters">
          <select className="ga-select" value={s.filters.status} onChange={(e) => s.setFilters({ status: e.target.value as RunStatusFilter })}>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            className="ga-select"
            value={s.filters.workflowId ?? ""}
            onChange={(e) => s.setFilters({ workflowId: e.target.value ? Number(e.target.value) : null })}
          >
            <option value="">All workflows</option>
            {s.workflows.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          <select className="ga-select" value={s.filters.branch} onChange={(e) => s.setFilters({ branch: e.target.value as "all" | "current" })}>
            <option value="all">All branches</option>
            <option value="current" disabled={!s.repo.branch}>
              {s.repo.branch ? `Branch: ${s.repo.branch}` : "Current branch"}
            </option>
          </select>
        </div>
      )}

      {err && (
        <div className="ga-banner">
          <AlertCircle size={13} />
          <span>{err.message}</span>
        </div>
      )}
      {showToken && <TokenForm hint={err?.code === "rate_limited" ? undefined : "Private repo or higher rate limit? Add a token."} />}

      <div className="ga-list">
        {s.runs.map((run) => (
          <RunRow key={run.id} run={run} host={host} now={now} />
        ))}
        {!err && !s.loading && s.repo && s.runs.length === 0 && (
          <div className="ga-msg">{s.filters.status !== "all" || s.filters.workflowId !== null || s.filters.branch !== "all" ? "No runs match these filters." : "No workflow runs yet."}</div>
        )}
        {s.loading && s.runs.length === 0 && <div className="ga-msg">Loading runs...</div>}
        {s.runs.length < s.totalCount && (
          <button type="button" className="ga-btn ga-more" disabled={s.loadingMore} onClick={() => void s.loadMore()}>
            {s.loadingMore ? "Loading..." : `Load more (${s.runs.length} of ${s.totalCount})`}
          </button>
        )}
      </div>
      {hasActive && <div className="ga-foot ga-dim">Live: refreshing every few seconds</div>}
    </div>
  );
};
