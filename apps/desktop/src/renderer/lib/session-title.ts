/** Display-title helpers for sessions (sidebar rows and tab headers). */

/** Studio prefixes prompts with a mode hint like `[Mode: Plan - ...]`; never show that as a title. */
const MODE_PREFIX = /^\s*\[Mode:[^\]]*\]\s*/;
const ATTACHED_FILE = "--- Attached File:";

export const NEW_SESSION_TITLE = "New Session";

/** Turn a raw prompt / first message into a short single-line title. Returns "" if nothing usable. */
export function titleFromPrompt(text: string | undefined | null, max = 60): string {
  if (!text) return "";
  let t = text.replace(MODE_PREFIX, "");
  const fileIdx = t.indexOf(ATTACHED_FILE);
  if (fileIdx >= 0) t = t.slice(0, fileIdx);
  t = t.replace(/\s+/g, " ").trim();
  if (t.length > max) t = `${t.slice(0, max - 1).trimEnd()}…`;
  return t;
}

/** Preferred title for a catalog session: user rename → Pi session name → first prompt. */
export function sessionDisplayTitle(
  s: { title?: string; name?: string; firstMessage?: string },
  max = 80,
): string {
  return s.title?.trim() || s.name?.trim() || titleFromPrompt(s.firstMessage, max) || "";
}
