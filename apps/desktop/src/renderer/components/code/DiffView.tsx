/**
 * Unified diff renderer: each line keeps Rider syntax colours for the file's language, on top of
 * add/remove backgrounds, with separate old/new line-number gutters (IDE style).
 */
import React, { useMemo } from "react";
import { useHighlight } from "./useHighlight.ts";

type Kind = "add" | "del" | "ctx" | "hunk" | "meta";
interface Row {
  kind: Kind;
  text: string;
  oldNo?: number;
  newNo?: number;
}

export function parseUnifiedDiff(diff: string): Row[] {
  const rows: Row[] = [];
  let oldNo = 0;
  let newNo = 0;
  for (const line of diff.replace(/\n$/, "").split("\n")) {
    if (line.startsWith("@@")) {
      const m = /@@ -(\d+)(?:,\d+)? \+(\d+)/.exec(line);
      if (m) {
        oldNo = Number(m[1]);
        newNo = Number(m[2]);
      }
      rows.push({ kind: "hunk", text: line });
    } else if (/^(diff --git|index |--- |\+\+\+ |new file|deleted file|similarity|rename |old mode|new mode|\\ No newline)/.test(line)) {
      rows.push({ kind: "meta", text: line });
    } else if (line.startsWith("+")) {
      rows.push({ kind: "add", text: line.slice(1), newNo: newNo++ });
    } else if (line.startsWith("-")) {
      rows.push({ kind: "del", text: line.slice(1), oldNo: oldNo++ });
    } else {
      rows.push({ kind: "ctx", text: line.startsWith(" ") ? line.slice(1) : line, oldNo: oldNo++, newNo: newNo++ });
    }
  }
  return rows;
}

export const DiffView: React.FC<{ diff: string; lang: string | null }> = ({ diff, lang }) => {
  const rows = useMemo(() => parseUnifiedDiff(diff), [diff]);
  const codeRows = useMemo(() => rows.filter((r) => r.kind === "add" || r.kind === "del" || r.kind === "ctx"), [rows]);
  const code = useMemo(() => codeRows.map((r) => r.text).join("\n"), [codeRows]);
  const tokens = useHighlight(code, lang);

  let ci = 0;
  return (
    <pre className="hl diff selectable">
      <code>
        {rows.map((r, i) => {
          if (r.kind === "hunk" || r.kind === "meta") {
            return (
              <div key={i} className={`hl-line diff__${r.kind}`}>
                <span className="diff__gutter" />
                <span className="diff__gutter" />
                <span className="hl-code">{r.text}{"\n"}</span>
              </div>
            );
          }
          const lineTokens = tokens?.[ci++];
          return (
            <div key={i} className={`hl-line diff__${r.kind}`}>
              <span className="diff__gutter">{r.oldNo ?? ""}</span>
              <span className="diff__gutter">{r.newNo ?? ""}</span>
              <span className="diff__sign">{r.kind === "add" ? "+" : r.kind === "del" ? "−" : " "}</span>
              <span className="hl-code">
                {lineTokens
                  ? lineTokens.map((t, j) => (
                      <span key={j} className={t.fontStyle ? `hl-fs${t.fontStyle}` : undefined} style={t.dark ? ({ "--d": t.dark, "--l": t.light } as React.CSSProperties) : undefined}>
                        {t.content}
                      </span>
                    ))
                  : r.text}
                {"\n"}
              </span>
            </div>
          );
        })}
      </code>
    </pre>
  );
};
