import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { getGitStatus, getGitBranches, getGitDiff } from "./service.ts";
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
});
