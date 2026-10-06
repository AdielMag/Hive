/**
 * Quote-, heredoc- and substitution-aware shell command parser.
 *
 * Not a full shell grammar: it splits a command line into pipelines of segments
 * `{ program, args, redirects }`, treating quoted text as data. Command and process
 * substitutions are returned as raw text in `Segment.subs` so the caller can analyse
 * them recursively. Parsing fails (`ok: false`) on unbalanced quotes/substitutions so
 * the caller can fall back to a conservative raw-string scan.
 */

export interface Redirect {
  /** `>`, `>>`, `>|`, `&>`, `&>>`, `>&`, `<`, `<<`, `<<-`, `<<<`, `<&`, `<>` */
  op: string;
  target: string;
}

export interface Sub {
  text: string;
  kind: "command" | "process";
}

export interface Segment {
  /** Source text of the segment (leading reserved words removed). */
  raw: string;
  /** Basename-normalised, lower-cased program name ("" when none). */
  program: string;
  /** First word as written (unquoted value). */
  rawProgram: string;
  args: string[];
  /** `[rawProgram, ...args]`. */
  words: string[];
  /** Leading `VAR=value` words. */
  assignments: string[];
  redirects: Redirect[];
  /** Concatenated heredoc bodies attached to this segment. */
  heredoc?: string;
  /** True when every heredoc delimiter was quoted (no expansion happens in the body). */
  heredocQuoted?: boolean;
  /** Substitutions (`$(..)`, backticks, `<(..)`) found in words, redirect targets and unquoted heredocs. */
  subs: Sub[];
}

export interface Pipeline {
  segments: Segment[];
  raw: string;
}

export interface ParsedCommand {
  ok: boolean;
  error?: string;
  src: string;
  pipelines: Pipeline[];
  /** All segments in source order. */
  segments: Segment[];
  /** Source with quoted/substituted/heredoc content blanked out (for syntax-level regexes). */
  skeleton: string;
}

const RESERVED = new Set(["if", "then", "else", "elif", "fi", "do", "done", "while", "until", "!", "{", "}", "time", "coproc", "esac"]);
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*(\[[^\]]*\])?\+?=/;
const EXEC_EXT = /\.(exe|cmd|bat|com|ps1)$/;

/** Basename-normalise a program word: `/bin/rm` -> `rm`, `C:\x\RM.EXE` -> `rm`, `r\m` -> `rm`. */
export function normalizeProgram(word: string): string {
  let w = word;
  if (!w.includes("/") && !w.includes(":") && w.includes("\\")) w = w.replace(/\\/g, "");
  const parts = w.split(/[\\/]/);
  const base = parts[parts.length - 1] ?? "";
  return base.toLowerCase().replace(EXEC_EXT, "");
}

// ---------------------------------------------------------------------------
// scanning helpers
// ---------------------------------------------------------------------------

function skipSingle(s: string, i: number): number {
  const e = s.indexOf("'", i + 1);
  return e < 0 ? -1 : e + 1;
}

function skipBacktick(s: string, i: number): number {
  let k = i + 1;
  while (k < s.length) {
    const c = s[k];
    if (c === "\\") {
      k += 2;
      continue;
    }
    if (c === "`") return k + 1;
    k++;
  }
  return -1;
}

function skipDouble(s: string, i: number): number {
  let k = i + 1;
  while (k < s.length) {
    const c = s[k];
    if (c === "\\") {
      k += 2;
      continue;
    }
    if (c === '"') return k + 1;
    if (c === "$" && s[k + 1] === "(") {
      const e = readBalanced(s, k + 1);
      if (e < 0) return -1;
      k = e;
      continue;
    }
    if (c === "`") {
      const e = skipBacktick(s, k);
      if (e < 0) return -1;
      k = e;
      continue;
    }
    k++;
  }
  return -1;
}

