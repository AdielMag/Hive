import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getGitCommitDetail, getGitGraph, getGitTags, gitCreateBranchFrom, gitMerge, gitRenameBranch } from "./service.ts";

describe("branch log helpers", () => {
  it("reads commit detail, tags, scoped graph, create/rename/merge", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hive-git-log-"));
    try {
      const git = (...args: string[]) =>
        execFileSync("git", ["-c", "user.name=Tester", "-c", "user.email=t@t", ...args], { cwd: dir, encoding: "utf8" });
      git("init", "-q");
      git("checkout", "-q", "-b", "main");
      mkdirSync(join(dir, "src"));
      writeFileSync(join(dir, "src", "a.ts"), "one\ntwo\n");
      git("add", "-A");
      git("commit", "-q", "-m", "first", "-m", "body text");
      git("tag", "v1");

      await gitCreateBranchFrom(dir, "feature/x", "main", true);
      writeFileSync(join(dir, "b.txt"), "b\n");
      git("add", "-A");
      git("commit", "-q", "-m", "second");

      const all = await getGitGraph(dir, 10);
      expect(all.map((c) => c.message)).toEqual(["second", "first"]);
      expect(all[0]!.date).toMatch(/^\d{4}-/);
      expect(all[0]!.authorEmail).toBe("t@t");
      const scoped = await getGitGraph(dir, 10, { ref: "main" });
      expect(scoped.map((c) => c.message)).toEqual(["first"]);

      const first = await getGitCommitDetail(dir, scoped[0]!.hash);
      expect(first?.subject).toBe("first");
      expect(first?.body).toBe("body text");
      expect(first?.files).toEqual([{ path: "src/a.ts", status: "added", additions: 2, deletions: 0 }]);
      expect(first?.containedIn).toEqual(expect.arrayContaining(["main", "feature/x"]));

      expect((await getGitTags(dir)).map((t) => t.name)).toEqual(["v1"]);

      await gitRenameBranch(dir, "feature/x", "feature/y");
      git("checkout", "-q", "main");
      await gitMerge(dir, "feature/y");
      expect((await getGitGraph(dir, 10, { ref: "main" })).map((c) => c.message)).toContain("second");

      await expect(gitMerge(dir, "--abort")).rejects.toThrow(/Invalid/);
      await expect(gitCreateBranchFrom(dir, "ok", "-bad")).rejects.toThrow(/Invalid/);
      expect(await getGitCommitDetail(dir, "--all")).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);
});
