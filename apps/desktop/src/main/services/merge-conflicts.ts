/** Merge-conflict resolution for session worktrees: leave the merge in progress, hand conflicts to the UI, finish or abort. */
import { spawn } from "node:child_process";
import { existsSync, lstatSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve, isAbsolute } from "node:path";
import type {
  MergeConflictAiRequest,
  MergeConflictAiResult,
  MergeConflictFile,
  MergeConflictResolution,
  MergeConflictResolveResult,
  MergeConflictStartResult,
  PiInstallInfo,
  SessionWorktree,
} from "@hive/protocol";
import { git, preflightMerge, resolveGitDir } from "./worktrees.ts";

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const AI_TIMEOUT_MS = 120_000;
const MAX_AI_FIELD_CHARS = 40_000;

async function isMerging(main: string): Promise<boolean> {
  const dir = await resolveGitDir(main);
  return !!dir && existsSync(join(dir, "MERGE_HEAD"));
}

async function unmergedPaths(main: string): Promise<string[]> {
  const r = await git(main, ["diff", "--name-only", "--diff-filter=U", "-z"]);
  return r.stdout.split("\0").filter(Boolean);
}

/** Resolve a repo-relative path inside the main tree; null when it would escape it. */
function safeJoin(main: string, rel: string): string | null {
  if (!rel || isAbsolute(rel)) return null;
  const abs = resolve(main, rel);
  const back = relative(resolve(main), abs);
  if (!back || back.startsWith("..") || isAbsolute(back)) return null;
  return abs;
}

function hasMarkers(text: string): boolean {
  return /^<<<<<<< /m.test(text) && /^=======\r?$/m.test(text) && /^>>>>>>> /m.test(text);
}

function readConflictFile(main: string, rel: string): MergeConflictFile {
  const abs = safeJoin(main, rel);
  if (!abs || !existsSync(abs)) return { path: rel, kind: "other", content: "" };
  try {
    const buf = readFileSync(abs);
    if (buf.length > MAX_FILE_BYTES || buf.includes(0)) return { path: rel, kind: "other", content: "" };
    const content = buf.toString("utf8");
    return { path: rel, kind: hasMarkers(content) ? "text" : "other", content: hasMarkers(content) ? content : "" };
  } catch {
    return { path: rel, kind: "other", content: "" };
  }
}

/**
 * Start (or resume) a merge of the session branch into the base branch in the main tree and leave it in
 * progress with conflict markers. Callers must finish with `resolveConflicts` or `abortConflicts`.
 */
async function startImpl(wt: SessionWorktree): Promise<MergeConflictStartResult> {
  try {
    const resuming = await isMerging(wt.projectPath);
    const pre = await preflightMerge(wt, { allowMerging: resuming });
    if (!pre.ok) return pre;
    const { main, ident } = pre;

    if (resuming) {
      // Only resume a merge of this very branch; never touch someone else's in-progress merge.
      const head = (await git(main, ["rev-parse", "MERGE_HEAD"])).stdout.trim();
      const tip = (await git(main, ["rev-parse", wt.branch])).stdout.trim();
      if (!head || head !== tip) {
        return { ok: false, reason: "error", error: "The main tree is in the middle of another merge; finish or abort it first" };
      }
    } else {
      const merge = await git(main, ["merge", "--no-edit", wt.branch], ident);
      if (merge.ok) {
        return { ok: false, reason: "error", error: "No conflicts: the merge completed without needing resolution" };
      }
      if (!(await isMerging(main))) {
        return { ok: false, reason: "error", error: (merge.stderr || merge.stdout).trim() || "git merge failed" };
      }
    }

    const paths = await unmergedPaths(main);
    if (paths.length === 0) {
      // Merge in progress but everything is already staged: expose nothing, let the user finish with an empty set.
      return { ok: true, files: [] };
    }
    return { ok: true, files: paths.map((p) => readConflictFile(main, p)) };
  } catch (err) {
    return { ok: false, reason: "error", error: err instanceof Error ? err.message : String(err) };
  }
}

