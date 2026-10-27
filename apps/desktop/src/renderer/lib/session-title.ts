/** Display-title helpers for sessions (sidebar rows and tab headers). */

/** Studio prefixes prompts with a mode hint like `[Mode: Plan - ...]`; never show that as a title. */
const MODE_PREFIX = /^\s*\[Mode:[^\]]*\]\s*/;
const ATTACHED_FILE = "--- Attached File:";

export const NEW_SESSION_TITLE = "New Session";

/** Turn a raw prompt / first message into a short single-line title. Returns "" if nothing usable. */
export function titleFromPrompt(text: string | undefined | null, max = 60): string {
  if (!text) return "";
  let t = text.replace(MODE_PREFIX, "");
  t = t.replace(/^\s*\/[a-zA-Z0-9_-]+\s*/, "");
  const fileIdx = t.indexOf(ATTACHED_FILE);
  if (fileIdx >= 0) t = t.slice(0, fileIdx);
  t = t.replace(/\s+/g, " ").trim();
  if (t.length > max) t = `${t.slice(0, max - 1).trimEnd()}…`;
  return t;
}

const CHEAP_MODEL = /haiku|flash|mini|nano|lite|small/i;

/** Model id (`provider/id`) for title generation: a cheap sibling from the session's provider, else the session model. */
export function pickTitleModel(
  catalog: Array<{ id: string; provider?: string }>,
  active: { id: string; provider?: string } | null | undefined,
): string | undefined {
  const full = (m: { id: string; provider?: string }) => (m.provider && !m.id.includes("/") ? `${m.provider}/${m.id}` : m.id);
  const cheap = catalog.find((m) => (!active?.provider || m.provider === active.provider) && CHEAP_MODEL.test(m.id));
  if (cheap) return full(cheap);
  return active ? full(active) : undefined;
}

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}[T_]\d{2}[-_]\d{2}/;

/** Returns true if a string looks like a raw ISO session timestamp (`2026-10-27T17-24-22...`). */
export function isTimestampLike(s: string | undefined | null): boolean {
  return !s ? false : ISO_TIMESTAMP.test(s.trim());
}

/** Preferred title for a catalog session: user rename → LLM title → Pi session name (if not raw date) → first prompt. */
export function sessionDisplayTitle(
  s: { title?: string; aiTitle?: string; name?: string; firstMessage?: string },
  max = 80,
): string {
  const custom = s.title?.trim();
  if (custom && !isTimestampLike(custom)) return custom;
  const ai = s.aiTitle?.trim();
  if (ai) return ai;
  const name = s.name?.trim();
  if (name && !isTimestampLike(name)) return name;
  return titleFromPrompt(s.firstMessage, max) || (!isTimestampLike(custom) ? custom : "") || (!isTimestampLike(name) ? name : "") || "Session";
}
