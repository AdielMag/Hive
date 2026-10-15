import { describe, expect, it } from "vitest";
import {
  archiveDecision,
  discardNeedsForce,
  mergeFailureMessage,
  mergeSuccessMessage,
  worktreeChipLabel,
  worktreeStatusParts,
  worktreeTooltipLines,
} from "./worktree.ts";

const wt = { worktreePath: "/p/.hive-worktrees/fix-1", branch: "hive/fix-1", baseBranch: "main", baseCommit: "abc", projectPath: "/p" };
const st = (o: Partial<{ exists: boolean; ahead: number; behind: number; dirty: number }> = {}) => ({
  exists: true,
  ahead: 0,
  behind: 0,
  dirty: 0,
  ...o,
});

describe("worktree labels", () => {
  it("formats the chip and tooltip", () => {
    expect(worktreeChipLabel(wt)).toBe("hive/fix-1 \u2190 main");
    expect(worktreeTooltipLines(wt)).toEqual(["Worktree: /p/.hive-worktrees/fix-1", "Branch: hive/fix-1", "Base: main"]);
  });

  it("lists only non-zero status parts", () => {
    expect(worktreeStatusParts(st())).toEqual([]);
    expect(worktreeStatusParts(st({ ahead: 2, behind: 1, dirty: 3 }))).toEqual(["2 ahead", "1 behind", "3 uncommitted"]);
  });
});

describe("archiveDecision", () => {
  it("removes silently only when nothing would be lost", () => {
    expect(archiveDecision(st())).toBe("remove");
    expect(archiveDecision(st({ behind: 4 }))).toBe("remove");
  });
  it("asks on unmerged commits, uncommitted files or unknown status", () => {
    expect(archiveDecision(st({ ahead: 1 }))).toBe("ask");
    expect(archiveDecision(st({ dirty: 1 }))).toBe("ask");
    expect(archiveDecision(null)).toBe("ask");
  });
  it("does nothing when the folder is already gone", () => {
    expect(archiveDecision(st({ exists: false }))).toBe("none");
  });
});

describe("discardNeedsForce", () => {
  it("requires force for ahead/dirty/unknown", () => {
    expect(discardNeedsForce(st({ ahead: 1 }))).toBe(true);
    expect(discardNeedsForce(st({ dirty: 2 }))).toBe(true);
    expect(discardNeedsForce(null)).toBe(true);
  });
  it("not for a clean or missing worktree", () => {
    expect(discardNeedsForce(st())).toBe(false);
    expect(discardNeedsForce(st({ exists: false, dirty: 1 }))).toBe(false);
  });
});

describe("merge messages", () => {
  it("explains each failure reason", () => {
    expect(mergeFailureMessage({ ok: false, reason: "dirty-main", error: "x" })).toMatch(/main tree has uncommitted/);
    expect(mergeFailureMessage({ ok: false, reason: "base-not-checked-out", error: "x" })).toMatch(/isn't checked out/);
    expect(mergeFailureMessage({ ok: false, reason: "error", error: "boom" })).toBe("boom");
  });
  it("lists conflicting files, capped at five", () => {
    const msg = mergeFailureMessage({ ok: false, reason: "conflict", error: "x", conflicts: ["a", "b", "c", "d", "e", "f", "g"] });
    expect(msg).toContain("a, b, c, d, e and 2 more");
  });
  it("describes success", () => {
    expect(mergeSuccessMessage({ ok: true, alreadyUpToDate: false, uncommitted: 0 }, "main")).toBe("Merged into main.");
    expect(mergeSuccessMessage({ ok: true, alreadyUpToDate: true, uncommitted: 2 }, "main")).toContain("2 uncommitted");
  });
});
