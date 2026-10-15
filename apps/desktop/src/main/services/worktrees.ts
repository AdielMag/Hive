import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, symlinkSync, unlinkSync, appendFileSync } from "node:fs";
import { join, normalize, resolve, sep } from "node:path";
import { promisify } from "node:util";
import type {
  SessionWorktree,
  WorktreeMergeResult,
  WorktreeRemoveOptions,
  WorktreeRemoveResult,
  WorktreeStatus,
} from "@hive/protocol";

const execFileAsync = promisify(execFile);

/** Folder (inside the repo root) that holds session worktrees. */
export const WORKTREES_DIR = ".hive-worktrees";
const BRANCH_PREFIX = "hive/";
const MAX_SLUG_TITLE = 24;

export interface CreateWorktreeOptions {
  /** Main tree path; must be the repository root. */
  projectPath: string;
  /** Session title (used for the slug). */
  title?: string;
  /** Fork from this branch instead of the main tree's current HEAD. */
  baseBranch?: string;
}

interface GitResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

async function git(cwd: string, args: string[], extra: string[] = []): Promise<GitResult> {
  try {
    const { stdout, stderr } = await execFileAsync(
      "git",
      ["-c", "core.longpaths=true", "-c", "core.quotepath=false", ...extra, ...args],
      {
        cwd,
        windowsHide: true,
        maxBuffer: 16 * 1024 * 1024,
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0" },
      },
    );
    return { ok: true, stdout: stdout.toString(), stderr: stderr.toString() };
  } catch (err) {
    const e = err as { stdout?: Buffer | string; stderr?: Buffer | string; message?: string };
    return { ok: false, stdout: String(e.stdout ?? ""), stderr: String(e.stderr ?? e.message ?? "") };
  }
}

function normKey(p: string): string {
  return normalize(resolve(p)).replace(/[\\/]+$/, "").replace(/\\/g, "/").toLowerCase();
}

function samePath(a: string, b: string): boolean {
  return normKey(a) === normKey(b);
}

/** Short, filesystem/branch-safe slug fragment from a title ("" if nothing usable). */
export function sanitizeSlug(title: string | undefined): string {
  const s = (title ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_TITLE)
    .replace(/-+$/g, "");
  return s;
}

function makeSlug(title: string | undefined): string {
  return `${sanitizeSlug(title) || "session"}-${randomBytes(3).toString("hex")}`;
}

/**
 * If `cwd` is a session worktree path (`<root>/.hive-worktrees/<slug>[/...]`), the project root; else null.
 * Pure string logic so it also works for worktrees that no longer exist.
 */
export function projectPathFromWorktreeCwd(cwd: string): string | null {
  const m = /^(.*?)[\\/]\.hive-worktrees[\\/][^\\/]+(?:[\\/].*)?$/.exec(cwd);
  return m && m[1] ? m[1] : null;
}

/** True when `wt.worktreePath` is a direct child of `<projectPath>/.hive-worktrees` and the branch is Hive's. */
export function isManagedWorktree(wt: SessionWorktree): boolean {
  if (!wt.projectPath || !wt.worktreePath || !wt.branch.startsWith(BRANCH_PREFIX)) return false;
  const dir = normKey(join(wt.projectPath, WORKTREES_DIR));
  const p = normKey(wt.worktreePath);
  return p.startsWith(dir + "/") && !p.slice(dir.length + 1).includes("/");
}

async function resolveGitCommonDir(cwd: string): Promise<string | null> {
  const r = await git(cwd, ["rev-parse", "--git-common-dir"]);
  const out = r.stdout.trim();
  if (!r.ok || !out) return null;
  return resolve(cwd, out);
}

