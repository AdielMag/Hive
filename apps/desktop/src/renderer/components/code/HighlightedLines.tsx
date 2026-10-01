/**
 * Renders code lines with Rider colours. Falls back to plain text (same layout) until tokens arrive, so
 * there is no layout shift when highlighting completes. Long files render in chunks with
 * `content-visibility: auto`, letting the browser skip layout/paint for off-screen chunks.
 */
import React, { memo } from "react";
import type { HlLine } from "../../lib/highlight/highlighter.ts";

const CHUNK = 200;

interface Props {
  code: string;
  tokens: HlLine[] | null;
  lineNumbers?: boolean;
  startLine?: number;
  wrap?: boolean;
  /** Optional per-line class (diff add/remove, highlight). */
  lineClass?: (index: number) => string | undefined;
}

export const HighlightedLines: React.FC<Props> = memo(({ code, tokens, lineNumbers, startLine = 1, wrap, lineClass }) => {
  const plain = tokens ? null : code.split("\n");
  const count = tokens ? tokens.length : plain!.length;
  const gutterCh = String(startLine + count - 1).length;

  const renderLine = (i: number) => {
    const extra = lineClass?.(i);
    return (
      <div key={i} className={extra ? `hl-line ${extra}` : "hl-line"}>
        {lineNumbers && (
          <span className="hl-ln" aria-hidden="true">
            {startLine + i}
          </span>
        )}
        <span className="hl-code">
          {tokens
            ? tokens[i]!.map((t, j) => (
                <span
                  key={j}
                  className={t.fontStyle ? `hl-fs${t.fontStyle}` : undefined}
                  style={t.dark ? ({ "--d": t.dark, "--l": t.light } as React.CSSProperties) : undefined}
                >
                  {t.content}
                </span>
              ))
            : plain![i]}
          {"\n"}
        </span>
      </div>
    );
  };

  const chunks: React.ReactNode[] = [];
  for (let start = 0; start < count; start += CHUNK) {
    const end = Math.min(count, start + CHUNK);
    const rows: React.ReactNode[] = [];
    for (let i = start; i < end; i++) rows.push(renderLine(i));
    chunks.push(
      count > CHUNK ? (
        <div key={start} className="hl-chunk" style={{ containIntrinsicSize: `auto ${(end - start) * 1.55}em` }}>
          {rows}
        </div>
      ) : (
        rows
      ),
    );
  }

  return (
    <pre
      className={`hl${wrap ? " hl--wrap" : ""}${lineNumbers ? " hl--numbered" : ""}`}
      style={{ ["--gutter-ch" as string]: gutterCh }}
    >
      <code>{chunks}</code>
    </pre>
  );
});
HighlightedLines.displayName = "HighlightedLines";
