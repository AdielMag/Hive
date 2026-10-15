/**
 * Contract between the git module's main and renderer halves (`mod:git:<method>`), plus a typed client the
 * dependent `branches` module reuses (modules may import each other's `shared.ts` only).
 */
export const MODULE_ID = "git";
export const GIT_PANEL_ID = "git";

export interface GitFileStatus {
  path: string;
  origPath?: string;
  staged: boolean;
  status: "modified" | "added" | "deleted" | "renamed" | "untracked" | "conflicted";
  /** Line counts from `git diff --numstat`; absent for untracked, binary and renamed files. */
  additions?: number;
  deletions?: number;
}

export interface GitRepoStatus {
  isRepo: boolean;
  branch: string;
  upstream?: string;
  ahead: number;
  behind: number;
  staged: GitFileStatus[];
  unstaged: GitFileStatus[];
  untracked: GitFileStatus[];
}

export interface GitCommitLog {
  hash: string;
  author: string;
  relativeDate: string;
  message: string;
}

export interface GitBranchDetail {
  /** Short name: "main" or "origin/main". */
  name: string;
  isRemote: boolean;
  /** Remote name for remote branches, e.g. "origin". */
  remote?: string;
  isCurrent: boolean;
  hash: string;
  subject: string;
  relativeDate: string;
  upstream?: string;
  ahead: number;
  behind: number;
  /** Upstream is configured but the remote branch no longer exists. */
  gone: boolean;
}

export interface GitGraphCommit {
  hash: string;
  shortHash: string;
  parents: string[];
  author: string;
  relativeDate: string;
  message: string;
  /** Decorations, e.g. ["HEAD -> main", "origin/main", "tag: v1"]. */
  refs: string[];
  /** Author date, ISO 8601. */
  date?: string;
  authorEmail?: string;
}

export interface GitGraphOptions {
  /** Only commits reachable from this ref (branch, tag or hash). Default: all refs. */
  ref?: string;
}

export interface GitCommitFile {
  path: string;
  status: "added" | "modified" | "deleted";
  additions?: number;
  deletions?: number;
}

export interface GitCommitDetail {
  hash: string;
  shortHash: string;
  parents: string[];
  author: string;
  authorEmail: string;
  date: string;
  committer: string;
  subject: string;
  body: string;
  /** Branches that contain this commit (local + remote short names), capped. */
  containedIn: string[];
  files: GitCommitFile[];
}

export interface GitTag {
  name: string;
  hash: string;
  subject: string;
  relativeDate: string;
}

export const GitMethods = {
  status: "status",
  branches: "branches",
  checkout: "checkout",
  createBranch: "createBranch",
  deleteBranch: "deleteBranch",
  log: "log",
  branchDetails: "branchDetails",
  graph: "graph",
  commitDetail: "commitDetail",
  tags: "tags",
  createBranchFrom: "createBranchFrom",
  renameBranch: "renameBranch",
  merge: "merge",
  stage: "stage",
  stageAll: "stageAll",
  unstage: "unstage",
  unstageAll: "unstageAll",
  discard: "discard",
  discardAll: "discardAll",
  commit: "commit",
  diff: "diff",
  fetch: "fetch",
  pull: "pull",
  push: "push",
  generateCommitMessage: "generateCommitMessage",
} as const;

/** Command ids other modules may run (`host.commands.run`). */
export const GitCommands = {
  /** Re-reads repo status for the sync badge. */
  refresh: "git.refresh",
  /** Opens the diff viewer for `{ projectId, filePath, staged }`. */
  openDiff: "git.openDiff",
} as const;

export type GitDiffOptions = { staged?: boolean; filePath?: string };