/** Add `.hive-worktrees/` to `.git/info/exclude` (never touches a tracked .gitignore). */
async function ensureExcluded(projectPath: string): Promise<void> {
  const commonDir = await resolveGitCommonDir(projectPath);
  if (!commonDir) return;
  const infoDir = join(commonDir, "info");
  const file = join(infoDir, "exclude");
  const entry = `${WORKTREES_DIR}/`;
  mkdirSync(infoDir, { recursive: true });
  let current = "";
  try {
    current = readFileSync(file, "utf8");
  } catch {
    // no exclude file yet
  }
  const has = current.split(/\r?\n/).some((l) => {
    const t = l.trim();
    return t === entry || t === `/${entry}` || t === WORKTREES_DIR || t === `/${WORKTREES_DIR}`;
  });
  if (has) return;
  const prefix = current && !current.endsWith("\n") ? "\n" : "";
  appendFileSync(file, `${prefix}# Hive session worktrees\n${entry}\n`, "utf8");
}

/** Best effort: link the root node_modules into the worktree. Never throws. */
function linkNodeModules(projectPath: string, worktreePath: string): void {
  try {
    const src = join(projectPath, "node_modules");
    const dst = join(worktreePath, "node_modules");
    if (!existsSync(src) || existsSync(dst)) return;
    symlinkSync(src, dst, "junction");
  } catch (err) {
    console.warn("[worktrees] node_modules link failed", err instanceof Error ? err.message : err);
  }
}

/** Remove our node_modules link (only if it is a link) so recursive deletes never touch the real folder. */
function unlinkNodeModules(worktreePath: string): void {
  try {
    const dst = join(worktreePath, "node_modules");
    if (lstatSync(dst).isSymbolicLink()) unlinkSync(dst);
  } catch {
    // missing or not a link
  }
}

function isOurNodeModulesLine(line: string): boolean {
  return /^\?\? node_modules\/?$/.test(line.trim());
}

async function countDirty(worktreePath: string): Promise<number> {
  const r = await git(worktreePath, ["status", "--porcelain"]);
  if (!r.ok) return 0;
  return r.stdout.split(/\r?\n/).filter((l) => l.trim() && !isOurNodeModulesLine(l)).length;
}

