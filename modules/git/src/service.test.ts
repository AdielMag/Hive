import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { getGitStatus, getGitBranches, getGitDiff, parseNumstat, parseStatusV2 } from "./service.ts";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(__dirname, "../../..");

describe("Git operations", () => {
  it("reads status from the current git repository", async () => {
    const status = await getGitStatus(repoRoot);
    expect(status.isRepo).toBe(true);
    expect(status.branch).toBeDefined();
    expect(Array.isArray(status.staged)).toBe(true);
    expect(Array.isArray(status.unstaged)).toBe(true);
    expect(Array.isArray(status.untracked)).toBe(true);
  });

  it("lists local branches", async () => {
    // Hermetic: CI checks out a feature branch, so the host repo may lack main/master.
    const dir = mkdtempSync(join(tmpdir(), "hive-git-branches-"));
    try {
      const git = (...args: string[]) =>
        execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd: dir, stdio: "ignore" });
      git("init", "-q");
      git("checkout", "-q", "-b", "main");
      git("commit", "-q", "--allow-empty", "-m", "init");
      git("branch", "feature-x");
      const branches = await getGitBranches(dir);
      expect(branches).toContain("main");
      expect(branches).toContain("feature-x");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reads git diff", async () => {
    const diff = await getGitDiff(repoRoot);
    expect(typeof diff).toBe("string");
  });

  it("parses porcelain v2 status including renames, conflicts and spaces", () => {
    const raw = [
      "# branch.head main",
      "# branch.upstream origin/main",
      "# branch.ab +2 -1",
      "1 MM N... 100644 100644 100644 aaa bbb src/b file.ts",
      "2 R. N... 100644 100644 100644 aaa bbb R100 src/new.ts	src/old.ts",
      "1 .D N... 100644 100644 000000 aaa bbb gone.ts",
      "u UU N... 100644 100644 100644 100644 a b c conflict.ts",
      "? notes.md",
    ].join("\n");
    const s = parseStatusV2(raw);
    expect(s).toMatchObject({ branch: "main", upstream: "origin/main", ahead: 2, behind: 1 });
    expect(s.staged.map((f) => [f.path, f.status])).toEqual([
      ["src/b file.ts", "modified"],
      ["src/new.ts", "renamed"],
    ]);
    expect(s.staged[1]?.origPath).toBe("src/old.ts");
    expect(s.unstaged.map((f) => [f.path, f.status])).toEqual([
      ["conflict.ts", "conflicted"],
      ["gone.ts", "deleted"],
      ["src/b file.ts", "modified"],
    ]);
    expect(s.untracked.map((f) => f.path)).toEqual(["notes.md"]);
  });

  it("parses numstat and skips binary files", () => {
    const m = parseNumstat("3\t1\ta.ts\n-\t-\timg.png\n0\t5\tdir/b c.ts");
    expect(m.get("a.ts")).toEqual({ additions: 3, deletions: 1 });
    expect(m.has("img.png")).toBe(false);
    expect(m.get("dir/b c.ts")).toEqual({ additions: 0, deletions: 5 });
  });
});
