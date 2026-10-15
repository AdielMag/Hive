import { describe, expect, it } from "vitest";
import {
  COLLAPSED_SUMMARY_MAX_HEIGHT,
  getSummaryTitle,
  shouldSummaryCollapseHeuristic,
} from "./SummaryMessage.tsx";

describe("SummaryMessage", () => {
  describe("getSummaryTitle", () => {
    it("returns 'Context compacted' for compaction variant", () => {
      expect(getSummaryTitle("compaction")).toBe("Context compacted");
    });

    it("returns 'Branch summary' for branch variant", () => {
      expect(getSummaryTitle("branch")).toBe("Branch summary");
    });

    it("prefers custom title when supplied", () => {
      expect(getSummaryTitle("compaction", "Custom Compaction Title")).toBe("Custom Compaction Title");
      expect(getSummaryTitle("branch", "Custom Branch")).toBe("Custom Branch");
      expect(getSummaryTitle(undefined, "My Custom Event")).toBe("My Custom Event");
    });

    it("defaults to 'Summary' when variant is unknown and no title provided", () => {
      expect(getSummaryTitle(undefined)).toBe("Summary");
      expect(getSummaryTitle("other")).toBe("Summary");
    });
  });

  describe("COLLAPSED_SUMMARY_MAX_HEIGHT", () => {
    it("is set to 84px to comfortably display 3-4 preview rows", () => {
      expect(COLLAPSED_SUMMARY_MAX_HEIGHT).toBe(84);
    });
  });

  describe("shouldSummaryCollapseHeuristic", () => {
    it("returns false for short single-line or two-line text", () => {
      expect(shouldSummaryCollapseHeuristic("Short summary")).toBe(false);
      expect(shouldSummaryCollapseHeuristic("Line 1\nLine 2")).toBe(false);
      expect(shouldSummaryCollapseHeuristic("")).toBe(false);
    });

    it("returns true for text with 4 or more lines", () => {
      const fourLines = "Goal: Fix bug\n- Step 1 done\n- Step 2 done\n- Next step";
      expect(shouldSummaryCollapseHeuristic(fourLines)).toBe(true);
    });

    it("returns true for long summary text exceeding 180 characters", () => {
      const longText =
        "The agent explored the repository to understand the structure of context compaction and identified several relevant files including Transcript.tsx, transcript.css, and session-store.ts for updates.";
      expect(longText.length).toBeGreaterThan(180);
      expect(shouldSummaryCollapseHeuristic(longText)).toBe(true);
    });
  });
});
