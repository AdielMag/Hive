import { describe, expect, it } from "vitest";
import {
  cleanTitle,
  createHeadingIdAllocator,
  extractDecisions,
  extractInlinePart,
  extractPlanViews,
  parsePlanCommandPath,
  parseReviewResult,
  resolvePlanPath,
  samePlanPath,
  stripMoreMarker,
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

describe("extractInlinePart", () => {
  const body = (n: number) => Array.from({ length: n }, (_, i) => `- item ${i}`).join("\n");

  it("cuts at the MORE marker", () => {
    const r = extractInlinePart("# T\n\nIntro.\n\n<!-- MORE -->\n\n## Details\nx");
    expect(r).toEqual({ markdown: "# T\n\nIntro.", hasMore: true, source: "marker" });
  });

  it("MORE at the very end has nothing more", () => {
    expect(extractInlinePart("# T\n\nIntro.\n<!-- MORE -->\n").hasMore).toBe(false);
  });

  it("uses SUMMARY when there is no marker", () => {
    const r = extractInlinePart("<!-- SUMMARY -->\n# T\nshort\n<!-- /SUMMARY -->\n<!-- FULL -->\n# T\nlong\n<!-- /FULL -->");
    expect(r.source).toBe("summary");
    expect(r.markdown).toBe("# T\nshort");
    expect(r.hasMore).toBe(true);
  });

  it("keeps a short plan whole", () => {
    const r = extractInlinePart("# T\n\nIntro\n\n## A\n- x");
    expect(r.source).toBe("whole");
    expect(r.hasMore).toBe(false);
  });

  it("truncates a long plan at a blank line", () => {
    const md = `# T\n\nIntro\n\n## A\n${body(10)}\n\n## B\n${body(30)}`;
    const r = extractInlinePart(md, 24);
    expect(r.source).toBe("truncated");
    expect(r.hasMore).toBe(true);
    expect(r.markdown.endsWith("- item 9")).toBe(true);
    expect(r.markdown).not.toContain("## B");
  });

  it("never cuts inside a code fence or a decision block", () => {
    const md = [
      "# T",
      "",
      body(18),
      "",
      "> [!CHOICE] Pick",
      "> **Question**: Which?",
      "> - (x) **A**: a",
      "",
      "> - ( ) **B**: b",
      "",
      "```",
      "a",
      "",
      "b",
      "```",
      body(20),
    ].join("\n");
    const r = extractInlinePart(md, 22);
    const quoteStart = r.markdown.includes("[!CHOICE]");
    if (quoteStart) expect(r.markdown).toContain("**B**");
    expect((r.markdown.match(/```/g) ?? []).length % 2).toBe(0);
  });

  it("has no cut point: returns the whole plan", () => {
    expect(extractInlinePart(body(40), 24).hasMore).toBe(false);
  });
});

describe("stripMoreMarker", () => {
  it("removes the marker line", () => {
    expect(stripMoreMarker("a\n<!-- MORE -->\nb")).toBe("a\nb");
  });
});

describe("parsePlanCommandPath", () => {
  it("finds the file argument", () => {
    expect(parsePlanCommandPath('plan-previewer ./plan.md --context="x y"')).toBe("./plan.md");
    expect(parsePlanCommandPath('cd /x && "C:/Users/a b/hive/bin/plan-previewer" "docs/my plan.md" --ask="q"')).toBe("docs/my plan.md");
    expect(parsePlanCommandPath("plan-previewer --context=x plan.md")).toBe("plan.md");
  });
  it("ignores other commands", () => {
    expect(parsePlanCommandPath("ls plan-previewer-notes")).toBeNull();
    expect(parsePlanCommandPath("cat modules/plan-previewer/src/a.ts")).toBeNull();
    expect(parsePlanCommandPath("npm test")).toBeNull();
  });
});

describe("parseReviewResult", () => {
  it("reads the settled status", () => {
    expect(parseReviewResult('\n[PLAN-REVIEW]: status=APPROVED | mode=AUTO-EDIT | comment="None"')).toEqual({ status: "approved", mode: "auto-edit" });
    expect(parseReviewResult('[PLAN-REVIEW]: status=CHANGES_REQUESTED | comment="x"').status).toBe("changes_requested");
    expect(parseReviewResult("Plan previewer wait timeout completed after 240s").status).toBe("timeout");
    expect(parseReviewResult("whatever").status).toBe("unknown");
  });
});

describe("resolvePlanPath", () => {
  it("keeps absolute paths and joins relative ones to the project", () => {
    expect(resolvePlanPath("C:\\a\\b\\plan.md", "C:/p", [])).toBe("C:/a/b/plan.md");
    expect(resolvePlanPath("docs/plan.md", "C:\\p", [])).toBe("C:/p/docs/plan.md");
    expect(resolvePlanPath("./x/../plan.md", "/home/p", [])).toBe("/home/p/plan.md");
  });
  it("prefers a path the CLI announced", () => {
    expect(resolvePlanPath("docs/plan.md", "C:/wrong", ["C:\\Users\\me\\Hive\\docs\\plan.md"])).toBe("C:/Users/me/Hive/docs/plan.md");
  });
  it("falls back to the newest announced path with no arg", () => {
    expect(resolvePlanPath(null, null, ["/a/plan.md"])).toBe("/a/plan.md");
    expect(resolvePlanPath(null, null, [])).toBeNull();
  });
  it("compares paths loosely", () => {
    expect(samePlanPath("C:\\A\\plan.md", "c:/a/plan.md")).toBe(true);
    expect(samePlanPath("a", null)).toBe(false);
    expect(samePlanPath("C:/Users/me/Hive/plan.md", "plan.md")).toBe(true);
    expect(samePlanPath("plan.md", "C:\\Users\\me\\Hive\\plan.md")).toBe(true);
    expect(samePlanPath("C:/Users/me/Hive/plan.md", "./plan.md")).toBe(true);
    expect(samePlanPath("C:/Users/me/Hive/other.md", "plan.md")).toBe(false);
  });
});