export interface GitApi {
  getGitStatus(cwd: string): Promise<GitRepoStatus>;
  getGitBranches(cwd: string): Promise<string[]>;
  gitCheckout(cwd: string, branch: string): Promise<string>;
  gitCreateBranch(cwd: string, branch: string): Promise<string>;
  gitDeleteBranch(cwd: string, branch: string, force?: boolean): Promise<string>;
  getGitLog(cwd: string, maxCount?: number): Promise<GitCommitLog[]>;
  getGitBranchDetails(cwd: string): Promise<GitBranchDetail[]>;
  getGitGraph(cwd: string, maxCount?: number, options?: GitGraphOptions): Promise<GitGraphCommit[]>;
  getGitCommitDetail(cwd: string, hash: string): Promise<GitCommitDetail | null>;
  getGitTags(cwd: string): Promise<GitTag[]>;
  gitCreateBranchFrom(cwd: string, branch: string, startPoint: string, checkout?: boolean): Promise<string>;
  gitRenameBranch(cwd: string, oldName: string, newName: string): Promise<string>;
  gitMerge(cwd: string, branch: string): Promise<string>;
  stageFile(cwd: string, filePath: string): Promise<void>;
  stageAll(cwd: string): Promise<void>;
  unstageFile(cwd: string, filePath: string): Promise<void>;
  unstageAll(cwd: string): Promise<void>;
  discardFile(cwd: string, filePath: string): Promise<void>;
  discardAll(cwd: string): Promise<void>;
  gitCommit(cwd: string, message: string, amend?: boolean): Promise<string>;
  getGitDiff(cwd: string, options?: GitDiffOptions): Promise<string>;
  gitFetch(cwd: string): Promise<string>;
  gitPull(cwd: string): Promise<string>;
  gitPush(cwd: string): Promise<string>;
  generateCommitMessage(cwd: string, model?: string): Promise<string>;
}

type Invoke = <T = unknown>(method: string, ...args: unknown[]) => Promise<T>;

/** Typed git client over `host.ipc.invoke`. */
export function createGitApi(invoke: Invoke): GitApi {
  const M = GitMethods;
  return {
    getGitStatus: (cwd) => invoke(M.status, cwd),
    getGitBranches: (cwd) => invoke(M.branches, cwd),
    gitCheckout: (cwd, branch) => invoke(M.checkout, cwd, branch),
    gitCreateBranch: (cwd, branch) => invoke(M.createBranch, cwd, branch),
    gitDeleteBranch: (cwd, branch, force) => invoke(M.deleteBranch, cwd, branch, force),
    getGitLog: (cwd, maxCount) => invoke(M.log, cwd, maxCount),
    getGitBranchDetails: (cwd) => invoke(M.branchDetails, cwd),
    getGitGraph: (cwd, maxCount, options) => invoke(M.graph, cwd, maxCount, options),
    getGitCommitDetail: (cwd, hash) => invoke(M.commitDetail, cwd, hash),
    getGitTags: (cwd) => invoke(M.tags, cwd),
    gitCreateBranchFrom: (cwd, branch, startPoint, checkout) => invoke(M.createBranchFrom, cwd, branch, startPoint, checkout),
    gitRenameBranch: (cwd, oldName, newName) => invoke(M.renameBranch, cwd, oldName, newName),
    gitMerge: (cwd, branch) => invoke(M.merge, cwd, branch),
    stageFile: (cwd, filePath) => invoke(M.stage, cwd, filePath),
    stageAll: (cwd) => invoke(M.stageAll, cwd),
    unstageFile: (cwd, filePath) => invoke(M.unstage, cwd, filePath),
    unstageAll: (cwd) => invoke(M.unstageAll, cwd),
    discardFile: (cwd, filePath) => invoke(M.discard, cwd, filePath),
    discardAll: (cwd) => invoke(M.discardAll, cwd),
    gitCommit: (cwd, message, amend) => invoke(M.commit, cwd, message, amend),
    getGitDiff: (cwd, options) => invoke(M.diff, cwd, options),
    gitFetch: (cwd) => invoke(M.fetch, cwd),
    gitPull: (cwd) => invoke(M.pull, cwd),
    gitPush: (cwd) => invoke(M.push, cwd),
    generateCommitMessage: (cwd, model) => invoke(M.generateCommitMessage, cwd, model),
  };
}
