/**
 * Pure utilities for Plan Previewer: view extraction (Summary vs Full), segmenting a view into markdown /
 * decision / callout blocks, decision parsing ([!CHOICE] & [!QUESTION]), outline headings, and diff stats.
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

/** The markdown shown for a view mode: the requested section when present, otherwise the other one, else raw. */
export function activeViewMarkdown(views: PlanViews, mode: "summary" | "full"): string {
  if (mode === "summary" && views.summary) return views.summary;
  if (mode === "full" && views.full) return views.full;
  return views.full ?? views.summary ?? views.raw;
}

/** One slug function for outline entries, heading ids, scrolling and decision keys. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
}

/** Drops the "(Executive Summary)" / "(Full Specification)" suffixes the old skill template added to titles. */
export function cleanTitle(text: string): string {
  return text
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\s*[([]\s*(?:executive\s+summary|full\s+spec(?:ification)?)\s*[)\]]\s*$/i, "")
    .trim();
}

/** Plain text of an inline-markdown string (links, emphasis, code ticks removed). */
export function stripInlineMarkdown(text: string): string {
  return text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/(^|[^\w*])[*_](\S[^*_]*?)[*_](?=[^\w*]|$)/g, "$1$2")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/~~(.+?)~~/g, "$1")
    .trim();
}

export interface PlanChoiceOption {
  /** Option name (bold part of `**Name**: why`). */
  label: string;
  /** The reason / description after the name, if any. */
  detail: string;
  /** Full option text sent back to the agent: `Name: detail`. */
  text: string;
  isRecommended: boolean;
  isPreselected: boolean;
  rawLine: string;
}

export interface DecisionItem {
  /** Positional id within the parsed markdown: "D1", "D2", "Q1"... (sent in the feedback payload). */
  id: string;
  /** Stable key (type + title slug) that survives agent revisions and reordering. */
  key: string;
  type: "choice" | "question";
  title: string;
  prompt: string;
  options: PlanChoiceOption[];
  rawBlock: string;
}

export type CalloutType = "note" | "tip" | "important" | "warning" | "caution";

export type PlanSegment =
  | { kind: "md"; text: string }
  | { kind: "decision"; item: DecisionItem }
  | { kind: "callout"; type: CalloutType; title: string; body: string };

