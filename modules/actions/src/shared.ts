/** Contract between the actions module's main and renderer halves (`mod:actions:<method>`). */
export const MODULE_ID = "actions";
export const ACTIONS_PANEL_ID = "actions";

/** Normalised run / job / step state, collapsing GitHub's `status` + `conclusion` pair. */
export type ActionsState = "queued" | "running" | "success" | "failure" | "cancelled" | "skipped" | "neutral";

export type TokenSource = "env" | "saved" | "git" | "none";

export interface ActionsRepo {
  owner: string;
  repo: string;
  /** Branch currently checked out in the project, when known. */
  branch?: string;
  tokenSource: TokenSource;
}

export interface ActionsRun {
  id: number;
  runNumber: number;
  attempt: number;
  /** Commit message / PR title GitHub shows as the run title. */
  title: string;
  workflowId: number;
  workflowName: string;
  event: string;
  branch: string;
  sha: string;
  actor: string;
  state: ActionsState;
  createdAt: string;
  startedAt: string;
  updatedAt: string;
  url: string;
}

export interface ActionsStep {
  number: number;
  name: string;
  state: ActionsState;
  startedAt?: string;
  completedAt?: string;
}

export interface ActionsJob {
  id: number;
  name: string;
  state: ActionsState;
  startedAt?: string;
  completedAt?: string;
  url: string;
  runnerName?: string;
  steps: ActionsStep[];
}

export interface ActionsWorkflow {
  id: number;
  name: string;
  path: string;
  active: boolean;
}

export interface WorkflowInput {
  name: string;
  description?: string;
  required: boolean;
  type: "string" | "boolean" | "choice" | "number" | "environment";
  default?: string;
  options?: string[];
}

/** Whether a workflow has a `workflow_dispatch` trigger, and the inputs it asks for. */
export interface WorkflowInputs {
  dispatchable: boolean;
  inputs: WorkflowInput[];
}

export type RunStatusFilter = "all" | "queued" | "in_progress" | "success" | "failure" | "cancelled";

export interface RunsQuery {
  workflowId?: number;
  branch?: string;
  status?: RunStatusFilter;
  page?: number;
  perPage?: number;
}

export interface RunsPage {
  runs: ActionsRun[];
  totalCount: number;
}

export type ActionsErrorCode = "not_github" | "no_remote" | "unauthorized" | "not_found" | "rate_limited" | "network" | "unknown";

export type ActionsResult<T> = { ok: true; data: T } | { ok: false; code: ActionsErrorCode; message: string };

export const ActionsMethods = {
  repo: "repo",
  runs: "runs",
  jobs: "jobs",
  workflows: "workflows",
  workflowInputs: "workflowInputs",
  dispatch: "dispatch",
  rerun: "rerun",
  cancel: "cancel",
  setToken: "setToken",
  clearToken: "clearToken",
} as const;

type Invoke = <T = unknown>(method: string, ...args: unknown[]) => Promise<T>;

export interface ActionsApi {
  repo(cwd: string): Promise<ActionsResult<ActionsRepo>>;
  runs(repo: RepoRef, query: RunsQuery): Promise<ActionsResult<RunsPage>>;
  jobs(repo: RepoRef, runId: number): Promise<ActionsResult<ActionsJob[]>>;
  workflows(repo: RepoRef): Promise<ActionsResult<ActionsWorkflow[]>>;
  workflowInputs(repo: RepoRef, path: string, ref: string): Promise<ActionsResult<WorkflowInputs>>;
  dispatch(repo: RepoRef, workflowId: number, ref: string, inputs: Record<string, string>): Promise<ActionsResult<null>>;
  rerun(repo: RepoRef, runId: number, failedOnly: boolean): Promise<ActionsResult<null>>;
  cancel(repo: RepoRef, runId: number): Promise<ActionsResult<null>>;
  setToken(token: string): Promise<void>;
  clearToken(): Promise<void>;
}

export type RepoRef = Pick<ActionsRepo, "owner" | "repo">;

/** Typed client over `host.ipc.invoke`. */
export function createActionsApi(invoke: Invoke): ActionsApi {
  const M = ActionsMethods;
  return {
    repo: (cwd) => invoke(M.repo, cwd),
    runs: (repo, query) => invoke(M.runs, repo, query),
    jobs: (repo, runId) => invoke(M.jobs, repo, runId),
    workflows: (repo) => invoke(M.workflows, repo),
    workflowInputs: (repo, path, ref) => invoke(M.workflowInputs, repo, path, ref),
    dispatch: (repo, workflowId, ref, inputs) => invoke(M.dispatch, repo, workflowId, ref, inputs),
    rerun: (repo, runId, failedOnly) => invoke(M.rerun, repo, runId, failedOnly),
    cancel: (repo, runId) => invoke(M.cancel, repo, runId),
    setToken: (token) => invoke(M.setToken, token),
    clearToken: () => invoke(M.clearToken),
  };
}
