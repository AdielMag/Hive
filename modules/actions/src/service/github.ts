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
  WorkflowInput,
  WorkflowInputs,
} from "../shared.ts";
import { parse as parseYaml } from "yaml";

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

/** Extracts `on.workflow_dispatch` (and its inputs) from a workflow file's YAML. */
export function parseWorkflowInputs(yamlText: string): WorkflowInputs {
  let doc: any;
  try {
    doc = parseYaml(yamlText);
  } catch {
    return { dispatchable: false, inputs: [] };
  }
  const on = doc?.on ?? doc?.["true"]; // some parsers read the bare key `on` as boolean true
  let wd: any;
  if (typeof on === "string") wd = on === "workflow_dispatch" ? {} : undefined;
  else if (Array.isArray(on)) wd = on.includes("workflow_dispatch") ? {} : undefined;
  else if (on && typeof on === "object" && "workflow_dispatch" in on) wd = on.workflow_dispatch ?? {};
  if (wd === undefined) return { dispatchable: false, inputs: [] };
  const raw = typeof wd === "object" ? wd.inputs : undefined;
  const inputs: WorkflowInput[] = [];
  if (raw && typeof raw === "object") {
    for (const [name, def] of Object.entries<any>(raw)) {
      const type = ["boolean", "choice", "number", "environment"].includes(def?.type) ? def.type : "string";
      inputs.push({
        name,
        description: typeof def?.description === "string" ? def.description : undefined,
        required: def?.required === true,
        type,
        default: def?.default === undefined || def?.default === null ? undefined : String(def.default),
        options: Array.isArray(def?.options) ? def.options.map(String) : undefined,
      });
    }
  }
  return { dispatchable: true, inputs };
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

  async function request(
    method: "GET" | "POST",
    path: string,
    params: Record<string, string | number | undefined> = {},
    body?: unknown,
  ): Promise<any> {
    const write = method !== "GET";
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
    const cached = write ? undefined : etags.get(key);
    if (cached && cached.token === token) headers["If-None-Match"] = cached.etag;
    if (write) headers["Content-Type"] = "application/json";

    let res: Response;
    try {
      res = await fetchImpl(key, {
        method,
        headers,
        body: write && body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err: any) {
      throw new ApiError("network", `Could not reach GitHub: ${err?.message ?? err}`);
    }
    if (res.status === 304 && cached) return cached.body;
    if (res.ok) {
      if (write) return res.status === 204 ? null : await res.json().catch(() => null);
      const json = await res.json();
      const etag = res.headers.get("etag");
      if (etag) etags.set(key, { etag, body: json, token });
      return json;
    }
    const remaining = res.headers.get("x-ratelimit-remaining");
    const reset = Number(res.headers.get("x-ratelimit-reset"));
    if (res.status === 401) throw new ApiError("unauthorized", "GitHub rejected the token (expired or revoked).");
    if ((res.status === 403 || res.status === 429) && remaining === "0") {
      const when = reset ? ` Resets at ${new Date(reset * 1000).toLocaleTimeString()}.` : "";
      throw new ApiError("rate_limited", `GitHub API rate limit reached.${when}${token ? "" : " Add a token for a higher limit."}`);
    }
    if (write && (res.status === 403 || res.status === 404)) {
      throw new ApiError("unauthorized", "GitHub refused the action. The token needs write access to Actions (repo scope / actions:write).");
    }
    if (res.status === 422 || res.status === 409) {
      const detail = await res.json().then((j: any) => j?.message as string | undefined).catch(() => undefined);
      throw new ApiError("unknown", detail || `GitHub returned ${res.status} ${res.statusText}`);
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

  const get = (path: string, params: Record<string, string | number | undefined> = {}) => request("GET", path, params);

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
    /** Reads the workflow file at `ref` and reports whether it can be dispatched, with its inputs. */
    workflowInputs: (repo: RepoRef, path: string, ref: string): Promise<ActionsResult<WorkflowInputs>> =>
      wrap(async () => {
        const filePath = path.split("/").map(encodeURIComponent).join("/");
        const body = await get(`/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}/contents/${filePath}`, { ref });
        if (typeof body?.content !== "string") throw new ApiError("unknown", "Could not read the workflow file.");
        return parseWorkflowInputs(Buffer.from(body.content, "base64").toString("utf8"));
      }),
    dispatch: (repo: RepoRef, workflowId: number, ref: string, inputs: Record<string, string>): Promise<ActionsResult<null>> =>
      wrap(async () => {
        await request("POST", `${base(repo)}/workflows/${workflowId}/dispatches`, {}, { ref, inputs });
        return null;
      }),
    rerun: (repo: RepoRef, runId: number, failedOnly: boolean): Promise<ActionsResult<null>> =>
      wrap(async () => {
        await request("POST", `${base(repo)}/runs/${runId}/${failedOnly ? "rerun-failed-jobs" : "rerun"}`);
        return null;
      }),
    cancel: (repo: RepoRef, runId: number): Promise<ActionsResult<null>> =>
      wrap(async () => {
        await request("POST", `${base(repo)}/runs/${runId}/cancel`);
        return null;
      }),
  };
}

export type GithubClient = ReturnType<typeof createGithubClient>;