const FENCE_OPEN = /^[ \t]*(`{3,}|~{3,})/;
const QUOTE_LINE = /^[ \t]*>/;
const MARKER = /^\[!(CHOICE|QUESTION|NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*(.*)$/i;
const HEADING = /^(#{1,6})[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/;

/** Tracks fenced code blocks line by line so blockquotes / headings inside code are left alone. */
function createFenceTracker() {
  let fence: { char: string; len: number } | null = null;
  return (line: string): boolean => {
    const m = line.match(FENCE_OPEN);
    if (fence) {
      if (m && m[1]![0] === fence.char && m[1]!.length >= fence.len && line.trim() === m[1]) fence = null;
      return true;
    }
    if (m) {
      fence = { char: m[1]![0]!, len: m[1]!.length };
      return true;
    }
    return false;
  };
}

function unquote(line: string): string {
  return line.replace(/^[ \t]*>[ \t]?/, "");
}

function decisionKey(type: DecisionItem["type"], title: string): string {
  return `${type === "choice" ? "d" : "q"}-${slugify(title) || "untitled"}`;
}

function parseOption(line: string): PlanChoiceOption | null {
  const m = line.match(/^[-*+]\s*\(([ xX])\)\s*(.*)$/);
  if (!m) return null;
  const isPreselected = m[1]!.toLowerCase() === "x";
  let rest = m[2]!.trim();
  const isRecommended = /[[(]recommended[\])]/i.test(rest);
  rest = rest.replace(/\s*[[(]recommended[\])]\s*/gi, " ").trim();

  let label = rest;
  let detail = "";
  const bold = rest.match(/^\*\*(.+?)\*\*\s*(?:[:：]|—|–|\s-\s|-)?\s*([\s\S]*)$/);
  if (bold) {
    label = bold[1]!.trim().replace(/[:：]$/, "").trim();
    detail = bold[2]!.trim();
  } else {
    const plain = rest.match(/^(.+?)\s+(?:—|–)\s+(.+)$/);
    if (plain) {
      label = plain[1]!.trim();
      detail = plain[2]!.trim();
    }
  }
  const text = detail ? `${label}: ${detail}` : label;
  return { label, detail, text, isRecommended, isPreselected, rawLine: line };
}

function parseDecisionBlock(type: DecisionItem["type"], titleText: string, bodyLines: string[], rawBlock: string, ordinal: number): DecisionItem {
  const title = cleanTitle(titleText) || (type === "choice" ? `Decision ${ordinal}` : `Question ${ordinal}`);
  const lines = bodyLines.map((l) => l.trim()).filter(Boolean);
  let prompt = "";
  const options: PlanChoiceOption[] = [];

  for (const line of lines) {
    const q = line.match(/^\*{0,2}Question\*{0,2}\s*:\*{0,2}\s*(.*)$/i);
    if (q) {
      prompt = q[1]!.trim();
      continue;
    }
    if (type === "choice") {
      const opt = parseOption(line);
      if (opt) {
        options.push(opt);
        continue;
      }
    }
    if (!prompt && !/^[-*+]\s/.test(line)) prompt = line;
  }

  return { id: "", key: decisionKey(type, title), type, title, prompt, options, rawBlock };
}

/**
 * Splits a plan view into renderable segments: plain markdown, decision blocks (`> [!CHOICE]` / `> [!QUESTION]`)
 * and GitHub-style callouts (`> [!NOTE]` etc). Indented `>` is accepted; blockquotes inside fenced code are not
 * touched. Decisions get positional ids (D#/Q#) de-duplicated by key, so a block repeated in the same view
 * reuses one id. Heading lines lose the old "(Executive Summary)" suffixes.
 */
export function segmentPlan(markdown: string): PlanSegment[] {
  if (!markdown) return [];
  const lines = markdown.split(/\r?\n/);
  const segments: PlanSegment[] = [];
  const inFence = createFenceTracker();
  const ids = new Map<string, string>();
  let dCount = 0;
  let qCount = 0;
  let buffer: string[] = [];

  const flush = () => {
    const text = buffer.join("\n");
    if (text.trim()) segments.push({ kind: "md", text });
    buffer = [];
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (inFence(line)) {
      buffer.push(line);
      i++;
      continue;
    }
    if (!QUOTE_LINE.test(line)) {
      const h = line.match(HEADING);
      const cleaned = h ? cleanTitle(h[2]!) : null;
      buffer.push(h && cleaned && cleaned !== h[2] ? `${h[1]} ${cleaned}` : line);
      i++;
      continue;
    }

    // Collect a contiguous blockquote.
    const start = i;
    while (i < lines.length && QUOTE_LINE.test(lines[i]!)) i++;
    const block = lines.slice(start, i);
    const inner = block.map(unquote);
    const firstIdx = inner.findIndex((l) => l.trim().length > 0);
    const marker = firstIdx >= 0 ? inner[firstIdx]!.trim().match(MARKER) : null;
    if (!marker) {
      buffer.push(...block);
      continue;
    }

    flush();
    const kind = marker[1]!.toUpperCase();
    const titleText = marker[2]!.trim();
    const body = inner.slice(firstIdx + 1);
    const rawBlock = block.join("\n");

    if (kind === "CHOICE" || kind === "QUESTION") {
      const type = kind === "CHOICE" ? "choice" : "question";
      const item = parseDecisionBlock(type, titleText, body, rawBlock, type === "choice" ? dCount + 1 : qCount + 1);
      let id = ids.get(item.key);
      if (!id) {
        id = type === "choice" ? `D${++dCount}` : `Q${++qCount}`;
        ids.set(item.key, id);
      }
      segments.push({ kind: "decision", item: { ...item, id } });
    } else {
      segments.push({
        kind: "callout",
        type: kind.toLowerCase() as CalloutType,
        title: titleText,
        body: body.join("\n").trim(),
      });
    }
  }
  flush();
  return segments;
}

/** Decisions of a view (pass the active view, not the raw file), de-duplicated by title key. */
export function extractDecisions(markdown: string): DecisionItem[] {
  const seen = new Set<string>();
  const items: DecisionItem[] = [];
  for (const seg of segmentPlan(markdown)) {
    if (seg.kind !== "decision" || seen.has(seg.item.key)) continue;
    seen.add(seg.item.key);
    items.push(seg.item);
  }
  return items;
}

export interface TocHeading {
  id: string;
  text: string;
  level: number;
}

/** Assigns unique ids to heading texts in document order (`slug`, `slug-1`, ...). Shared with the DOM pass. */
export function createHeadingIdAllocator(): (text: string) => string {
  const seen = new Map<string, number>();
  return (text: string) => {
    const base = slugify(text) || "section";
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count > 0 ? `${base}-${count}` : base;
  };
}

export function extractTocHeadings(markdown: string): TocHeading[] {
  if (!markdown) return [];
  const headings: TocHeading[] = [];
  const inFence = createFenceTracker();
  const nextId = createHeadingIdAllocator();

  for (const line of markdown.split(/\r?\n/)) {
    if (inFence(line)) continue;
    const match = line.match(/^(#{1,3})[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/);
    if (!match) continue;
    const text = cleanTitle(stripInlineMarkdown(match[2]!));
    headings.push({ id: nextId(text), text, level: match[1]!.length });
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

// ---------- Inline part (the compact card in the session) ----------

/** Line cap for the inline part when a plan has no `<!-- MORE -->` marker and no SUMMARY section. */
export const INLINE_MAX_LINES = 24;

const MORE_MARKER = /^[ \t]*<!--\s*MORE\s*-->[ \t]*$/im;

/** The plan without its `<!-- MORE -->` marker line(s): what the popup / tab renders for a single-view plan. */
export function stripMoreMarker(content: string): string {
  return content.replace(/^[ \t]*<!--\s*MORE\s*-->[ \t]*\r?\n?/gim, "");
}

export interface InlinePart {
  markdown: string;
  /** True when the popup has content the inline part leaves out. */
  hasMore: boolean;
  source: "marker" | "summary" | "truncated" | "whole";
}

/**
 * The part of a plan shown inline in the session card. Precedence: everything above `<!-- MORE -->`; else the
 * SUMMARY section; else the head of the plan cut at a block boundary near `maxLines` (never inside a code fence
 * or a blockquote, so decision blocks stay whole).
 */
export function extractInlinePart(content: string, maxLines = INLINE_MAX_LINES): InlinePart {
  const text = content ?? "";
  const marker = MORE_MARKER.exec(text);
  if (marker) {
    const markdown = text.slice(0, marker.index).trim();
    if (markdown) return { markdown, hasMore: text.slice(marker.index + marker[0].length).trim().length > 0, source: "marker" };
  }

  const views = extractPlanViews(text);
  if (views.summary) return { markdown: views.summary, hasMore: Boolean(views.full), source: "summary" };

  const lines = text.replace(/\s+$/, "").split(/\r?\n/);
  if (lines.length <= maxLines) return { markdown: lines.join("\n"), hasMore: false, source: "whole" };

  // Collect safe cut points: blank lines outside fences and blockquotes.
  const inFence = createFenceTracker();
  const cuts: number[] = [];
  let prevQuote = false;
  lines.forEach((line, i) => {
    const fenced = inFence(line);
    const quote = !fenced && QUOTE_LINE.test(line);
    if (!fenced && !quote && line.trim() === "" && !prevQuote) cuts.push(i);
    prevQuote = quote;
  });
  const before = cuts.filter((i) => i > 0 && i <= maxLines);
  const cut = before.length > 0 ? before[before.length - 1]! : cuts.find((i) => i > maxLines);
  if (cut === undefined) return { markdown: lines.join("\n"), hasMore: false, source: "whole" };
  const markdown = lines.slice(0, cut).join("\n").trim();
  return { markdown, hasMore: lines.slice(cut).join("").trim().length > 0, source: "truncated" };
}

/** Plan path from a `plan-previewer <file> [--flags]` shell command, or null. */
export function parsePlanCommandPath(command: string): string | null {
  if (!/(^|[\s/\\;&|])plan-previewer(\.cmd|\.js)?["']?(\s|$)/i.test(command)) return null;
  const tokens = command.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
  const idx = tokens.findIndex((t) => /(^|[/\\])plan-previewer(\.cmd|\.js)?["']?$/i.test(t));
  if (idx < 0) return null;
  for (const raw of tokens.slice(idx + 1)) {
    if (raw.startsWith("-")) continue;
    if (/^[;&|]/.test(raw)) break;
    return raw.replace(/^["']|["']$/g, "");
  }
  return null;
}

/** Status line the CLI prints when the review settles: `[PLAN-REVIEW]: status=APPROVED | mode=AUTO-EDIT | …`. */
export function parseReviewResult(text: string): { status: "approved" | "changes_requested" | "answered" | "dismissed" | "timeout" | "unknown"; mode?: string } {
  const m = text.match(/\[PLAN-REVIEW\]:\s*status=([A-Z_]+)(?:\s*\|\s*mode=([A-Z-]+))?/i);
  if (m) {
    const status = m[1]!.toLowerCase();
    if (status === "approved" || status === "changes_requested" || status === "answered") return { status, mode: m[2]?.toLowerCase() };
  }
  if (/\[PLAN-ANSWERS\]/.test(text)) return { status: "answered" };
  if (/dismissed by the user/i.test(text)) return { status: "dismissed" };
  if (/wait timeout completed/i.test(text)) return { status: "timeout" };
  return { status: "unknown" };
}

const isAbsolutePath = (p: string) => /^([a-zA-Z]:[\\/]|\/|\\\\)/.test(p);

/** Forward-slash path with `.` / `..` segments resolved (pure; works for Windows and POSIX roots). */
export function normalizePlanPath(p: string): string {
  const slashed = p.replace(/\\/g, "/");
  const m = slashed.match(/^([a-zA-Z]:)?(\/*)/);
  const root = `${m?.[1] ?? ""}${m?.[2] ? "/" : ""}`;
  const out: string[] = [];
  for (const seg of slashed.slice(m?.[0].length ?? 0).split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === ".." && out.length > 0 && out[out.length - 1] !== "..") out.pop();
    else out.push(seg);
  }
  return root + out.join("/");
}

/**
 * Absolute path of the plan a `plan-previewer <arg>` call refers to. Absolute args win; a relative arg matches a
 * path the CLI recently announced (exact, by suffix); otherwise it is joined to the project folder.
 */
export function resolvePlanPath(arg: string | null, projectPath: string | null | undefined, recent: string[]): string | null {
  if (!arg) return recent[0] ?? null;
  if (isAbsolutePath(arg)) return normalizePlanPath(arg);
  const rel = normalizePlanPath(arg);
  const lower = rel.toLowerCase();
  const hit = recent.map(normalizePlanPath).find((p) => p.toLowerCase().endsWith(`/${lower}`));
  if (hit) return hit;
  return projectPath ? normalizePlanPath(`${projectPath}/${arg}`) : rel;
}

/** Case-insensitive, separator-insensitive path equality (supports relative vs absolute suffix matches). */
export function samePlanPath(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  const an = normalizePlanPath(a).toLowerCase();
  const bn = normalizePlanPath(b).toLowerCase();
  if (an === bn) return true;
  if (an.endsWith(`/${bn}`) || bn.endsWith(`/${an}`)) return true;
  return false;
}

/** File name of a plan path (tab title / card header). */
export function planFileName(filePath: string): string {
  return filePath.replace(/\\/g, "/").split("/").pop() || "plan.md";
}
