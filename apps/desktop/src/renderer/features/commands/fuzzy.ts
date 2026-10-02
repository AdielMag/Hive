/** Tiny dependency-free fuzzy matcher for the command palette. */

export interface FuzzyResult {
  score: number;
  /** Half-open [start, end) index ranges in the original text that matched (for highlighting). */
  ranges: Array<[number, number]>;
}

const isBoundary = (text: string, i: number): boolean => {
  if (i === 0) return true;
  const prev = text[i - 1]!;
  const cur = text[i]!;
  return /[\s\-_/\\.:>@]/.test(prev) || (prev === prev.toLowerCase() && cur !== cur.toLowerCase());
};

function mergeRanges(idx: number[]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const i of idx) {
    const last = out[out.length - 1];
    if (last && last[1] === i) last[1] = i + 1;
    else out.push([i, i + 1]);
  }
  return out;
}

/** Returns null when `query` is not a case-insensitive subsequence of `text`. Empty query matches with score 0. */
export function fuzzyMatch(query: string, text: string): FuzzyResult | null {
  const q = query.trim().toLowerCase().replace(/\s+/g, "");
  if (!q) return { score: 0, ranges: [] };
  const t = text.toLowerCase();

  // Best case: contiguous substring, preferring word starts and earlier positions.
  const sub = t.indexOf(q);
  if (sub !== -1) {
    let at = sub;
    for (let from = sub; from !== -1; from = t.indexOf(q, from + 1)) {
      if (isBoundary(text, from)) {
        at = from;
        break;
      }
    }
    const score = 100 + (at === 0 ? 40 : isBoundary(text, at) ? 25 : 0) - at * 0.5 + (q.length === t.length ? 30 : 0);
    return { score, ranges: [[at, at + q.length]] };
  }

  // Greedy subsequence with boundary/consecutive bonuses.
  const idx: number[] = [];
  let score = 0;
  let pos = 0;
  for (const ch of q) {
    const next = t.indexOf(ch, pos);
    if (next === -1) return null;
    // Prefer a word-boundary hit that is reasonably near; otherwise the next occurrence.
    let found = next;
    for (let j = next; j !== -1 && j < next + 12; j = t.indexOf(ch, j + 1)) {
      if (isBoundary(text, j)) {
        found = j;
        break;
      }
    }
    const prev = idx[idx.length - 1];
    if (prev !== undefined && found === prev + 1) score += 8;
    else if (isBoundary(text, found)) score += 6;
    else score += 1;
    score -= prev !== undefined ? Math.min(found - prev - 1, 10) * 0.3 : found * 0.2;
    idx.push(found);
    pos = found + 1;
  }
  return { score, ranges: mergeRanges(idx) };
}
