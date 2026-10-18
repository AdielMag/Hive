/** Pure helpers for git conflict markers: parse a file into text / conflict segments and rebuild it from resolutions. */

export interface TextSegment {
  type: "text";
  text: string;
}

export interface ConflictSegment {
  type: "conflict";
  /** Index among the file's conflicts (0-based). */
  index: number;
  /** Base-branch side (HEAD / "ours"). */
  ours: string;
  /** Session-branch side ("theirs"). */
  theirs: string;
  /** Common ancestor (only with diff3 style markers). */
  base?: string;
  oursLabel: string;
  theirsLabel: string;
}

export type ConflictFileSegment = TextSegment | ConflictSegment;

export type ConflictChoice = "ours" | "theirs" | "both" | "ai" | "custom";

export interface HunkResolution {
  choice: ConflictChoice;
  /** The text that replaces the whole hunk (empty string is valid: delete both). */
  text: string;
}

function splitLines(text: string): string[] {
  return text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
}

const stripEol = (l: string) => l.replace(/\r?\n$/, "");

/** Split content into plain text and conflict hunks. Unterminated markers are kept as plain text. */
export function parseConflicts(content: string): ConflictFileSegment[] {
  const lines = splitLines(content);
  const out: ConflictFileSegment[] = [];
  let buf = "";
  let index = 0;
  let i = 0;
  const flush = () => {
    if (buf) out.push({ type: "text", text: buf });
    buf = "";
  };
  while (i < lines.length) {
    const line = lines[i]!;
    if (!/^<<<<<<< ?/.test(line)) {
      buf += line;
      i++;
      continue;
    }
    // Look ahead for a complete hunk.
    let j = i + 1;
    let ours = "";
    let base: string | undefined;
    let theirs = "";
    let stage: "ours" | "base" | "theirs" = "ours";
    let theirsLabel = "";
    let closed = false;
    for (; j < lines.length; j++) {
      const l = lines[j]!;
      if (stage === "ours" && /^\|\|\|\|\|\|\| ?/.test(l)) {
        stage = "base";
        base = "";
      } else if (stage !== "theirs" && /^=======\r?\n?$/.test(l)) {
        stage = "theirs";
      } else if (stage === "theirs" && /^>>>>>>> ?/.test(l)) {
        theirsLabel = stripEol(l).replace(/^>>>>>>> ?/, "");
        closed = true;
        break;
      } else if (stage === "ours") ours += l;
      else if (stage === "base") base += l;
      else theirs += l;
    }
    if (!closed) {
      buf += line;
      i++;
      continue;
    }
    flush();
    out.push({
      type: "conflict",
      index: index++,
      ours,
      theirs,
      ...(base !== undefined ? { base } : {}),
      oursLabel: stripEol(line).replace(/^<<<<<<< ?/, ""),
      theirsLabel,
    });
    i = j + 1;
  }
  flush();
  return out;
}

export function conflictCount(segments: ConflictFileSegment[]): number {
  return segments.reduce((n, s) => n + (s.type === "conflict" ? 1 : 0), 0);
}

/** Text a standard choice produces for a hunk. */
export function choiceText(seg: ConflictSegment, choice: "ours" | "theirs" | "both"): string {
  if (choice === "ours") return seg.ours;
  if (choice === "theirs") return seg.theirs;
  // Keep each side line-terminated so the two never run together.
  const a = seg.ours && !seg.ours.endsWith("\n") ? `${seg.ours}\n` : seg.ours;
  return a + seg.theirs;
}

/** Rebuild the file. Unresolved hunks are re-emitted with their original markers. */
export function buildResolved(
  segments: ConflictFileSegment[],
  resolutions: Record<number, HunkResolution | undefined>,
): string {
  let out = "";
  for (const s of segments) {
    if (s.type === "text") {
      out += s.text;
      continue;
    }
    const r = resolutions[s.index];
    if (r) {
      out += r.text;
      continue;
    }
    out += `<<<<<<< ${s.oursLabel}\n${s.ours}`;
    if (s.base !== undefined) out += `||||||| base\n${s.base}`;
    out += `=======\n${s.theirs}>>>>>>> ${s.theirsLabel}\n`;
  }
  return out;
}

/** Normalize an AI/user-edited hunk so it ends with a newline when the surrounding file continues. */
export function normalizeHunkText(text: string, eol: "\n" | "\r\n" = "\n"): string {
  const t = text.replace(/\r?\n/g, eol);
  return t === "" || t.endsWith("\n") ? t : t + eol;
}

/** Up to `n` lines of context immediately before / after a conflict hunk. */
export function hunkContext(segments: ConflictFileSegment[], index: number, n = 20): { before: string; after: string } {
  const pos = segments.findIndex((s) => s.type === "conflict" && s.index === index);
  if (pos < 0) return { before: "", after: "" };
  const prev = segments[pos - 1];
  const next = segments[pos + 1];
  const before = prev?.type === "text" ? splitLines(prev.text).slice(-n).join("") : "";
  const after = next?.type === "text" ? splitLines(next.text).slice(0, n).join("") : "";
  return { before, after };
}
