import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { abortConflicts, buildConflictPrompt, cleanAiResolution, resolveConflicts, startConflictMerge } from "./merge-conflicts.ts";
import { createWorktree } from "./worktrees.ts";

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", ["-c", "user.name=T", "-c", "user.email=t@t", ...args], { cwd, encoding: "utf8", windowsHide: true }).trim();
}

describe("cleanAiResolution / prompt", () => {
  it("strips fences and normalizes newlines", () => {
    expect(cleanAiResolution("```ts\nconst a = 1;\n```")).toBe("const a = 1;");
    expect(cleanAiResolution("x\r\ny\r\n")).toBe("x\ny");
  });
  it("includes both sides and the path", () => {
    const p = buildConflictPrompt({ path: "src/a.ts", before: "b", after: "a", ours: "OURS", theirs: "THEIRS" });
    expect(p).toContain("src/a.ts");
    expect(p).toContain("OURS");
    expect(p).toContain("THEIRS");
  });
});

describe("conflict merge flow", { timeout: 60_000 }, () => {
  let tmp: string;
  let repo: string;

  beforeEach(() => {
    tmp = realpathSync(mkdtempSync(join(tmpdir(), "hive-mc-")));
    repo = join(tmp, "repo");
    mkdirSync(repo);
  });
  afterEach(() => {
    try {
      rmSync(tmp, { recursive: true, force: true });
    } catch {}
  });

  async function setup() {
    git(repo, "init", "-q", "-b", "main");
    writeFileSync(join(repo, "a.txt"), "one\n");
    git(repo, "add", ".");
    git(repo, "commit", "-q", "-m", "init");
    const wt = (await createWorktree({ projectPath: repo, title: "cf" }))!;
    writeFileSync(join(wt.worktreePath, "a.txt"), "from worktree\n");
    git(wt.worktreePath, "commit", "-q", "-am", "wt change");
    writeFileSync(join(repo, "a.txt"), "from main\n");
    git(repo, "commit", "-q", "-am", "main change");
    return wt;
  }

  it("starts, resolves and commits a conflicted merge", async () => {
    const wt = await setup();
    const started = await startConflictMerge(wt);
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.files).toHaveLength(1);
    expect(started.files[0]).toMatchObject({ path: "a.txt", kind: "text" });
    expect(started.files[0]!.content).toContain("<<<<<<<");

    // resuming returns the same conflicts
    const again = await startConflictMerge(wt);
    expect(again.ok && again.files.length).toBe(1);

    // unknown / traversal paths are rejected
    expect(await resolveConflicts(wt, [{ path: "../evil.txt", action: "content", content: "x" }])).toMatchObject({ ok: false });
    // incomplete resolution leaves the merge open
    expect(await resolveConflicts(wt, [])).toMatchObject({ ok: false });

    const res = await resolveConflicts(wt, [{ path: "a.txt", action: "content", content: "merged\n" }]);
    expect(res).toEqual({ ok: true });
    expect(readFileSync(join(repo, "a.txt"), "utf8").replace(/\r/g, "")).toBe("merged\n");
    expect(git(repo, "status", "--porcelain")).toBe("");
    expect(git(repo, "rev-list", "--parents", "-n", "1", "HEAD").split(" ")).toHaveLength(3);
  });

  it("can take a whole side", async () => {
    const wt = await setup();
    await startConflictMerge(wt);
    expect(await resolveConflicts(wt, [{ path: "a.txt", action: "theirs" }])).toEqual({ ok: true });
    expect(readFileSync(join(repo, "a.txt"), "utf8").replace(/\r/g, "")).toBe("from worktree\n");
  });

  it("abort restores the main tree", async () => {
    const wt = await setup();
    await startConflictMerge(wt);
    await abortConflicts(wt);
    expect(git(repo, "status", "--porcelain")).toBe("");
    expect(readFileSync(join(repo, "a.txt"), "utf8").replace(/\r/g, "")).toBe("from main\n");
    expect(existsSync(join(repo, ".git", "MERGE_HEAD"))).toBe(false);
  });
});
