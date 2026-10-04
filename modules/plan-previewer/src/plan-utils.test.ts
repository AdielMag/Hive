import { describe, expect, it } from "vitest";
import { extractDecisions, extractPlanViews, extractTocHeadings, summarizeDiff } from "./plan-utils.ts";

describe("plan-utils", () => {
  describe("extractPlanViews", () => {
    it("extracts summary and full sections with HTML comments", () => {
      const content = `
<!-- SUMMARY -->
# Executive Summary
Strategy details here.
<!-- /SUMMARY -->

<!-- FULL -->
# Full Specification
Architecture details here.
<!-- /FULL -->
      `;
      const views = extractPlanViews(content);
      expect(views.summary).toContain("Executive Summary");
      expect(views.summary).toContain("Strategy details here.");
      expect(views.full).toContain("Full Specification");
      expect(views.full).toContain("Architecture details here.");
    });

    it("falls back gracefully when delimiters are missing", () => {
      const content = "# Plain Plan\nNo sections here.";
      const views = extractPlanViews(content);
      expect(views.summary).toBeNull();
      expect(views.full).toBeNull();
      expect(views.raw).toBe(content);
    });
  });

  describe("extractDecisions", () => {
    it("extracts choices and recommended options", () => {
      const content = `
> [!CHOICE] Database Architecture
> **Question**: Which database engine should we adopt?
> - (x) **SQLite**: Fast, embedded, zero setup [Recommended]
> - ( ) **PostgreSQL**: Robust, network-capable
      `;
      const decisions = extractDecisions(content);
      expect(decisions).toHaveLength(1);
      expect(decisions[0]!.type).toBe("choice");
      expect(decisions[0]!.title).toBe("Database Architecture");
      expect(decisions[0]!.prompt).toBe("Which database engine should we adopt?");
      expect(decisions[0]!.options).toHaveLength(2);
      expect(decisions[0]!.options[0]!.isRecommended).toBe(true);
      expect(decisions[0]!.options[0]!.isPreselected).toBe(true);
      expect(decisions[0]!.options[0]!.label).toContain("SQLite");
    });

    it("extracts open questions", () => {
      const content = `
> [!QUESTION] Security Requirements
> **Question**: Are there any compliance constraints on user data retention?
      `;
      const decisions = extractDecisions(content);
      expect(decisions).toHaveLength(1);
      expect(decisions[0]!.type).toBe("question");
      expect(decisions[0]!.title).toBe("Security Requirements");
      expect(decisions[0]!.prompt).toContain("compliance constraints");
    });
  });

  describe("extractTocHeadings", () => {
    it("extracts H1, H2, and H3 with hierarchy and clean slugs", () => {
      const content = `
# Executive Summary
## Architectural Overview
### Database Layer
## Verification Plan
      `;
      const headings = extractTocHeadings(content);
      expect(headings).toHaveLength(4);
      expect(headings[0]!).toEqual({ id: "executive-summary", text: "Executive Summary", level: 1 });
      expect(headings[1]!).toEqual({ id: "architectural-overview", text: "Architectural Overview", level: 2 });
      expect(headings[2]!).toEqual({ id: "database-layer", text: "Database Layer", level: 3 });
      expect(headings[3]!).toEqual({ id: "verification-plan", text: "Verification Plan", level: 2 });
    });
  });

  describe("summarizeDiff", () => {
    it("calculates line additions and deletions", () => {
      const oldText = "line 1\nline 2\nline 3";
      const newText = "line 1\nline 2 modified\nline 3\nline 4";
      const diff = summarizeDiff(oldText, newText);
      expect(diff.additions).toBe(2); // "line 2 modified" and "line 4"
      expect(diff.deletions).toBe(1); // "line 2"
    });
  });
});
