/**
 * Pure keyboard-chord helpers (no DOM/React): canonical string form, event → chord, display formatting and
 * validation. A chord is stored as a canonical, platform-neutral string such as "Mod+Shift+E" where
 * `Mod` means Ctrl *or* Cmd (matching the app's historical behaviour of accepting either).
 */

export interface Chord {
  mod: boolean;
  alt: boolean;
  shift: boolean;
  /** Canonical key: upper-case letter/digit, named key ("Tab", "ArrowUp", "F5"), or a punctuation char. */
  key: string;
}

/** Minimal slice of KeyboardEvent we need (keeps this module testable in node). */
export interface KeyEventLike {
  key: string;
  code?: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

const MODIFIER_KEYS = new Set(["Control", "Meta", "Alt", "Shift", "AltGraph", "OS", "CapsLock"]);

export const NAMED_KEYS = new Set([
  "Tab", "Enter", "Escape", "Space", "Backspace", "Delete", "Insert", "Home", "End", "PageUp", "PageDown",
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
]);

/** Physical-key → base character, used when `event.key` is layout/modifier-mangled (Shift+=, Option+G…). */
const CODE_PUNCT: Record<string, string> = {
  Backquote: "`", Minus: "-", Equal: "=", BracketLeft: "[", BracketRight: "]", Backslash: "\\",
  Semicolon: ";", Quote: "'", Comma: ",", Period: ".", Slash: "/", NumpadAdd: "=", NumpadSubtract: "-",
};

const KEY_ALIASES: Record<string, string> = {
  esc: "Escape", escape: "Escape", return: "Enter", enter: "Enter", space: "Space", spacebar: "Space",
  del: "Delete", delete: "Delete", plus: "+", tab: "Tab", backspace: "Backspace", insert: "Insert",
  home: "Home", end: "End", pageup: "PageUp", pagedown: "PageDown",
  up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight",
  arrowup: "ArrowUp", arrowdown: "ArrowDown", arrowleft: "ArrowLeft", arrowright: "ArrowRight",
};

const MOD_ALIASES = new Set(["mod", "ctrl", "control", "cmd", "command", "meta", "super"]);

function normalizeKeyName(raw: string): string | null {
  if (raw === " ") return "Space";
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (KEY_ALIASES[lower]) return KEY_ALIASES[lower]!;
  if (/^f([1-9]|1[0-9]|2[0-4])$/.test(lower)) return lower.toUpperCase();
  if ([...raw].length === 1) return raw.toUpperCase();
  return null;
}

export function parseChord(input: string): Chord | null {
  if (typeof input !== "string" || !input.trim()) return null;
  // A trailing "+" is the Plus key, e.g. "Mod++" or "Mod+Plus".
  const parts = input.endsWith("++") ? [...input.slice(0, -2).split("+"), "+"] : input.split("+");
  let mod = false, alt = false, shift = false;
  let key: string | null = null;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]!.trim();
    const lower = p.toLowerCase();
    const isLast = i === parts.length - 1;
    if (!isLast) {
      if (MOD_ALIASES.has(lower)) mod = true;
      else if (lower === "alt" || lower === "option") alt = true;
      else if (lower === "shift") shift = true;
      else return null;
    } else {
      key = normalizeKeyName(p);
    }
  }
  if (!key || MODIFIER_KEYS.has(key)) return null;
  return { mod, alt, shift, key };
}

export function stringifyChord(c: Chord): string {
  const k = c.key === "+" ? "Plus" : c.key;
  return [c.mod ? "Mod" : "", c.alt ? "Alt" : "", c.shift ? "Shift" : "", k].filter(Boolean).join("+");
}

/** Canonical form of a chord string, or null if it is not parseable. */
export function normalizeChord(input: string): string | null {
  const c = parseChord(input);
  return c ? stringifyChord(c) : null;
}

/** Canonical chord for a keyboard event; null for a bare modifier press. */
export function chordFromEvent(e: KeyEventLike): string | null {
  if (MODIFIER_KEYS.has(e.key)) return null;
  let key: string | null;
  const code = e.code ?? "";
  const isLetterKey = /^Key[A-Z]$/.test(code);
  const isDigitKey = /^Digit[0-9]$/.test(code);
  const isSingleChar = [...e.key].length === 1;
  const nonAscii = isSingleChar && e.key.charCodeAt(0) > 127;
  if (CODE_PUNCT[code] && (e.shiftKey || e.altKey || code.startsWith("Numpad"))) key = CODE_PUNCT[code]!;
  else if ((isLetterKey || isDigitKey) && (e.altKey || nonAscii || (e.shiftKey && isDigitKey))) key = code.slice(-1);
  else key = normalizeKeyName(e.key);
  if (!key) return null;
  return stringifyChord({ mod: e.ctrlKey || e.metaKey, alt: e.altKey, shift: e.shiftKey, key });
}

export type Platform = string | null | undefined;

const KEY_DISPLAY: Record<string, string> = {
  Escape: "Esc", ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→", Space: "Space",
};

/** Human-readable chord: "Ctrl+Shift+E" (Win/Linux) or "⌘⇧E" (macOS). */
export function formatChord(chord: string, platform: Platform): string {
  const c = parseChord(chord);
  if (!c) return chord;
  const key = KEY_DISPLAY[c.key] ?? c.key;
  if (platform === "darwin") return `${c.alt ? "⌥" : ""}${c.shift ? "⇧" : ""}${c.mod ? "⌘" : ""}${key}`;
  return [c.mod ? "Ctrl" : "", c.alt ? "Alt" : "", c.shift ? "Shift" : "", key].filter(Boolean).join("+");
}

export function isFunctionKey(key: string): boolean {
  return /^F\d{1,2}$/.test(key);
}

const RESERVED = new Set([
  "Mod+C", "Mod+V", "Mod+X", "Mod+Z", "Mod+Y", "Mod+A", "Mod+Shift+Z", "Mod+Shift+V",
  "Escape", "Enter", "Tab", "Backspace", "Delete", "Space",
]);

/**
 * Why a chord can't be used as a global app shortcut, or null if it is fine. Global bindings need a
 * modifier (Mod/Alt) or be an F-key, so nobody can bind plain typing keys; common editing chords are reserved.
 */
export function validateGlobalChord(chord: string): string | null {
  const c = parseChord(chord);
  if (!c) return "Not a valid key combination";
  const canon = stringifyChord(c);
  if (RESERVED.has(canon)) return `${formatChord(canon, null)} is reserved for editing`;
  if (!c.mod && !c.alt && !c.shift && !isFunctionKey(c.key)) return "Include Ctrl/Cmd, Alt, or Shift (or use an F-key)";
  return null;
}

export function chordHasShiftOrAlt(chord: string): boolean {
  const c = parseChord(chord);
  return !!c && (c.shift || c.alt);
}
