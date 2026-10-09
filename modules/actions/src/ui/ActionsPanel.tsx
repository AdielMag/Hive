import React, { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, FolderOpen, GitBranch, Inbox, KeyRound, Play, RefreshCw, SearchX, X } from "lucide-react";
import type { ModuleHost } from "@hive/module-sdk/renderer";
import { formatAgo } from "@hive/module-sdk/format";
import type { ActionsRun } from "../shared.ts";
import { isActiveState, setPanelMounted, useActionsStore } from "./actions-store.ts";
import { DispatchForm } from "./DispatchForm.tsx";
import { EmptyState, SkeletonList } from "./EmptyState.tsx";
import { FilterBar } from "./FilterBar.tsx";
import { countStates, groupRuns } from "./group-runs.ts";
import { HistoryStrip } from "./HistoryStrip.tsx";
import { RunCard } from "./RunCard.tsx";
import { TokenCard } from "./TokenCard.tsx";

/** Re-renders every second while `active`, so running durations tick. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return active ? now : Date.now();
}

const Stat: React.FC<{ kind: string; n: number; label: string }> = ({ kind, n, label }) =>
  n > 0 ? (
    <span className={`ga-stat ga-stat--${kind}`}>
      <span className="ga-stat__dot" />
      <b>{n}</b> {label}
    </span>
  ) : null;

export const ActionsPanel: React.FC<{ host: ModuleHost }> = ({ host }) => {
  const repo = useActionsStore((s) => s.repo);
  const runs = useActionsStore((s) => s.runs);
  const workflows = useActionsStore((s) => s.workflows);
  const filters = useActionsStore((s) => s.filters);
  const loading = useActionsStore((s) => s.loading);
  const loadingMore = useActionsStore((s) => s.loadingMore);
  const error = useActionsStore((s) => s.error);
  const notice = useActionsStore((s) => s.notice);
  const totalCount = useActionsStore((s) => s.totalCount);
  const expandedRunId = useActionsStore((s) => s.expandedRunId);
  const expandedJobs = useActionsStore((s) => (s.expandedRunId === null ? undefined : s.jobs[s.expandedRunId]));
  const lastFetchedAt = useActionsStore((s) => s.lastFetchedAt);
  const refresh = useActionsStore((s) => s.refresh);
  const loadMore = useActionsStore((s) => s.loadMore);
  const setFilters = useActionsStore((s) => s.setFilters);
  const clearToken = useActionsStore((s) => s.clearToken);
  const dismissNotice = useActionsStore((s) => s.dismissNotice);
  const toggleRun = useActionsStore((s) => s.toggleRun);

  const project = host.sessions.activeProject();
  const [showDispatch, setShowDispatch] = useState(false);
  const hasActive = runs.some((r) => isActiveState(r.state));
  const ticking = runs.some((r) => r.state === "running") || expandedJobs?.some((j) => j.state === "running") === true;
  const now = useNow(ticking);
  const counts = useMemo(() => countStates(runs), [runs]);
  const groups = useMemo(() => groupRuns(runs, now), [runs, now]);

  useEffect(() => {
    setPanelMounted(1);
    void useActionsStore.getState().refresh({ silent: true });
    return () => setPanelMounted(-1);
  }, []);

  // Successful write notices clear themselves; errors stay until dismissed.
  useEffect(() => {
    if (notice?.kind !== "ok") return;
    const t = setTimeout(dismissNotice, 5000);
    return () => clearTimeout(t);
  }, [notice, dismissNotice]);

  if (!project) {
    return (
      <div className="ga">
        <EmptyState icon={<FolderOpen size={22} />} title="No project open" text="Open a project to see its GitHub Actions runs." />
      </div>
    );
  }

  const repoName = repo ? `${repo.owner}/${repo.repo}` : null;
  const noRepo = error?.code === "not_github" || error?.code === "no_remote";
  const needsToken = error?.code === "unauthorized" || error?.code === "not_found" || error?.code === "rate_limited" || (repo?.tokenSource === "none" && runs.length > 0);
  const tokenHint =
    error?.code === "rate_limited" ? "Rate limit reached. A token raises it." : error?.code === "not_found" ? "Private repo? A token gives access." : "Add a token for private repos and a higher rate limit.";
  const filtered = filters.status !== "all" || filters.workflowId !== null || filters.branch !== "all";
  const firstLoad = loading && runs.length === 0;

  const jumpTo = (run: ActionsRun) => {
    if (expandedRunId !== run.id) toggleRun(run.id);
    requestAnimationFrame(() => document.getElementById(`ga-run-${run.id}`)?.scrollIntoView({ block: "start", behavior: "smooth" }));
  };

  return (
    <div className="ga">
      <header className="ga-head">
        <div className="ga-head__title">
          <span className="ga-head__logo">
            <Play size={12} fill="currentColor" />
          </span>
          <div className="ga-head__text">
            <span className="ga-head__name">Actions</span>
            {repoName && (
              <button type="button" className="ga-repo" title="Open on GitHub" onClick={() => void host.openExternal(`https://github.com/${repoName}/actions`)}>
                {repoName}
              </button>
            )}
          </div>
        </div>
        <div className="ga-head__tools">
          {repo && (
            <button type="button" className={`ga-ib${showDispatch ? " is-on" : ""}`} title="Run workflow" aria-label="Run workflow" aria-pressed={showDispatch} onClick={() => setShowDispatch((v) => !v)}>
              <Play size={13} />
            </button>
          )}
          {repo?.tokenSource === "saved" && (
            <button type="button" className="ga-ib" title="Remove saved GitHub token" aria-label="Remove saved GitHub token" onClick={() => void clearToken()}>
              <KeyRound size={13} />
            </button>
          )}
          <button type="button" className="ga-ib" title="Refresh" aria-label="Refresh" disabled={loading} onClick={() => void refresh()}>
            <RefreshCw size={13} className={loading ? "ga-spin" : undefined} />
          </button>
        </div>
      </header>

      {repo && runs.length > 0 && (
        <section className="ga-summary" aria-label="Summary">
          <div className="ga-summary__stats">
            <Stat kind="running" n={counts.running} label="running" />
            <Stat kind="queued" n={counts.queued} label="queued" />
            <Stat kind="failure" n={counts.failure} label="failed" />
            <Stat kind="success" n={counts.success} label="passed" />
          </div>
          <HistoryStrip runs={runs} activeId={expandedRunId} onPick={jumpTo} />
        </section>
      )}

      {repo && <FilterBar repo={repo} workflows={workflows} filters={filters} onChange={setFilters} />}

      {showDispatch && repo && <DispatchForm onClose={() => setShowDispatch(false)} />}

      {notice && (
        <div className={`ga-banner ga-banner--${notice.kind}`} role="status">
          {notice.kind === "ok" ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
          <span>{notice.message}</span>
          <button type="button" className="ga-ib ga-banner__x" title="Dismiss" aria-label="Dismiss" onClick={dismissNotice}>
            <X size={11} />
          </button>
        </div>
      )}
      {error && !noRepo && (
        <div className="ga-banner ga-banner--error" role="alert">
          <AlertCircle size={14} />
          <span>{error.message}</span>
        </div>
      )}
      {needsToken && <TokenCard host={host} hint={tokenHint} />}

      <div className={`ga-list${loading && runs.length > 0 ? " is-busy" : ""}`}>
        {noRepo && <EmptyState icon={<GitBranch size={22} />} title="Not a GitHub repository" text={error?.message} />}
        {firstLoad && <SkeletonList />}
        {groups.map((group) => (
          <section key={group.label} className="ga-group">
            <h3 className="ga-group__title">{group.label}</h3>
            {group.runs.map((run) => (
              <RunCard key={run.id} run={run} host={host} now={now} />
            ))}
          </section>
        ))}
        {!error && !loading && repo && runs.length === 0 && (
          <EmptyState
            icon={filtered ? <SearchX size={22} /> : <Inbox size={22} />}
            title={filtered ? "No runs match" : "No workflow runs yet"}
            text={filtered ? "Try a different status, branch or workflow." : "Push a commit or run a workflow to see it here."}
          >
            {filtered && (
              <button type="button" className="ga-btn" onClick={() => setFilters({ status: "all", branch: "all", workflowId: null })}>
                Clear filters
              </button>
            )}
          </EmptyState>
        )}
        {runs.length > 0 && runs.length < totalCount && (
          <button type="button" className="ga-btn ga-more" disabled={loadingMore} onClick={() => void loadMore()}>
            {loadingMore ? "Loading..." : `Show more (${runs.length} of ${totalCount})`}
          </button>
        )}
      </div>

      {repo && (
        <footer className="ga-foot">
          <span className={`ga-live${hasActive ? " is-live" : ""}`} />
          <span>{hasActive ? "Live, updating every few seconds" : lastFetchedAt ? `Updated ${formatAgo(lastFetchedAt, now)}` : "Waiting for first update"}</span>
        </footer>
      )}
    </div>
  );
};