async function abortImpl(wt: SessionWorktree): Promise<void> {
  const pre = await preflightMerge(wt, { allowMerging: true });
  if (!pre.ok) return;
  if (!(await isMerging(pre.main))) return;
  const head = (await git(pre.main, ["rev-parse", "MERGE_HEAD"])).stdout.trim();
  const tip = (await git(pre.main, ["rev-parse", wt.branch])).stdout.trim();
  if (head && head === tip) await git(pre.main, ["merge", "--abort"]);
}

/** Write resolutions, stage them and commit the merge. Leaves the merge in progress on any failure. */
async function resolveImpl(
  wt: SessionWorktree,
  resolutions: MergeConflictResolution[],
): Promise<MergeConflictResolveResult> {
  try {
    const pre = await preflightMerge(wt, { allowMerging: true });
    if (!pre.ok) return { ok: false, error: pre.error };
    const { main, ident } = pre;
    if (!(await isMerging(main))) return { ok: false, error: "No merge in progress" };
    const head = (await git(main, ["rev-parse", "MERGE_HEAD"])).stdout.trim();
    const tip = (await git(main, ["rev-parse", wt.branch])).stdout.trim();
    if (!head || head !== tip) return { ok: false, error: "The merge in progress is not for this session branch" };

    const pending = new Set(await unmergedPaths(main));
    for (const r of resolutions) {
      // Already resolved and staged by an earlier (partially failed) attempt: nothing to redo.
      if (!pending.has(r.path)) continue;
      const abs = safeJoin(main, r.path);
      if (!abs) return { ok: false, error: `Invalid path: ${r.path}` };
      if (r.action === "content") {
        if (typeof r.content !== "string") return { ok: false, error: `Missing content for ${r.path}` };
        try {
          if (lstatSync(abs).isSymbolicLink()) return { ok: false, error: `${r.path} is a symbolic link; resolve it by taking one side` };
        } catch {
          // File absent (e.g. deleted on one side): writing recreates it.
        }
        writeFileSync(abs, r.content, "utf8");
        const add = await git(main, ["add", "--", r.path]);
        if (!add.ok) return { ok: false, error: add.stderr.trim() || `git add failed for ${r.path}` };
      } else if (r.action === "ours" || r.action === "theirs") {
        const stage = r.action === "ours" ? "2" : "3";
        const entries = await git(main, ["ls-files", "-u", "-z", "--", r.path]);
        const sideExists = entries.stdout.split("\0").some((e) => e.includes(` ${stage}\t`));
        const staged = sideExists
          ? (await git(main, ["checkout", `--${r.action}`, "--", r.path])).ok
            ? await git(main, ["add", "--", r.path])
            : { ok: false, stdout: "", stderr: `Could not check out the ${r.action} version of ${r.path}` }
          : // The chosen side deleted the file: resolve by removing it.
            await git(main, ["rm", "-f", "--", r.path]);
        if (!staged.ok) return { ok: false, error: staged.stderr.trim() || `Could not resolve ${r.path}` };
      } else {
        return { ok: false, error: `Unknown action for ${r.path}` };
      }
    }

    const left = await unmergedPaths(main);
    if (left.length > 0) {
      return { ok: false, error: `${left.length} file(s) still conflicted: ${left.slice(0, 3).join(", ")}${left.length > 3 ? "…" : ""}` };
    }
    const commit = await git(main, ["commit", "--no-edit"], ident);
    if (!commit.ok) return { ok: false, error: (commit.stderr || commit.stdout).trim() || "git commit failed" };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}


/** Serialize start / resolve / abort per project so an abort can't interleave with a resolve. */
const locks = new Map<string, Promise<unknown>>();
function serialized<T>(project: string, fn: () => Promise<T>): Promise<T> {
  const run = (locks.get(project) ?? Promise.resolve()).then(fn, fn);
  const tail = run.catch(() => {});
  locks.set(project, tail);
  void tail.then(() => { if (locks.get(project) === tail) locks.delete(project); });
  return run;
}

export const startConflictMerge = (wt: SessionWorktree): Promise<MergeConflictStartResult> => serialized(wt.projectPath, () => startImpl(wt));
export const abortConflicts = (wt: SessionWorktree): Promise<void> => serialized(wt.projectPath, () => abortImpl(wt));
export const resolveConflicts = (wt: SessionWorktree, resolutions: MergeConflictResolution[]): Promise<MergeConflictResolveResult> =>
  serialized(wt.projectPath, () => resolveImpl(wt, resolutions));
/** Strip a wrapping markdown fence the model may add. */
export function cleanAiResolution(raw: string): string {
  let t = raw.replace(/\r\n/g, "\n");
  const fenced = /^\s*```[\w+-]*\n([\s\S]*?)\n?```\s*$/.exec(t);
  if (fenced) t = fenced[1] ?? "";
  return t.replace(/^\n+|\n+$/g, "");
}

export function buildConflictPrompt(req: MergeConflictAiRequest): string {
  const cap = (s: string) => (s.length > MAX_AI_FIELD_CHARS ? `${s.slice(0, MAX_AI_FIELD_CHARS)}\n[...truncated...]` : s);
  return `You are resolving one git merge conflict hunk in the file "${req.path}".
Merge the two versions into a single correct result that keeps the intent of BOTH sides. If they truly contradict, prefer the "${req.theirsLabel ?? "session branch"}" version but keep any unrelated additions from the other side.
Rules:
1. Output ONLY the final merged lines that replace the whole conflict hunk.
2. Do NOT output conflict markers (<<<<<<<, =======, >>>>>>>), markdown fences, or any explanation.
3. Preserve the file's indentation, style and line endings. Do not repeat the context lines.
${req.hint?.trim() ? `4. Extra instruction from the user: ${req.hint.trim().slice(0, 500)}\n` : ""}
Context before the hunk:
<<<CONTEXT_BEFORE
${cap(req.before)}
CONTEXT_BEFORE>>>

Version A, "${req.oursLabel ?? "base branch"}":
<<<VERSION_A
${cap(req.ours)}
VERSION_A>>>

Version B, "${req.theirsLabel ?? "session branch"}":
<<<VERSION_B
${cap(req.theirs)}
VERSION_B>>>

Context after the hunk:
<<<CONTEXT_AFTER
${cap(req.after)}
CONTEXT_AFTER>>>`;
}

/** One-shot Pi CLI call that proposes a merged hunk. */
export function aiResolveHunk(
  pi: Pick<PiInstallInfo, "nodePath" | "cliPath">,
  cwd: string,
  req: MergeConflictAiRequest,
): Promise<MergeConflictAiResult> {
  const args = [pi.cliPath, "-p", "--no-session", "--no-tools", "--no-context-files"];
  if (req.model) args.push("--model", req.model);

  return new Promise<MergeConflictAiResult>((resolvePromise) => {
    let settled = false;
    const done = (value: MergeConflictAiResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise(value);
    };
    const child = spawn(pi.nodePath, args, { cwd, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    const timer = setTimeout(() => {
      child.kill();
      done({ ok: false, error: "The AI took too long to respond" });
    }, AI_TIMEOUT_MS);

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c: Buffer) => (stdout += c.toString("utf8")));
    child.stderr.on("data", (c: Buffer) => (stderr += c.toString("utf8")));
    child.on("error", (e) => done({ ok: false, error: `Failed to start Pi CLI: ${e.message}` }));
    child.on("close", (code) => {
      if (code !== 0) return done({ ok: false, error: stderr.trim() || `Pi CLI exited with code ${code}` });
      const text = cleanAiResolution(stdout);
      if (!text.trim() && (req.ours.trim() || req.theirs.trim())) return done({ ok: false, error: "The AI returned an empty answer" });
      if (/^(<<<<<<<|>>>>>>>) /m.test(text)) return done({ ok: false, error: "The AI left conflict markers in its answer" });
      done({ ok: true, text });
    });
    child.stdin.on("error", () => {});
    child.stdin.write(buildConflictPrompt(req));
    child.stdin.end();
  });
}