/** `open` is the index of "(". Returns the index just after the matching ")" or -1. */
function readBalanced(s: string, open: number): number {
  let depth = 0;
  let k = open;
  const pendingHeredocs: Array<{ delim: string; strip: boolean }> = [];
  while (k < s.length) {
    const c = s[k];
    if (c === "\\") {
      k += 2;
      continue;
    }
    // heredoc inside the substitution: its body may hold unbalanced quotes/parens
    if (c === "<" && s[k + 1] === "<" && s[k + 2] !== "<") {
      let j = k + 2;
      let strip = false;
      if (s[j] === "-") {
        strip = true;
        j++;
      }
      while (s[j] === " " || s[j] === "\t") j++;
      let delim = "";
      if (s[j] === "'" || s[j] === '"') {
        const e = s.indexOf(s[j] as string, j + 1);
        if (e < 0) return -1;
        delim = s.slice(j + 1, e);
        j = e + 1;
      } else {
        const m = /^[A-Za-z_][^\s;&|<>()]*/.exec(s.slice(j));
        if (m) {
          delim = m[0];
          j += delim.length;
        }
      }
      if (delim) pendingHeredocs.push({ delim, strip });
      k = Math.max(j, k + 2);
      continue;
    }
    if (c === "\n" && pendingHeredocs.length) {
      k++;
      while (pendingHeredocs.length) {
        const h = pendingHeredocs.shift() as { delim: string; strip: boolean };
        while (k < s.length) {
          let e = s.indexOf("\n", k);
          if (e < 0) e = s.length;
          const line = s.slice(k, e).replace(/\r$/, "");
          k = Math.min(s.length, e + 1);
          if ((h.strip ? line.replace(/^\t+/, "") : line) === h.delim) break;
        }
      }
      continue;
    }
    if (c === "'") {
      const e = skipSingle(s, k);
      if (e < 0) return -1;
      k = e;
      continue;
    }
    if (c === '"') {
      const e = skipDouble(s, k);
      if (e < 0) return -1;
      k = e;
      continue;
    }
    if (c === "`") {
      const e = skipBacktick(s, k);
      if (e < 0) return -1;
      k = e;
      continue;
    }
    if (c === "(") depth++;
    else if (c === ")") {
      depth--;
      if (depth === 0) return k + 1;
    }
    k++;
  }
  return -1;
}

function readBraces(s: string, open: number): number {
  let depth = 0;
  let k = open;
  while (k < s.length) {
    const c = s[k];
    if (c === "\\") {
      k += 2;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return k + 1;
    }
    k++;
  }
  return -1;
}

/** Decode the body of a `$'...'` string. */
function decodeAnsiC(body: string): string {
  return body.replace(/\\(x[0-9a-fA-F]{1,2}|[0-7]{1,3}|u[0-9a-fA-F]{1,4}|.)/gs, (_m, g: string) => {
    if (g[0] === "x" && g.length > 1) return String.fromCharCode(parseInt(g.slice(1), 16));
    if (g[0] === "u" && g.length > 1) return String.fromCharCode(parseInt(g.slice(1), 16));
    if (/^[0-7]+$/.test(g)) return String.fromCharCode(parseInt(g, 8));
    switch (g) {
      case "n":
        return "\n";
      case "t":
        return "\t";
      case "r":
        return "\r";
      case "a":
        return "\x07";
      case "b":
        return "\b";
      case "e":
      case "E":
        return "\x1b";
      default:
        return g;
    }
  });
}

