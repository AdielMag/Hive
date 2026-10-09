/** Minimal GitHub REST client for Actions: normalisation, ETag caching, error mapping. */
import type {
  ActionsErrorCode,
  ActionsJob,
  ActionsResult,
  ActionsRun,
  ActionsState,
  ActionsStep,
  ActionsWorkflow,
  RepoRef,
  RunsPage,
  RunsQuery,
} from "../shared.ts";

const API = "https://api.github.com";

/** Collapses GitHub's `status` + `conclusion` into one display state. */
export function toState(status: string | null | undefined, conclusion: string | null | undefined): ActionsState {
  if (status === "completed") {
    switch (conclusion) {
      case "success":
        return "success";
      case "failure":
      case "timed_out":
      case "startup_failure":
        return "failure";
      case "cancelled":
        return "cancelled";
      case "skipped":
        return "skipped";
      default:
        return "neutral";
    }
  }
  if (status === "in_progress") return "running";
  return "queued"; // queued, waiting, requested, pending
}

export function normalizeRun(r: any): ActionsRun {
  return {
    id: r.id,
    runNumber: r.run_number,
    attempt: r.run_attempt ?? 1,
    title: r.display_title || r.head_commit?.message?.split("\n")[0] || r.name || `Run #${r.run_number}`,
    workflowId: r.workflow_id,
    workflowName: r.name ?? "",
    event: r.event ?? "",
    branch: r.head_branch ?? "",
    sha: r.head_sha ?? "",
    actor: r.triggering_actor?.login ?? r.actor?.login ?? "",
    state: toState(r.status, r.conclusion),
    createdAt: r.created_at,
    startedAt: r.run_started_at ?? r.created_at,
    updatedAt: r.updated_at,
    url: r.html_url,
  };
}

function normalizeStep(s: any): ActionsStep {
  return {
    number: s.number,
    name: s.name,
    state: toState(s.status, s.conclusion),
    startedAt: s.started_at ?? undefined,
    completedAt: s.completed_at ?? undefined,
  };
}

export function normalizeJob(j: any): ActionsJob {
  return {
    id: j.id,
    name: j.name,
    state: toState(j.status, j.conclusion),
    startedAt: j.started_at ?? undefined,
    completedAt: j.completed_at ?? undefined,
    url: j.html_url,
    runnerName: j.runner_name ?? undefined,
    steps: Array.isArray(j.steps) ? j.steps.map(normalizeStep) : [],
  };
}

class ApiError extends Error {
  constructor(
    readonly code: ActionsErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface GithubClientOptions {
  getToken: () => Promise<string | null>;
  fetchImpl?: typeof fetch;
}

export function createGithubClient({ getToken, fetchImpl = fetch }: GithubClientOptions) {
  const etags = new Map<string, { etag: string; body: unknown; token: string | null }>();

  async function get(path: string, params: Record<string, string | number | undefined> = {}): Promise<any> {
    const url = new URL(API + path);
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    const key = url.toString();
    const token = await getToken();
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "Hive-Desktop",
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    const cached = etags.get(key);
    if (cached && cached.token === token) headers["If-None-Match"] = cached.etag;

    let res: Response;
    try {
      res = await fetchImpl(key, { headers, signal: AbortSignal.timeout(15_000) });
    } catch (err: any) {
      throw new ApiError("network", `Could not reach GitHub: ${err?.message ?? err}`);
    }
    if (res.status === 304 && cached) return cached.body;
    if (res.ok) {
      const body = await res.json();
      const etag = res.headers.get("etag");
      if (etag) etags.set(key, { etag, body, token });
      return body;
    }
    const remaining = res.headers.get("x-ratelimit-remaining");
    const reset = Number(res.headers.get("x-ratelimit-reset"));
    if (res.status === 401) throw new ApiError("unauthorized", "GitHub rejected the token (expired or revoked).");
    if ((res.status === 403 || res.status === 429) && remaining === "0") {
      const when = reset ? ` Resets at ${new Date(reset * 1000).toLocaleTimeString()}.` : "";
      throw new ApiError("rate_limited", `GitHub API rate limit reached.${when}${token ? "" : " Add a token for a higher limit."}`);
    }
    if (res.status === 404) {
      throw new ApiError(
        "not_found",
        token ? "Repository not found, or the token has no access to its Actions." : "Repository not found. If it is private, add a GitHub token.",
      );
    }
    if (res.status === 403) throw new ApiError("unauthorized", "Access denied. The token needs permission to read Actions (repo / actions:read).");
    throw new ApiError("unknown", `GitHub returned ${res.status} ${res.statusText}`);
  }

  async function wrap<T>(fn: () => Promise<T>): Promise<ActionsResult<T>> {
    try {
      return { ok: true, data: await fn() };
    } catch (err: any) {
      if (err instanceof ApiError) return { ok: false, code: err.code, message: err.message };
      return { ok: false, code: "unknown", message: err?.message ?? String(err) };
    }
  }

  const base = (r: RepoRef) => `/repos/${encodeURIComponent(r.owner)}/${encodeURIComponent(r.repo)}/actions`;

  return {
    runs: (repo: RepoRef, q: RunsQuery): Promise<ActionsResult<RunsPage>> =>
      wrap(async () => {
        const path = q.workflowId ? `${base(repo)}/workflows/${q.workflowId}/runs` : `${base(repo)}/runs`;
        const body = await get(path, {
          per_page: q.perPage ?? 30,
          page: q.page ?? 1,
          branch: q.branch,
          status: q.status && q.status !== "all" ? q.status : undefined,
        });
        return { runs: (body.workflow_runs ?? []).map(normalizeRun), totalCount: body.total_count ?? 0 };
      }),
    jobs: (repo: RepoRef, runId: number): Promise<ActionsResult<ActionsJob[]>> =>
      wrap(async () => {
        const body = await get(`${base(repo)}/runs/${runId}/jobs`, { per_page: 100, filter: "latest" });
        return (body.jobs ?? []).map(normalizeJob);
      }),
    workflows: (repo: RepoRef): Promise<ActionsResult<ActionsWorkflow[]>> =>
      wrap(async () => {
        const body = await get(`${base(repo)}/workflows`, { per_page: 100 });
        return (body.workflows ?? []).map((w: any) => ({ id: w.id, name: w.name, path: w.path, active: w.state === "active" }));
      }),
  };
}

export type GithubClient = ReturnType<typeof createGithubClient>;
