import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, statSync, symlinkSync, unlinkSync, appendFileSync, realpathSync } from "node:fs";
import { dirname, join, normalize, resolve, sep } from "node:path";
import { promisify } from "node:util";
import type {
  SessionWorktree,
  TidyWorktreeAction,
  TidyWorktreeApplyResult,
  TidyWorktreeCandidate,
  TidyWorktreeScanRequest,
  WorktreeMergeResult,
  WorktreeRemoveOptions,
  WorktreeRemoveResult,
  WorktreeRenameResult,
  WorktreeStatus,
} from "@hive/protocol";

const execFileAsync = promisify(execFile);

/** Folder (inside the repo root) that holds session worktrees. */
export const WORKTREES_DIR = ".hive-worktrees";
const BRANCH_PREFIX = "hive/";
const MAX_SLUG_TITLE = 36;

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

export async function git(cwd: string, args: string[], extra: string[] = [], timeout?: number): Promise<GitResult> {
  try {
    const { stdout, stderr } = await execFileAsync(
      "git",
      ["-c", "core.longpaths=true", "-c", "core.quotepath=false", ...extra, ...args],
      {
        cwd,
        windowsHide: true,
        timeout,
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

function norm(p: string): string {
  try {
    p = realpathSync.native(p);
  } catch {
    try {
      p = realpathSync(p);
    } catch {}
  }
  return normalize(resolve(p)).replace(/[\\/]+$/, "").replace(/\\/g, "/").toLowerCase();
}

function samePath(a: string, b: string): boolean {
  return norm(a) === norm(b);
}

/** Short, filesystem/branch-safe slug fragment from a title ("" if nothing usable). */
export function sanitizeSlug(title: string | undefined): string {
  if (!title) return "";
  let s = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  // Strip slash commands e.g. /plan, /debug
  s = s.replace(/^\s*\/[a-z0-9_-]+\s*/, "");
  // Strip common conversational preamble so slug gets straight to the subject
  s = s.replace(/^(?:can\s+you\s+(?:please\s+)?|could\s+you\s+(?:please\s+)?|please\s+|i\s+want\s+(?:to\s+)?|i\s+need\s+(?:to\s+)?|help\s+me\s+(?:to\s+)?)/, "");
  if (s.trim() === "new session") return "";
  s = s
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_TITLE)
    .replace(/-+$/g, "");
  return s;
}

export function makeSlug(title: string | undefined): string {
  const base = sanitizeSlug(title);
  return `${base || "session"}-${randomBytes(3).toString("hex")}`;
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
  const dir = norm(join(wt.projectPath, WORKTREES_DIR));
  const p = norm(wt.worktreePath);
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

interface WorkspaceEntry {
  name: string;
  /** Path relative to the repo root, forward slashes (e.g. `packages/protocol`). */
  rel: string;
}

/** Workspace packages declared by the worktree's root package.json (`dir/*` globs only). Never throws. */
function readWorkspaces(root: string): WorkspaceEntry[] {
  const out: WorkspaceEntry[] = [];
  try {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { workspaces?: unknown };
    const globs = Array.isArray(pkg.workspaces) ? pkg.workspaces.filter((g): g is string => typeof g === "string") : [];
    for (const glob of globs) {
      const m = /^(.+)\/\*$/.exec(glob);
      const base = m?.[1];
      if (!base) continue;
      let dirents;
      try {
        dirents = readdirSync(join(root, base), { withFileTypes: true });
      } catch {
        continue;
      }
      for (const dirent of dirents) {
        if (!dirent.isDirectory()) continue;
        try {
          const wp = JSON.parse(readFileSync(join(root, base, dirent.name, "package.json"), "utf8")) as { name?: unknown };
          if (typeof wp.name === "string" && wp.name) out.push({ name: wp.name, rel: `${base}/${dirent.name}` });
        } catch {
          // no package.json in this folder
        }
      }
    }
  } catch {
    // no/invalid root package.json
  }
  return out;
}

/** True when `p` exists as any filesystem entry, even a dangling link. */
function entryExists(p: string): boolean {
  try {
    lstatSync(p);
    return true;
  } catch {
    return false;
  }
}

/** Junction `dst` -> `target` unless `dst` already exists or `target` is not a directory. */
function junction(target: string, dst: string): void {
  try {
    if (entryExists(dst) || !statSync(target).isDirectory()) return;
    mkdirSync(dirname(dst), { recursive: true });
    symlinkSync(target, dst, "junction");
  } catch (err) {
    console.warn("[worktrees] link failed", dst, err instanceof Error ? err.message : err);
  }
}

/**
 * Best effort: give the worktree a working `node_modules`. Never throws.
 *
 * A single junction to the root `node_modules` is wrong for a monorepo: its `@hive/*` workspace links point at the
 * main tree, so the worktree would build and test against main's sources. Instead the worktree gets a real
 * `node_modules` whose entries are junctions to the root's, except workspace packages, which point at the worktree's
 * own folders. Workspace `node_modules` (e.g. `apps/desktop/node_modules`) are junctioned from the root tree too.
 * Idempotent: safe to call again to repair or top up an existing worktree.
 */
export function linkNodeModules(projectPath: string, worktreePath: string): void {
  try {
    const src = join(projectPath, "node_modules");
    const dst = join(worktreePath, "node_modules");
    if (!existsSync(src)) return;
    // Legacy layout: the whole folder was one junction into the root. Replace it with a real folder.
    if (entryExists(dst) && lstatSync(dst).isSymbolicLink()) unlinkSync(dst);
    mkdirSync(dst, { recursive: true });

    const workspaces = readWorkspaces(worktreePath);
    for (const ws of workspaces) junction(join(worktreePath, ...ws.rel.split("/")), join(dst, ...ws.name.split("/")));

    // Scopes that hold workspace links (e.g. `@hive`) are real folders, so the root's other packages in them still link.
    const ownScopes = new Set(workspaces.filter((w) => w.name.startsWith("@")).map((w) => w.name.split("/")[0]!));
    for (const entry of readdirSync(src)) {
      const from = join(src, entry);
      const to = join(dst, entry);
      if (ownScopes.has(entry)) {
        mkdirSync(to, { recursive: true });
        for (const inner of readdirSync(from)) junction(join(from, inner), join(to, inner));
      } else {
        junction(from, to);
      }
    }

    for (const ws of workspaces) {
      const rel = ws.rel.split("/");
      const wsModules = join(projectPath, ...rel, "node_modules");
      if (existsSync(wsModules)) junction(wsModules, join(worktreePath, ...rel, "node_modules"));
    }
  } catch (err) {
    console.warn("[worktrees] node_modules link failed", err instanceof Error ? err.message : err);
  }
}

/** Remove one link without ever following it (a recursive delete would wipe the root's real folder). */
function unlinkIfLink(p: string): void {
  try {
    if (lstatSync(p).isSymbolicLink()) unlinkSync(p);
  } catch {
    // missing or not a link
  }
}

/**
 * Remove our node_modules links (only links, never real content) so recursive deletes never touch the root's folder.
 * Handles both the legacy single junction and the per-entry layout.
 */
function unlinkNodeModules(worktreePath: string): void {
  try {
    const dst = join(worktreePath, "node_modules");
    if (entryExists(dst) && lstatSync(dst).isSymbolicLink()) {
      unlinkSync(dst);
    } else if (entryExists(dst)) {
      for (const entry of readdirSync(dst)) {
        const p = join(dst, entry);
        if (lstatSync(p).isSymbolicLink()) unlinkSync(p);
        else if (entry.startsWith("@")) for (const inner of readdirSync(p)) unlinkIfLink(join(p, inner));
      }
    }
    for (const ws of readWorkspaces(worktreePath)) unlinkIfLink(join(worktreePath, ...ws.rel.split("/"), "node_modules"));
  } catch {
    // missing or unreadable; git worktree remove --force handles the rest
  }
}

/** Fix up an existing worktree (legacy single junction, or packages added to the root since it was created). */
export function repairNodeModules(projectPath: string, worktreePath: string): void {
  if (projectPath && worktreePath && existsSync(worktreePath)) linkNodeModules(projectPath, worktreePath);
}

function isOurNodeModulesLine(line: string): boolean {
  return /^\?\? (?:.+\/)?node_modules\/?$/.test(line.trim());
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
    if (!top.ok || !top.stdout.trim()) {
      console.warn("[worktrees] rev-parse --show-toplevel failed:", top.stderr);
      return null; // not a git repo
    }
    if (!samePath(top.stdout.trim(), projectPath)) {
      console.warn(`[worktrees] project is not the repository root (top: "${top.stdout.trim()}", project: "${projectPath}"); skipping worktree`);
      return null;
    }
    const headCommit = await git(projectPath, ["rev-parse", "--verify", "--quiet", "HEAD^{commit}"]);
    if (!headCommit.ok) {
      console.warn("[worktrees] rev-parse HEAD^{commit} failed:", headCommit.stderr);
      return null; // no commits
    }

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

/** Rename the git branch of a session worktree to a descriptive name based on the user's initial request. */
export async function renameWorktreeBranch(
  wt: SessionWorktree,
  newTitleOrSlug: string,
): Promise<WorktreeRenameResult> {
  try {
    if (!isManagedWorktree(wt)) return { ok: false, error: "Not a Hive session worktree" };
    const slug = makeSlug(newTitleOrSlug);
    const newBranch = `${BRANCH_PREFIX}${slug}`;
    if (wt.branch === newBranch) return { ok: true, branch: newBranch };
    if (await branchExists(wt.projectPath, newBranch)) {
      return { ok: false, error: `Branch ${newBranch} already exists` };
    }
    const r = await git(wt.projectPath, ["branch", "-m", wt.branch, newBranch]);
    if (!r.ok) {
      return { ok: false, error: r.stderr.trim() || "git branch -m failed" };
    }
    wt.branch = newBranch;
    return { ok: true, branch: newBranch };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Hive worktrees (direct children of `.hive-worktrees`) git lists for `projectPath`. */
async function listManagedWorktrees(projectPath: string): Promise<Array<{ worktreePath: string; branch?: string }>> {
  const r = await git(projectPath, ["worktree", "list", "--porcelain"]);
  if (!r.ok) return [];
  const dir = norm(join(projectPath, WORKTREES_DIR));
  const out: Array<{ worktreePath: string; branch?: string }> = [];
  for (const block of r.stdout.split(/\r?\n\r?\n/)) {
    let path: string | undefined;
    let branch: string | undefined;
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith("worktree ")) path = line.slice("worktree ".length).trim();
      else if (line.startsWith("branch ")) branch = line.slice("branch ".length).trim().replace(/^refs\/heads\//, "");
    }
    if (path && norm(path).startsWith(dir + "/")) out.push({ worktreePath: path.split("/").join(sep), branch });
  }
  return out;
}

/** Hive worktrees listed by git for `projectPath` whose folder is not in `knownPaths` (e.g. left by a crash). */
export async function listOrphans(
  projectPath: string,
  knownPaths: Iterable<string>,
): Promise<Array<{ worktreePath: string; branch?: string }>> {
  const known = new Set<string>();
  for (const p of knownPaths) known.add(norm(p));
  return (await listManagedWorktrees(projectPath)).filter((w) => !known.has(norm(w.worktreePath)));
}

const SAFE_BRANCH = /^hive\/[A-Za-z0-9._/-]+$/;

async function refList(projectPath: string, prefix: string): Promise<string[]> {
  const r = await git(projectPath, ["for-each-ref", "--format=%(refname)", prefix]);
  return r.ok ? r.stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean) : [];
}

/** Refs a branch counts as merged into: the main tree's HEAD and origin's default branch (when known). */
async function mergeTargets(projectPath: string): Promise<string[]> {
  const targets = ["HEAD"];
  const r = await git(projectPath, ["symbolic-ref", "--short", "-q", "refs/remotes/origin/HEAD"]);
  const def = r.ok ? r.stdout.trim() : "";
  if (def && (await git(projectPath, ["rev-parse", "--verify", "-q", def])).ok) targets.push(def);
  return targets;
}

/** True when `ref`'s changes are already in `target`: ancestor, every commit patch-equivalent (rebase), or a merge would be a no-op (squash). */
async function isMergedInto(projectPath: string, ref: string, target: string): Promise<boolean> {
  const count = await git(projectPath, ["rev-list", "--count", `${target}..${ref}`]);
  if (count.ok && Number.parseInt(count.stdout.trim(), 10) === 0) return true;
  const cherry = await git(projectPath, ["cherry", target, ref]);
  if (cherry.ok && !cherry.stdout.split(/\r?\n/).some((l) => l.startsWith("+"))) return true;
  // Squash merge: merging would not change target's tree (needs git >= 2.38; failure/conflict = not merged).
  const mt = await git(projectPath, ["merge-tree", "--write-tree", "--no-messages", target, ref]);
  if (!mt.ok) return false;
  const tree = await git(projectPath, ["rev-parse", `${target}^{tree}`]);
  return tree.ok && mt.stdout.trim().split(/\r?\n/)[0] === tree.stdout.trim();
}

/** Commits on `ref` not yet merged into any target; 0 when merged (by any strategy). Failed checks count as 1. */
async function unmergedCount(projectPath: string, ref: string, targets: string[]): Promise<number> {
  let best = Number.POSITIVE_INFINITY;
  for (const t of targets) {
    if (await isMergedInto(projectPath, ref, t)) return 0;
    const c = await git(projectPath, ["rev-list", "--count", `${t}..${ref}`]);
    best = Math.min(best, c.ok ? Number.parseInt(c.stdout.trim(), 10) || 1 : 1);
  }
  return Number.isFinite(best) ? best : 1;
}

/**
 * Hive branches/worktrees (local and on origin) that no live session uses. Prunes stale remote-tracking refs
 * first (best effort; offline is fine).
 */
export async function scanTidyWorktrees(req: TidyWorktreeScanRequest): Promise<TidyWorktreeCandidate[]> {
  const { projectPath } = req;
  const hasOrigin = (await git(projectPath, ["remote", "get-url", "origin"])).ok;
  if (hasOrigin) await git(projectPath, ["fetch", "--prune", "--quiet", "origin"], [], 30_000);

  const liveBranches = new Set(req.liveBranches);
  const livePaths = new Set(req.livePaths.map(norm));
  const archived = new Set(req.archivedBranches);

  const byBranch = new Map<string, { worktreePath?: string; local: boolean; remote: boolean }>();
  const entry = (b: string) => {
    let e = byBranch.get(b);
    if (!e) byBranch.set(b, (e = { local: false, remote: false }));
    return e;
  };
  for (const ref of await refList(projectPath, "refs/heads/hive/")) entry(ref.slice("refs/heads/".length)).local = true;
  if (hasOrigin) {
    for (const ref of await refList(projectPath, "refs/remotes/origin/hive/")) {
      entry(ref.slice("refs/remotes/origin/".length)).remote = true;
    }
  }
  for (const wt of await listManagedWorktrees(projectPath)) {
    if (!wt.branch?.startsWith(BRANCH_PREFIX)) continue;
    const e = entry(wt.branch);
    e.worktreePath = wt.worktreePath;
    e.local = true;
  }

  const targets = await mergeTargets(projectPath);
  const out: TidyWorktreeCandidate[] = [];
  for (const [branch, e] of byBranch) {
    if (!SAFE_BRANCH.test(branch)) continue;
    if (liveBranches.has(branch) || (e.worktreePath && livePaths.has(norm(e.worktreePath)))) continue;
    // Count unmerged commits on every existing ref; a failed check counts as unmerged so "delete clean" never picks it.
    let unmerged = 0;
    let merged = true;
    for (const ref of [e.local ? branch : "", e.remote ? `origin/${branch}` : ""].filter(Boolean)) {
      const n = await unmergedCount(projectPath, ref, targets);
      unmerged = Math.max(unmerged, n);
      if (n > 0) merged = false;
    }
    let dirty = 0;
    if (e.worktreePath && existsSync(e.worktreePath)) {
      const st = await git(e.worktreePath, ["status", "--porcelain"]);
      dirty = st.ok ? await countDirty(e.worktreePath) : 1; // unreadable worktree: treat as dirty
    }
    out.push({
      branch,
      worktreePath: e.worktreePath,
      hasLocalBranch: e.local,
      hasRemoteBranch: e.remote,
      unmerged,
      merged,
      dirty,
      reason: !e.local && e.remote ? "remote-only" : archived.has(branch) ? "archived-session" : "no-session",
    });
  }
  return out.sort((a, b) => a.branch.localeCompare(b.branch));
}

/** Delete what the user picked in the tidy dialog. Every action is re-validated; one failure never stops the rest. */
export async function applyTidyWorktrees(projectPath: string, actions: TidyWorktreeAction[]): Promise<TidyWorktreeApplyResult[]> {
  const results: TidyWorktreeApplyResult[] = [];
  for (const a of actions) {
    const branch = String(a?.branch);
    const fail = (error: string) => results.push({ branch, ok: false, error });
    try {
      if (typeof a?.branch !== "string" || !SAFE_BRANCH.test(a.branch) || a.branch.includes("..")) {
        fail("Not a Hive branch");
        continue;
      }
      if (a.deleteLocal) {
        // Never trust the supplied folder: use the one git registers for this branch.
        const worktreePath = (await listManagedWorktrees(projectPath)).find((w) => w.branch === branch)?.worktreePath;
        if (worktreePath) {
          const wt: SessionWorktree = { worktreePath, branch, baseBranch: "HEAD", baseCommit: "", projectPath };
          const r = await removeWorktree(wt, { force: true, deleteBranch: true });
          if (!r.ok) {
            fail(r.error);
            continue;
          }
        } else if (await branchExists(projectPath, branch)) {
          const r = await git(projectPath, ["branch", "-D", branch]);
          if (!r.ok) {
            fail(r.stderr.trim() || "git branch -D failed");
            continue;
          }
        }
      }
      if (a.deleteRemote) {
        const r = await git(projectPath, ["push", "origin", "--delete", branch], [], 60_000);
        if (!r.ok) {
          fail(r.stderr.trim().split(/\r?\n/).pop() || "git push --delete failed");
          continue;
        }
      }
      results.push({ branch, ok: true });
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
    }
  }
  return results;
}

/**
 * Merge the session branch into its base branch inside the main tree. Needs the main tree to be on the
 * base branch with no tracked changes. On conflicts the merge is aborted and the main tree left untouched.
 */
export type MergePreflight =
  | { ok: true; main: string; ident: string[] }
  | { ok: false; reason: "dirty-main" | "base-not-checked-out" | "error"; error: string };

/** Shared checks before merging: managed worktree, branch exists, base checked out in main, main clean. */
export async function preflightMerge(wt: SessionWorktree, opts: { allowMerging?: boolean } = {}): Promise<MergePreflight> {
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

  if (!opts.allowMerging) {
    const st = await git(main, ["status", "--porcelain", "--untracked-files=no"]);
    if (!st.ok) return { ok: false, reason: "error", error: st.stderr.trim() || "git status failed" };
    if (st.stdout.trim()) {
      return { ok: false, reason: "dirty-main", error: "The main tree has uncommitted changes; commit or stash them first" };
    }
  }

  // Merge commits need an identity; fall back to a Hive one only when none is configured.
  const ident: string[] = [];
  if (!(await git(main, ["config", "user.email"])).stdout.trim()) ident.push("-c", "user.email=hive@local");
  if (!(await git(main, ["config", "user.name"])).stdout.trim()) ident.push("-c", "user.name=Hive");
  return { ok: true, main, ident };
}

export async function mergeWorktree(wt: SessionWorktree): Promise<WorktreeMergeResult> {
  try {
    const pre = await preflightMerge(wt);
    if (!pre.ok) return pre;
    const { main, ident } = pre;
    const uncommitted = existsSync(wt.worktreePath) ? await countDirty(wt.worktreePath) : 0;

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

export async function resolveGitDir(cwd: string): Promise<string | null> {
  const r = await git(cwd, ["rev-parse", "--git-dir"]);
  const out = r.stdout.trim();
  return r.ok && out ? resolve(cwd, out) : null;
}