/** Find `$(..)` / backtick substitutions in free text (heredoc bodies). */
function findSubstitutions(text: string): Sub[] {
  const out: Sub[] = [];
  let k = 0;
  while (k < text.length) {
    const c = text[k];
    if (c === "\\") {
      k += 2;
      continue;
    }
    if (c === "$" && text[k + 1] === "(" && text[k + 2] !== "(") {
      const e = readBalanced(text, k + 1);
      if (e < 0) break;
      out.push({ text: text.slice(k + 2, e - 1), kind: "command" });
      k = e;
      continue;
    }
    if (c === "`") {
      const e = skipBacktick(text, k);
      if (e < 0) break;
      out.push({ text: text.slice(k + 1, e - 1).replace(/\\`/g, "`"), kind: "command" });
      k = e;
      continue;
    }
    k++;
  }
  return out;
}

// ---------------------------------------------------------------------------
// segment construction
// ---------------------------------------------------------------------------

interface WordTok {
  value: string;
  quoted: boolean;
  subs: Sub[];
  start: number;
}

export interface SegmentInput {
  words: string[];
  redirects?: Redirect[];
  subs?: Sub[];
  raw?: string;
  heredoc?: string;
  heredocQuoted?: boolean;
}

/** Build a Segment from literal words (strips reserved words and leading assignments). */
export function makeSegment(input: SegmentInput): Segment | null {
  const words = [...input.words];
  const assignments: string[] = [];
  for (;;) {
    const w = words[0];
    if (w === undefined) break;
    if (w === "function") {
      words.shift();
      if (words[0] !== undefined) words.shift();
      if (words[0] === "()") words.shift();
      continue;
    }
    if (w === "time") {
      words.shift();
      if (words[0] === "-p" || words[0] === "--portability") words.shift();
      continue;
    }
    if (RESERVED.has(w)) {
      words.shift();
      continue;
    }
    if (ASSIGNMENT.test(w)) {
      assignments.push(words.shift() as string);
      continue;
    }
    break;
  }
  const redirects = input.redirects ?? [];
  const subs = input.subs ?? [];
  if (words.length === 0 && assignments.length === 0 && redirects.length === 0 && subs.length === 0) return null;
  const rawProgram = words[0] ?? "";
  const seg: Segment = {
    raw: input.raw ?? [...assignments, ...words].join(" "),
    program: rawProgram ? normalizeProgram(rawProgram) : "",
    rawProgram,
    args: words.slice(1),
    words,
    assignments,
    redirects,
    subs,
  };
  if (input.heredoc !== undefined) {
    seg.heredoc = input.heredoc;
    seg.heredocQuoted = input.heredocQuoted ?? false;
  }
  return seg;
}

// ---------------------------------------------------------------------------
// main parser
// ---------------------------------------------------------------------------

interface HeredocSlot {
  delim: string;
  strip: boolean;
  quoted: boolean;
  body: string;
}

export function parseCommand(src: string): ParsedCommand {
  const s = src;
  const n = s.length;
  let i = 0;
  let skeleton = "";

  const pipelines: Pipeline[] = [];
  const allSegments: Segment[] = [];
  let curPipe: Segment[] = [];

  let words: WordTok[] = [];
  let redirects: Redirect[] = [];
  let extraSubs: Sub[] = [];
  let slots: HeredocSlot[] = [];
  let cur: WordTok | null = null;
  let pending: { op: string } | null = null;
  const awaitingBody: HeredocSlot[] = [];
  const segSlots = new Map<Segment, HeredocSlot[]>();

  let failure: string | undefined;

  const blank = (e: number) => {
    skeleton += " ".repeat(Math.max(0, e - i));
    i = e;
  };
  const ensureWord = (): WordTok => {
    if (!cur) cur = { value: "", quoted: false, subs: [], start: i };
    return cur;
  };
  const endWord = () => {
    if (!cur) return;
    const w: WordTok = cur;
    cur = null;
    if (pending) {
      const op = pending.op;
      pending = null;
      redirects.push({ op, target: w.value });
      extraSubs.push(...w.subs);
      if (op === "<<" || op === "<<-") {
        const slot: HeredocSlot = { delim: w.value, strip: op === "<<-", quoted: w.quoted, body: "" };
        slots.push(slot);
        awaitingBody.push(slot);
      }
      return;
    }
    words.push(w);
  };
  const flushSegment = (end: number) => {
    endWord();
    pending = null;
    if (words.length || redirects.length || extraSubs.length) {
      const subs: Sub[] = [...extraSubs];
      for (const w of words) subs.push(...w.subs);
      const values = words.map((w) => w.value);
      // Determine the first kept word to compute raw text.
      let drop = 0;
      while (drop < values.length && RESERVED.has(values[drop] as string)) drop++;
      const startIdx = words[drop]?.start ?? words[0]?.start ?? end;
      const raw = s.slice(startIdx, end).trim();
      const seg = makeSegment({ words: values, redirects, subs, raw: raw || values.join(" ") });
      if (seg) {
        if (slots.length) segSlots.set(seg, slots);
        curPipe.push(seg);
        allSegments.push(seg);
      }
    }
    words = [];
    redirects = [];
    extraSubs = [];
    slots = [];
  };
  const endPipeline = () => {
    if (curPipe.length) {
      pipelines.push({ segments: curPipe, raw: curPipe.map((x) => x.raw).join(" | ") });
    }
    curPipe = [];
  };
  const consumeHeredocs = () => {
    // i is just after the newline ending the command line
    while (awaitingBody.length) {
      const slot = awaitingBody.shift() as HeredocSlot;
      const lines: string[] = [];
      while (i < n) {
        let e = s.indexOf("\n", i);
        const last = e < 0;
        if (last) e = n;
        const line = s.slice(i, e);
        const cmp = (slot.strip ? line.replace(/^\t+/, "") : line).replace(/\r$/, "");
        skeleton += " ".repeat(Math.min(n, last ? e : e + 1) - i);
        i = last ? n : e + 1;
        if (cmp === slot.delim) {
          break;
        }
        lines.push(line.replace(/\r$/, ""));
      }
      slot.body = lines.join("\n");
    }
  };

  let afterPipe = false;

  while (i < n && !failure) {
    const c = s[i] as string;

    // whitespace
    if (c === " " || c === "\t" || c === "\r") {
      endWord();
      skeleton += c;
      i++;
      continue;
    }
    if (c === "\n") {
      if (afterPipe) {
        endWord();
        skeleton += c;
        i++;
        if (awaitingBody.length) consumeHeredocs();
        continue;
      }
      flushSegment(i);
      endPipeline();
      skeleton += c;
      i++;
      if (awaitingBody.length) consumeHeredocs();
      continue;
    }
    // comment
    if (c === "#" && cur === null) {
      const e = s.indexOf("\n", i);
      blank(e < 0 ? n : e);
      continue;
    }

    afterPipe = false;
    // operators
    if (c === ";") {
      flushSegment(i);
      endPipeline();
      skeleton += c;
      i++;
      continue;
    }
    if (c === "(" || c === ")") {
      flushSegment(i);
      endPipeline();
      skeleton += c;
      i++;
      continue;
    }
    if (c === "&") {
      if (s[i + 1] === ">") {
        // &> / &>> redirect
        endWord();
        const op = s[i + 2] === ">" ? "&>>" : "&>";
        pending = { op };
        skeleton += op;
        i += op.length;
        continue;
      }
      flushSegment(i);
      endPipeline();
      const two = s[i + 1] === "&";
      skeleton += two ? "&&" : "&";
      i += two ? 2 : 1;
      continue;
    }
    if (c === "|") {
      flushSegment(i);
      if (s[i + 1] === "|") {
        endPipeline();
        skeleton += "||";
        i += 2;
        afterPipe = false;
        continue;
      }
      const two = s[i + 1] === "&";
      skeleton += two ? "|&" : "|";
      i += two ? 2 : 1;
      afterPipe = true;
      continue;
    }
    if (c === "<" || c === ">") {
      // process substitution
      if (s[i + 1] === "(") {
        const e = readBalanced(s, i + 1);
        if (e < 0) {
          failure = "unterminated process substitution";
          break;
        }
        const w = ensureWord();
        w.value += s.slice(i, e);
        w.subs.push({ text: s.slice(i + 2, e - 1), kind: "process" });
        blank(e);
        continue;
      }
      // fd prefix
      if (cur !== null) {
        const w: WordTok = cur;
        if (!w.quoted && /^\d+$/.test(w.value)) {
          cur = null;
        } else endWord();
      }
      let op: string;
      if (c === ">") {
        if (s[i + 1] === ">") op = ">>";
        else if (s[i + 1] === "|") op = ">|";
        else if (s[i + 1] === "&") op = ">&";
        else op = ">";
      } else if (s.startsWith("<<<", i)) op = "<<<";
      else if (s.startsWith("<<-", i)) op = "<<-";
      else if (s.startsWith("<<", i)) op = "<<";
      else if (s[i + 1] === "&") op = "<&";
      else if (s[i + 1] === ">") op = "<>";
      else op = "<";
      pending = { op };
      skeleton += op;
      i += op.length;
      continue;
    }

    // word characters
    if (c === "\\") {
      const nx = s[i + 1];
      if (nx === undefined) {
        ensureWord().value += "\\";
        skeleton += "\\";
        i++;
        continue;
      }
      if (nx === "\n") {
        skeleton += "  ";
        i += 2;
        continue;
      }
      if (cur === null && /[A-Za-z0-9_.\/-]/.test(nx)) {
        // `\rm`: alias-bypass backslash at word start
        ensureWord().quoted = true;
        skeleton += "\\";
        i++;
        continue;
      }
      if (/[\s'"\\$`;&|<>()*?#~!{}[\]]/.test(nx)) {
        const w = ensureWord();
        w.value += nx;
        w.quoted = true;
        skeleton += "\\" + nx;
        i += 2;
        continue;
      }
      // Windows-style path separator / literal backslash
      ensureWord().value += "\\";
      skeleton += "\\";
      i++;
      continue;
    }
    if (c === "'") {
      const e = skipSingle(s, i);
      if (e < 0) {
        failure = "unterminated single quote";
        break;
      }
      const w = ensureWord();
      w.quoted = true;
      w.value += s.slice(i + 1, e - 1);
      blank(e);
      continue;
    }
    if (c === '"') {
      const e = skipDouble(s, i);
      if (e < 0) {
        failure = "unterminated double quote";
        break;
      }
      const w = ensureWord();
      w.quoted = true;
      const body = s.slice(i + 1, e - 1);
      w.subs.push(...findSubstitutions(body));
      w.value += body.replace(/\\([\\"$`])/g, "$1");
      blank(e);
      continue;
    }
    if (c === "`") {
      const e = skipBacktick(s, i);
      if (e < 0) {
        failure = "unterminated backtick";
        break;
      }
      const w = ensureWord();
      w.value += s.slice(i, e);
      w.subs.push({ text: s.slice(i + 1, e - 1).replace(/\\`/g, "`"), kind: "command" });
      blank(e);
      continue;
    }
    if (c === "$") {
      const nx = s[i + 1];
      if (nx === "(") {
        const e = readBalanced(s, i + 1);
        if (e < 0) {
          failure = "unterminated command substitution";
          break;
        }
        const w = ensureWord();
        w.value += s.slice(i, e);
        if (s[i + 2] !== "(") w.subs.push({ text: s.slice(i + 2, e - 1), kind: "command" });
        blank(e);
        continue;
      }
      if (nx === "{") {
        const e = readBraces(s, i + 1);
        if (e < 0) {
          failure = "unterminated parameter expansion";
          break;
        }
        ensureWord().value += s.slice(i, e);
        skeleton += s.slice(i, e);
        i = e;
        continue;
      }
      if (nx === "'") {
        const e = skipSingleAnsi(s, i + 1);
        if (e < 0) {
          failure = "unterminated $'' string";
          break;
        }
        const w = ensureWord();
        w.quoted = true;
        w.value += decodeAnsiC(s.slice(i + 2, e - 1));
        blank(e);
        continue;
      }
      if (nx === '"') {
        const e = skipDouble(s, i + 1);
        if (e < 0) {
          failure = "unterminated $\"\" string";
          break;
        }
        const w = ensureWord();
        w.quoted = true;
        const body = s.slice(i + 2, e - 1);
        w.subs.push(...findSubstitutions(body));
        w.value += body.replace(/\\([\\"$`])/g, "$1");
        blank(e);
        continue;
      }
    }
    ensureWord().value += c;
    skeleton += c;
    i++;
  }

  if (failure) {
    return { ok: false, error: failure, src, pipelines: [], segments: [], skeleton };
  }
  flushSegment(n);
  endPipeline();

  // finalise heredoc bodies
  for (const [seg, sl] of segSlots) {
    seg.heredoc = sl.map((x) => x.body).join("\n");
    seg.heredocQuoted = sl.every((x) => x.quoted);
    if (!seg.heredocQuoted) {
      for (const x of sl) if (!x.quoted) seg.subs.push(...findSubstitutions(x.body));
    }
  }
  return { ok: true, src, pipelines, segments: allSegments, skeleton };
}

/** `$'...'` scan: backslash escapes the next char including a quote. */
function skipSingleAnsi(s: string, i: number): number {
  let k = i + 1;
  while (k < s.length) {
    const c = s[k];
    if (c === "\\") {
      k += 2;
      continue;
    }
    if (c === "'") return k + 1;
    k++;
  }
  return -1;
}
