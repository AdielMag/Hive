/** DOM post-passes over the rendered plan (host Markdown gives no hooks): heading ids, badges, note highlights. */
import { cleanTitle, createHeadingIdAllocator, type TocHeading } from "../plan-utils.ts";

/** Rendered markdown segments (excludes decision cards, callout headers, etc.). */
const MD_SCOPE = ".plan-seg-md";

/**
 * Idempotent: assigns ids to h1-h3 in document order and returns them for the outline. Runs after every content
 * change; ids are recomputed from scratch each time, so reused DOM nodes never keep a stale id.
 */
export function applyHeadingIds(root: HTMLElement): TocHeading[] {
  const nextId = createHeadingIdAllocator();
  const out: TocHeading[] = [];
  root.querySelectorAll<HTMLElement>(`${MD_SCOPE} :is(h1, h2, h3)`).forEach((h) => {
    const text = cleanTitle(h.textContent ?? "");
    const id = nextId(text);
    if (h.id !== id) h.id = id;
    out.push({ id, text, level: Number(h.tagName.slice(1)) });
  });
  return out;
}

const BADGE = /^\[(NEW|MODIFY|MODIFIED|DELETE|DELETED|RENAME|RENAMED)\]$/i;
const BADGE_KIND: Record<string, string> = {
  NEW: "new",
  MODIFY: "modify",
  MODIFIED: "modify",
  DELETE: "delete",
  DELETED: "delete",
  RENAME: "rename",
  RENAMED: "rename",
};

/** Idempotent: tags `[NEW]` / `[MODIFY]` / `[DELETE]` inline code spans so CSS can render them as badges. */
export function applyBadges(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>(`${MD_SCOPE} code`).forEach((el) => {
    if (el.closest("pre, .codeblock")) return;
    const m = (el.textContent ?? "").trim().match(BADGE);
    const normalized = m ? BADGE_KIND[m[1]!.toUpperCase()] : undefined;
    if (normalized) {
      if (el.dataset.planBadge !== normalized) el.dataset.planBadge = normalized;
    } else if (el.dataset.planBadge) {
      delete el.dataset.planBadge;
    }
  });
}

const BLOCKS = "p, li, h1, h2, h3, h4, h5, h6, td, th, pre, blockquote, .plan-seg-md, .plan-callout__body";

/** Finds `needle` inside `root`'s text (whitespace-insensitive, across element boundaries). */
export function findTextRange(root: HTMLElement, needle: string): Range | null {
  const target = needle.replace(/\s+/g, " ").trim();
  if (!target) return null;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) =>
      (n.parentElement?.closest(`${MD_SCOPE}, .plan-callout__body`) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
  });
  let flat = "";
  const map: Array<{ node: Text; offset: number }> = [];
  let lastSpace = true;
  let prev: { node: Text; block: Element | null } | null = null;
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    const block = n.parentElement?.closest(BLOCKS) ?? null;
    // Block boundaries separate words in the selection text ("\n"), inline boundaries do not.
    if (prev && prev.block !== block && !lastSpace) {
      flat += " ";
      map.push({ node: prev.node, offset: prev.node.data.length });
      lastSpace = true;
    }
    const s = n.data;
    for (let i = 0; i < s.length; i++) {
      const isSpace = /\s/.test(s[i]!);
      if (isSpace && lastSpace) continue;
      flat += isSpace ? " " : s[i];
      map.push({ node: n, offset: i });
      lastSpace = isSpace;
    }
    prev = { node: n, block };
  }

  const idx = flat.indexOf(target);
  if (idx < 0) return null;
  const start = map[idx]!;
  const end = map[idx + target.length - 1]!;
  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, Math.min(end.offset + 1, end.node.data.length));
  return range;
}

const HIGHLIGHT_NAME = "plan-note";

/** Progressive enhancement: CSS Custom Highlight API (Chromium). Returns false when unsupported. */
export function setNoteHighlights(ranges: Range[]): boolean {
  const registry = (globalThis.CSS as unknown as { highlights?: Map<string, unknown> } | undefined)?.highlights;
  const HighlightCtor = (globalThis as unknown as { Highlight?: new (...r: Range[]) => unknown }).Highlight;
  if (!registry || !HighlightCtor) return false;
  if (ranges.length === 0) registry.delete(HIGHLIGHT_NAME);
  else registry.set(HIGHLIGHT_NAME, new HighlightCtor(...ranges));
  return true;
}

export function scrollToRange(range: Range): void {
  const el = range.startContainer.parentElement;
  el?.scrollIntoView({ behavior: "smooth", block: "center" });
}
