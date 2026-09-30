import { describe, expect, it } from "vitest";
import { getGitStatus, getGitBranches, getGitDiff } from "./git.ts";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(__dirname, "../../../..");

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
    const branches = await getGitBranches(repoRoot);
    expect(branches.length).toBeGreaterThan(0);
    expect(branches).toContain("master");
  });

  it("reads git diff", async () => {
    const diff = await getGitDiff(repoRoot);
    expect(typeof diff).toBe("string");
  });
});
