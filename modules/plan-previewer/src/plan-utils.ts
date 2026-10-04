/**
 * Pure utilities for Plan Previewer: view mode extraction (Summary vs Full),
 * decisions parsing ([!CHOICE] & [!QUESTION]), table of contents headings, and diff stats.
 */

export interface PlanViews {
  summary: string | null;
  full: string | null;
  raw: string;
}

export function extractPlanViews(content: string): PlanViews {
  if (!content || typeof content !== "string") {
    return { summary: null, full: null, raw: "" };
  }

  let summary: string | null = null;
  let full: string | null = null;

  // HTML comment style delimiters: <!-- SUMMARY --> ... <!-- /SUMMARY --> or <!-- FULL -->
  const summaryCommentMatch = content.match(/<!--\s*SUMMARY\s*-->([\s\S]*?)(?:<!--\s*\/SUMMARY\s*-->|(?=<!--\s*FULL\s*-->)|$)/i);
  if (summaryCommentMatch && summaryCommentMatch[1]?.trim()) {
    summary = summaryCommentMatch[1].trim();
  }

  const fullCommentMatch = content.match(/<!--\s*FULL\s*-->([\s\S]*?)(?:<!--\s*\/FULL\s*-->|$)/i);
  if (fullCommentMatch && fullCommentMatch[1]?.trim()) {
    full = fullCommentMatch[1].trim();
  }

  // HTML container tags: <div data-view="summary">...</div>
  if (!summary) {
    const divSummaryMatch = content.match(/<div[^>]*data-view=["']summary["'][^>]*>([\s\S]*?)<\/div>/i);
    if (divSummaryMatch && divSummaryMatch[1]?.trim()) summary = divSummaryMatch[1].trim();
  }
  if (!full) {
    const divFullMatch = content.match(/<div[^>]*data-view=["']full["'][^>]*>([\s\S]*?)<\/div>/i);
    if (divFullMatch && divFullMatch[1]?.trim()) full = divFullMatch[1].trim();
  }

  return { summary, full, raw: content };
}

export interface PlanChoiceOption {
  label: string;
  isRecommended: boolean;
  isPreselected: boolean;
  rawLine: string;
}

export interface DecisionItem {
  id: string; // e.g. "D1", "D2", "Q1"
  type: "choice" | "question";
  title: string;
  prompt: string;
  options: PlanChoiceOption[];
  rawBlock: string;
}

export function extractDecisions(content: string): DecisionItem[] {
  if (!content) return [];
  const items: DecisionItem[] = [];

  // Match blockquotes that start with > [!CHOICE] or > [!QUESTION]
  const blockquoteRegex = /((?:^[ \t]*>[ \t]*.*(?:\r?\n|$))+)/gm;
  let match: RegExpExecArray | null;

  let dCount = 0;
  let qCount = 0;

  while ((match = blockquoteRegex.exec(content)) !== null) {
    const block = match[1]!;
    const cleanLines = block
      .split(/\r?\n/)
      .map((l) => l.replace(/^[ \t]*>[ \t]?/, "").trim())
      .filter((l) => l.length > 0);

    if (cleanLines.length === 0) continue;
    const firstLine = cleanLines[0]!;

    const choiceMatch = firstLine.match(/^\[!CHOICE\]\s*(.*)$/i);
    const questionMatch = firstLine.match(/^\[!QUESTION\]\s*(.*)$/i);

    if (choiceMatch) {
      dCount++;
      const title = choiceMatch[1]?.trim() || `Decision ${dCount}`;
      let prompt = "";
      const options: PlanChoiceOption[] = [];

      for (let i = 1; i < cleanLines.length; i++) {
        const line = cleanLines[i]!;
        const qLineMatch = line.match(/^\*?\*?Question\*?\*?:\s*(.*)$/i);
        if (qLineMatch) {
          prompt = qLineMatch[1]!.trim();
          continue;
        }

        const optMatch = line.match(/^-\s*\(([ xX])\)\s*(.*)$/);
        if (optMatch) {
          const isPreselected = optMatch[1]!.toLowerCase() === "x";
          let label = optMatch[2]!.trim();
          const isRecommended = /\[recommended\]/i.test(label);
          label = label.replace(/\[recommended\]/i, "").trim();
          // Remove leading bold if present
          label = label.replace(/^\*\*(.*?)\*\*(?::\s*)?/, "$1: ");
          options.push({
            label,
            isRecommended,
            isPreselected,
            rawLine: line,
          });
        } else if (!prompt && !line.startsWith("-")) {
          prompt = line;
        }
      }

      items.push({
        id: `D${dCount}`,
        type: "choice",
        title,
        prompt,
        options,
        rawBlock: block,
      });
    } else if (questionMatch) {
      qCount++;
      const title = questionMatch[1]?.trim() || `Question ${qCount}`;
      let prompt = "";

      for (let i = 1; i < cleanLines.length; i++) {
        const line = cleanLines[i]!;
        const qLineMatch = line.match(/^\*?\*?Question\*?\*?:\s*(.*)$/i);
        if (qLineMatch) {
          prompt = qLineMatch[1]!.trim();
          break;
        } else if (!prompt) {
          prompt = line;
        }
      }

      items.push({
        id: `Q${qCount}`,
        type: "question",
        title,
        prompt,
        options: [],
        rawBlock: block,
      });
    }
  }

  return items;
}

export interface TocHeading {
  id: string;
  text: string;
  level: number;
}

export function extractTocHeadings(markdown: string): TocHeading[] {
  if (!markdown) return [];
  const lines = markdown.split(/\r?\n/);
  const headings: TocHeading[] = [];
  const seenSlugs = new Map<string, number>();

  for (const line of lines) {
    const match = line.match(/^(#{1,3})\s+(.*)$/);
    if (!match) continue;
    const level = match[1]!.length;
    let text = match[2]!.trim();
    // Strip markdown formatting from heading text
    text = text.replace(/[*_`]/g, "").replace(/\[(.*?)\]\(.*?\)/g, "$1");

    let slug = text
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-");

    const count = seenSlugs.get(slug) || 0;
    seenSlugs.set(slug, count + 1);
    if (count > 0) slug = `${slug}-${count}`;

    headings.push({ id: slug, text, level });
  }

  return headings;
}

export function summarizeDiff(oldText: string, newText: string): { additions: number; deletions: number } {
  if (!oldText || !newText || oldText === newText) return { additions: 0, deletions: 0 };
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");

  const oldSet = new Set(oldLines);
  const newSet = new Set(newLines);

  let additions = 0;
  let deletions = 0;

  for (const line of newLines) {
    if (!oldSet.has(line)) additions++;
  }
  for (const line of oldLines) {
    if (!newSet.has(line)) deletions++;
  }

  return { additions, deletions };
}
