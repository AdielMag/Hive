/**
 * Minimal ANSI SGR parser for extension status/widget text. Extensions may style text with their
 * theme (escape sequences) even in RPC mode; we convert them to styled segments instead of
 * printing raw escapes. Non-SGR escape sequences (cursor movement, OSC links) are dropped.
 */
export interface AnsiStyle {
  color?: string;
  background?: string;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
}

export interface AnsiSegment {
  text: string;
  style: AnsiStyle;
}

const BASIC = ["#1e1e1e", "#e5534b", "#57ab5a", "#c69026", "#539bf5", "#b083f0", "#39c5cf", "#d1d5da"];
const BRIGHT = ["#636e7b", "#ff938a", "#6bc46d", "#daaa3f", "#6cb6ff", "#dcbdfb", "#56d4dd", "#ffffff"];

function color256(n: number): string {
  if (n < 8) return BASIC[n] ?? "#fff";
  if (n < 16) return BRIGHT[n - 8] ?? "#fff";
  if (n < 232) {
    const i = n - 16;
    const v = [0, 95, 135, 175, 215, 255];
    return `rgb(${v[Math.floor(i / 36) % 6]}, ${v[Math.floor(i / 6) % 6]}, ${v[i % 6]})`;
  }
  const g = 8 + (n - 232) * 10;
  return `rgb(${g}, ${g}, ${g})`;
}

// ESC [ params m  (SGR) | other CSI sequences | OSC ... BEL/ST
// eslint-disable-next-line no-control-regex
const ESCAPES = /\u001b\[([0-9;]*)([A-Za-z])|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g;

export function parseAnsi(input: string): AnsiSegment[] {
  const segments: AnsiSegment[] = [];
  let style: AnsiStyle = {};
  let last = 0;
  const push = (text: string) => {
    if (text) segments.push({ text, style: { ...style } });
  };
  for (const match of input.matchAll(ESCAPES)) {
    push(input.slice(last, match.index));
    last = (match.index ?? 0) + match[0].length;
    if (match[2] !== "m") continue; // not SGR
    const codes = (match[1] ?? "").split(";").filter((c) => c !== "").map(Number);
    if (codes.length === 0) codes.push(0);
    for (let i = 0; i < codes.length; i++) {
      const c = codes[i] ?? 0;
      if (c === 0) style = {};
      else if (c === 1) style.bold = true;
      else if (c === 2) style.dim = true;
      else if (c === 3) style.italic = true;
      else if (c === 4) style.underline = true;
      else if (c === 22) {
        delete style.bold;
        delete style.dim;
      } else if (c === 23) delete style.italic;
      else if (c === 24) delete style.underline;
      else if (c >= 30 && c <= 37) style.color = BASIC[c - 30];
      else if (c >= 90 && c <= 97) style.color = BRIGHT[c - 90];
      else if (c === 39) delete style.color;
      else if (c >= 40 && c <= 47) style.background = BASIC[c - 40];
      else if (c >= 100 && c <= 107) style.background = BRIGHT[c - 100];
      else if (c === 49) delete style.background;
      else if (c === 38 || c === 48) {
        const target = c === 38 ? "color" : "background";
        if (codes[i + 1] === 5) {
          style[target] = color256(codes[i + 2] ?? 0);
          i += 2;
        } else if (codes[i + 1] === 2) {
          style[target] = `rgb(${codes[i + 2] ?? 0}, ${codes[i + 3] ?? 0}, ${codes[i + 4] ?? 0})`;
          i += 4;
        }
      }
    }
  }
  push(input.slice(last));
  return segments;
}

export function stripAnsi(input: string): string {
  return parseAnsi(input)
    .map((s) => s.text)
    .join("");
}
