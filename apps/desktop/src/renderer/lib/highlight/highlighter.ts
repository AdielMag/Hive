/**
 * Shared shiki highlighter (JS regex engine: no WASM, CSP-friendly). Grammars load on demand and results
 * are memoized in a small LRU, so re-rendering a transcript never re-tokenizes unchanged code.
 *
 * Tokens carry both Rider Dark and Rider Light colours as CSS variables (--shiki-dark / --shiki-light);
 * the active theme is chosen in CSS, so switching appearance never requires re-highlighting.
 */
import { createHighlighterCore, type HighlighterCore, type ThemedToken } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import { LANGUAGE_LOADERS } from "./languages.ts";
import { riderDark, riderLight } from "./rider-theme.ts";

export interface HlToken {
  content: string;
  dark?: string;
  light?: string;
  /** bitmask: 1 italic, 2 bold, 4 underline */
  fontStyle?: number;
}
export type HlLine = HlToken[];

/** Beyond this, highlighting cost outweighs value; render plain text instead. */
export const MAX_HIGHLIGHT_CHARS = 400_000;

let highlighterPromise: Promise<HighlighterCore> | null = null;
const loading = new Map<string, Promise<void>>();
const cache = new Map<string, HlLine[]>();
const CACHE_LIMIT = 300;

function getHighlighter(): Promise<HighlighterCore> {
  highlighterPromise ??= createHighlighterCore({
    themes: [riderDark, riderLight],
    langs: [],
    engine: createJavaScriptRegexEngine({ forgiving: true }),
  });
  return highlighterPromise;
}

async function ensureLanguage(hl: HighlighterCore, lang: string): Promise<boolean> {
  if (hl.getLoadedLanguages().includes(lang)) return true;
  const loader = LANGUAGE_LOADERS[lang];
  if (!loader) return false;
  let p = loading.get(lang);
  if (!p) {
    p = loader().then((mod) => hl.loadLanguage(...mod.default));
    loading.set(lang, p);
  }
  try {
    await p;
    return true;
  } catch {
    loading.delete(lang);
    return false;
  }
}

function hash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36) + ":" + s.length;
}

/** Synchronous cache probe so already-highlighted code renders colored on the very first paint. */
export function peekHighlighted(code: string, lang: string | null): HlLine[] | null {
  if (!lang) return null;
  return cache.get(`${lang}|${hash(code)}`) ?? null;
}

export async function highlight(code: string, lang: string | null): Promise<HlLine[] | null> {
  if (!lang || code.length > MAX_HIGHLIGHT_CHARS) return null;
  const key = `${lang}|${hash(code)}`;
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const hl = await getHighlighter();
  if (!(await ensureLanguage(hl, lang))) return null;
  const result = hl.codeToTokens(code, {
    lang,
    themes: { dark: "rider-dark", light: "rider-light" },
    defaultColor: false,
  });
  const lines: HlLine[] = result.tokens.map((line: ThemedToken[]) =>
    line.map((t) => {
      const style = (t.htmlStyle ?? {}) as Record<string, string>;
      const italic = style["--shiki-dark-font-style"] === "italic" ? 1 : 0;
      const bold = style["--shiki-dark-font-weight"] === "bold" ? 2 : 0;
      return { content: t.content, dark: style["--shiki-dark"], light: style["--shiki-light"], fontStyle: italic | bold || undefined };
    }),
  );
  cache.set(key, lines);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  return lines;
}