async function branchExists(projectPath: string, branch: string): Promise<boolean> {
  return (await git(projectPath, ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`])).ok;
}

/**
 * Create `<projectPath>/.hive-worktrees/<slug>` on a new branch `hive/<slug>`.
 * Returns null (after logging) for non-git dirs, repos without commits, subfolder projects or any git failure;
 * the caller falls back to the main tree. Never throws.
 */
export async function createWorktree(opts: CreateWorktreeOptions): Promise<SessionWorktree | null> {
  try {
    const projectPath = opts.projectPath;
    const top = await git(projectPath, ["rev-parse", "--show-toplevel"]);
    if (!top.ok || !top.stdout.trim()) return null; // not a git repo
    if (!samePath(top.stdout.trim(), projectPath)) {
      console.warn("[worktrees] project is not the repository root; skipping worktree");
      return null;
    }
    if (!(await git(projectPath, ["rev-parse", "--verify", "--quiet", "HEAD^{commit}"])).ok) return null; // no commits

    const cur = await git(projectPath, ["symbolic-ref", "--short", "-q", "HEAD"]);
    const currentBranch = cur.ok && cur.stdout.trim() ? cur.stdout.trim() : "HEAD";
    const baseBranch = opts.baseBranch?.trim() || currentBranch;
    const baseRef = baseBranch === "HEAD" ? "HEAD" : baseBranch;
    const base = await git(projectPath, ["rev-parse", "--verify", "--quiet", `${baseRef}^{commit}`]);
    if (!base.ok || !base.stdout.trim()) {
      console.warn(`[worktrees] base "${baseBranch}" not found`);
      return null;
    }
    const baseCommit = base.stdout.trim();

    await ensureExcluded(projectPath);

    let slug = "";
    let worktreePath = "";
    for (let i = 0; i < 6; i++) {
      slug = makeSlug(opts.title);
      worktreePath = join(projectPath, WORKTREES_DIR, slug);
      if (!existsSync(worktreePath) && !(await branchExists(projectPath, BRANCH_PREFIX + slug))) break;
      slug = "";
    }
    if (!slug) {
      console.warn("[worktrees] could not find a free slug");
      return null;
    }
    const branch = BRANCH_PREFIX + slug;

    mkdirSync(join(projectPath, WORKTREES_DIR), { recursive: true });
    const add = await git(projectPath, ["worktree", "add", "-b", branch, worktreePath, baseCommit]);
    if (!add.ok) {
      console.warn("[worktrees] git worktree add failed:", add.stderr.trim());
      return null;
    }
    linkNodeModules(projectPath, worktreePath);
    return { worktreePath, branch, baseBranch, baseCommit, projectPath };
  } catch (err) {
    console.error("[worktrees] createWorktree failed", err instanceof Error ? err.message : err);
    return null;
  }
}

/** Ahead/behind (vs the base) and dirty count. Missing worktree folder => exists:false, zeros. */
export async function worktreeStatus(wt: SessionWorktree): Promise<WorktreeStatus> {
  const empty: WorktreeStatus = { exists: false, ahead: 0, behind: 0, dirty: 0 };
  if (!isManagedWorktree(wt) || !existsSync(wt.worktreePath)) return empty;
  try {
    const dirty = await countDirty(wt.worktreePath);
    let base = wt.baseBranch === "HEAD" ? wt.baseCommit : wt.baseBranch;
    if (!(await git(wt.projectPath, ["rev-parse", "--verify", "--quiet", `${base}^{commit}`])).ok) base = wt.baseCommit;
    const r = await git(wt.projectPath, ["rev-list", "--left-right", "--count", `${base}...${wt.branch}`]);
    let ahead = 0;
    let behind = 0;
    if (r.ok) {
      const [left, right] = r.stdout.trim().split(/\s+/).map((n) => Number.parseInt(n, 10));
      behind = left !== undefined && Number.isFinite(left) ? left : 0;
      ahead = right !== undefined && Number.isFinite(right) ? right : 0;
    }
    return { exists: true, ahead, behind, dirty };
  } catch (err) {
    console.error("[worktrees] worktreeStatus failed", err instanceof Error ? err.message : err);
    return { ...empty, exists: true };
  }
}

/** Remove the worktree folder and (by default) its branch. Refuses a dirty worktree unless `force`. */
export async function removeWorktree(wt: SessionWorktree, opts: WorktreeRemoveOptions = {}): Promise<WorktreeRemoveResult> {
  try {
    if (!isManagedWorktree(wt)) return { ok: false, error: "Not a Hive session worktree" };
    const force = opts.force === true;
    if (existsSync(wt.worktreePath)) {
      if (!force && (await countDirty(wt.worktreePath)) > 0) {
        return { ok: false, error: "Worktree has uncommitted changes" };
      }
      unlinkNodeModules(wt.worktreePath);
      const rm = await git(wt.projectPath, ["worktree", "remove", "--force", wt.worktreePath]);
      if (!rm.ok && existsSync(wt.worktreePath)) {
        return { ok: false, error: rm.stderr.trim() || "git worktree remove failed" };
      }
    }
    await git(wt.projectPath, ["worktree", "prune"]);
    let branchDeleted = false;
    if (opts.deleteBranch !== false && (await branchExists(wt.projectPath, wt.branch))) {
      branchDeleted = (await git(wt.projectPath, ["branch", force ? "-D" : "-d", wt.branch])).ok;
    }
    return { ok: true, branchDeleted };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Hive worktrees listed by git for `projectPath` whose folder is not in `knownPaths` (e.g. left by a crash). */
export async function listOrphans(
  projectPath: string,
  knownPaths: Iterable<string>,
): Promise<Array<{ worktreePath: string; branch?: string }>> {
  const known = new Set<string>();
  for (const p of knownPaths) known.add(normKey(p));
  const r = await git(projectPath, ["worktree", "list", "--porcelain"]);
  if (!r.ok) return [];
  const dir = normKey(join(projectPath, WORKTREES_DIR));
  const out: Array<{ worktreePath: string; branch?: string }> = [];
  for (const block of r.stdout.split(/\r?\n\r?\n/)) {
    let path: string | undefined;
    let branch: string | undefined;
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith("worktree ")) path = line.slice("worktree ".length).trim();
      else if (line.startsWith("branch ")) branch = line.slice("branch ".length).trim().replace(/^refs\/heads\//, "");
    }
    if (!path) continue;
    const k = normKey(path);
    if (k.startsWith(dir + "/") && !known.has(k)) out.push({ worktreePath: path.split("/").join(sep), branch });
  }
  return out;
}

/**
 * Merge the session branch into its base branch inside the main tree. Needs the main tree to be on the
 * base branch with no tracked changes. On conflicts the merge is aborted and the main tree left untouched.
 */
export async function mergeWorktree(wt: SessionWorktree): Promise<WorktreeMergeResult> {
  try {
    if (!isManagedWorktree(wt)) return { ok: false, reason: "error", error: "Not a Hive session worktree" };
    const main = wt.projectPath;
    if (!(await branchExists(main, wt.branch))) {
      return { ok: false, reason: "error", error: `Branch ${wt.branch} no longer exists` };
    }

    const cur = await git(main, ["symbolic-ref", "--short", "-q", "HEAD"]);
    const current = cur.ok ? cur.stdout.trim() : "";
    if (wt.baseBranch === "HEAD" || !current || current !== wt.baseBranch) {
      return {
        ok: false,
        reason: "base-not-checked-out",
        error: `The main tree is on ${current || "a detached HEAD"}; check out ${wt.baseBranch === "HEAD" ? "a branch" : wt.baseBranch} first`,
      };
    }

    const st = await git(main, ["status", "--porcelain", "--untracked-files=no"]);
    if (!st.ok) return { ok: false, reason: "error", error: st.stderr.trim() || "git status failed" };
    if (st.stdout.trim()) {
      return { ok: false, reason: "dirty-main", error: "The main tree has uncommitted changes; commit or stash them first" };
    }

    const uncommitted = existsSync(wt.worktreePath) ? await countDirty(wt.worktreePath) : 0;

    // Merge commits need an identity; fall back to a Hive one only when none is configured.
    const ident: string[] = [];
    if (!(await git(main, ["config", "user.email"])).stdout.trim()) ident.push("-c", "user.email=hive@local");
    if (!(await git(main, ["config", "user.name"])).stdout.trim()) ident.push("-c", "user.name=Hive");

    const before = (await git(main, ["rev-parse", "HEAD"])).stdout.trim();
    const merge = await git(main, ["merge", "--no-edit", wt.branch], ident);
    if (!merge.ok) {
      const files = await git(main, ["diff", "--name-only", "--diff-filter=U"]);
      const conflicts = files.stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const merging = existsSync(join((await resolveGitDir(main)) ?? "", "MERGE_HEAD"));
      if (merging) await git(main, ["merge", "--abort"]);
      if (conflicts.length > 0) {
        return { ok: false, reason: "conflict", error: `Merge conflicts in ${conflicts.length} file(s)`, conflicts };
      }
      return { ok: false, reason: "error", error: (merge.stderr || merge.stdout).trim() || "git merge failed" };
    }
    const after = (await git(main, ["rev-parse", "HEAD"])).stdout.trim();
    return { ok: true, alreadyUpToDate: before === after, uncommitted };
  } catch (err) {
    return { ok: false, reason: "error", error: err instanceof Error ? err.message : String(err) };
  }
}

async function resolveGitDir(cwd: string): Promise<string | null> {
  const r = await git(cwd, ["rev-parse", "--git-dir"]);
  const out = r.stdout.trim();
  return r.ok && out ? resolve(cwd, out) : null;
}
