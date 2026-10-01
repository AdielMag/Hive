import { useEffect, useState } from "react";
import { highlight, peekHighlighted, type HlLine } from "../../lib/highlight/highlighter.ts";

/**
 * Highlight `code` asynchronously. While streaming (code changes every few ms) the work is debounced so
 * we tokenize at most ~8x/second and keep showing the previous colored result in between.
 */
export function useHighlight(code: string, lang: string | null, debounceMs = 0): HlLine[] | null {
  const [lines, setLines] = useState<HlLine[] | null>(() => peekHighlighted(code, lang));

  useEffect(() => {
    let cancelled = false;
    const cached = peekHighlighted(code, lang);
    if (cached) {
      setLines(cached);
      return;
    }
    if (!lang) {
      setLines(null);
      return;
    }
    const run = () => {
      void highlight(code, lang).then((res) => {
        if (!cancelled) setLines(res);
      });
    };
    if (debounceMs > 0) {
      const t = setTimeout(run, debounceMs);
      return () => {
        cancelled = true;
        clearTimeout(t);
      };
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [code, lang, debounceMs]);

  return lines;
}
