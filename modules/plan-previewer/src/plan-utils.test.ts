import { describe, expect, it } from "vitest";
import {
  cleanTitle,
  createHeadingIdAllocator,
  extractDecisions,
  extractPlanViews,
  extractTocHeadings,
  segmentPlan,
  slugify,
  summarizeDiff,
} from "./plan-utils.ts";

describe("plan-utils", () => {
  describe("slugify & cleanTitle", () => {
    it("cleans old suffixes like (Executive Summary) and (Full Specification)", () => {
      expect(cleanTitle("Destructive Guard (Executive Summary)")).toBe("Destructive Guard");
      expect(cleanTitle("My Big Plan (Full Specification)")).toBe("My Big Plan");
      expect(cleanTitle("Normal Title")).toBe("Normal Title");
    });

    it("slugifies text into URL/DOM-friendly identifiers", () => {
      expect(slugify("Database Architecture & Storage")).toBe("database-architecture-storage");
      expect(slugify("Section 1.2: The Core API!")).toBe("section-12-the-core-api");
    });
  });

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

  describe("segmentPlan", () => {
    it("segments markdown, choices, questions, and callouts accurately", () => {
      const markdown = `
# Plan Title

Some intro text here.

> [!NOTE] Invariant note
> Make sure to keep backwards compatibility.

> [!CHOICE] Cache store
> **Question**: Which cache backend?
> - (x) **Redis**: In-memory and fast [Recommended]
> - ( ) **SQLite**: Embedded zero-dep store

> [!QUESTION] Storage retention
> **Question**: How many days of logs should be kept?

Footer paragraph.
`;
      const segments = segmentPlan(markdown);
      expect(segments).toHaveLength(5);

      expect(segments[0]!.kind).toBe("md");
      expect((segments[0] as any).text).toContain("# Plan Title");

      expect(segments[1]!.kind).toBe("callout");
      const callout = segments[1] as any;
      expect(callout.type).toBe("note");
      expect(callout.title).toBe("Invariant note");
      expect(callout.body).toContain("backwards compatibility");

      expect(segments[2]!.kind).toBe("decision");
      const choice = (segments[2] as any).item;
      expect(choice.id).toBe("D1");
      expect(choice.type).toBe("choice");
      expect(choice.title).toBe("Cache store");
      expect(choice.options).toHaveLength(2);
      expect(choice.options[0].label).toBe("Redis");
      expect(choice.options[0].detail).toBe("In-memory and fast");
      expect(choice.options[0].isPreselected).toBe(true);
      expect(choice.options[0].isRecommended).toBe(true);

      expect(segments[3]!.kind).toBe("decision");
      const question = (segments[3] as any).item;
      expect(question.id).toBe("Q1");
      expect(question.type).toBe("question");
      expect(question.title).toBe("Storage retention");

      expect(segments[4]!.kind).toBe("md");
      expect((segments[4] as any).text).toContain("Footer paragraph.");
    });

    it("ignores blockquotes and marker lookalikes inside fenced code blocks", () => {
      const markdown = `
Intro text.

\`\`\`markdown
> [!CHOICE] Not A Real Choice
> - (x) **Option 1**: Test
\`\`\`

Out of fence.
`;
      const segments = segmentPlan(markdown);
      expect(segments).toHaveLength(1);
      expect(segments[0]!.kind).toBe("md");
      expect((segments[0] as any).text).toContain("> [!CHOICE] Not A Real Choice");
    });

    it("handles indented blockquotes without breaking", () => {
      const markdown = `
  > [!WARNING] Breaking Change
  > This requires a database migration.
`;
      const segments = segmentPlan(markdown);
      expect(segments).toHaveLength(1);
      expect(segments[0]!.kind).toBe("callout");
      expect((segments[0] as any).type).toBe("warning");
      expect((segments[0] as any).title).toBe("Breaking Change");
      expect((segments[0] as any).body).toBe("This requires a database migration.");
    });

    it("deduplicates multiple identical decision blocks in the same view", () => {
      const markdown = `
> [!CHOICE] Storage
> **Question**: Which engine?
> - (x) **Disk**: Standard

Some text.

> [!CHOICE] Storage
> **Question**: Which engine?
> - (x) **Disk**: Standard
`;
      const segments = segmentPlan(markdown);
      const decisions = segments.filter((s) => s.kind === "decision") as any[];
      expect(decisions).toHaveLength(2);
      expect(decisions[0].item.id).toBe("D1");
      expect(decisions[1].item.id).toBe("D1");
      expect(decisions[0].item.key).toBe(decisions[1].item.key);
    });
  });

  describe("extractDecisions", () => {
    it("returns deduplicated decision items by key", () => {
      const markdown = `
> [!CHOICE] Architecture Option
> - (x) **Option A**: Standard

> [!CHOICE] Architecture Option
> - (x) **Option A**: Standard
`;
      const decisions = extractDecisions(markdown);
      expect(decisions).toHaveLength(1);
      expect(decisions[0]!.id).toBe("D1");
      expect(decisions[0]!.title).toBe("Architecture Option");
    });
  });

  describe("createHeadingIdAllocator & extractTocHeadings", () => {
    it("assigns unique heading IDs sequentially", () => {
      const allocate = createHeadingIdAllocator();
      expect(allocate("Overview")).toBe("overview");
      expect(allocate("Overview")).toBe("overview-1");
      expect(allocate("Overview")).toBe("overview-2");
    });

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
      expect(diff.additions).toBe(2);
      expect(diff.deletions).toBe(1);
    });
  });
});
