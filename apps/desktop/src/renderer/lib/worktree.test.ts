import { describe, expect, it } from "vitest";
import {
  archiveDecision,
  discardNeedsForce,
  mergeFailureMessage,
  mergeSuccessMessage,
  worktreeChipLabel,
  worktreeShortLabel,
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

  describe("worktreeShortLabel", () => {
    it("leaves a short name untouched", () => {
      expect(worktreeShortLabel("feature")).toBe("feature");
      expect(worktreeShortLabel("main")).toBe("main");
    });

    it("strips the leading hive/ prefix", () => {
      expect(worktreeShortLabel("hive/feature")).toBe("feature");
      expect(worktreeShortLabel("hive/fix-1")).toBe("fix-1");
    });

    it("strips the trailing 6-hex id suffix", () => {
      expect(worktreeShortLabel("hive/feature-ecb26b")).toBe("feature");
      expect(worktreeShortLabel("hive/session-105a2d")).toBe("session");
      expect(worktreeShortLabel("branch-name-123456")).toBe("branch-name");
      // Does not strip non-hex or different length suffixes
      expect(worktreeShortLabel("fix-12345")).toBe("fix-12345");
      expect(worktreeShortLabel("fix-1234567")).toBe("fix-1234567");
      expect(worktreeShortLabel("fix-ghijkl")).toBe("fix-ghijkl");
    });

    it("truncates from the middle with an ellipsis to the exact max length", () => {
      const longBranch = "hive/use-taste-skills-and-emil-diesi-ecb26b";
      // stripped: "use-taste-skills-and-emil-diesi" (length 31)
      const shortened = worktreeShortLabel(longBranch, 22);
      expect(shortened.length).toBe(22);
      expect(shortened).toBe("use-taste-s\u2026emil-diesi");

      // Odd max length
      const odd = worktreeShortLabel(longBranch, 15);
      expect(odd.length).toBe(15);
      expect(odd).toBe("use-tas\u2026l-diesi");
    });
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
