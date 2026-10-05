import React, { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, CaseSensitive, X } from "lucide-react";
import { focusTerminal, getTerminal } from "./terminal-registry.ts";

interface Props {
  terminalId: string;
  onClose: () => void;
}

/** Find-in-scrollback bar for the active terminal (Ctrl+Shift+F / Cmd+F). */
export const TerminalSearch: React.FC<Props> = ({ terminalId, onClose }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [result, setResult] = useState<{ index: number; count: number } | null>(null);

  useEffect(() => {
    const selection = getTerminal(terminalId)?.term.getSelection();
    if (selection && !selection.includes("\n")) setQuery(selection);
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [terminalId]);

  useEffect(() => {
    const t = getTerminal(terminalId);
    if (!t) return;
    const sub = t.search.onDidChangeResults((e) => setResult({ index: e.resultIndex, count: e.resultCount }));
    return () => {
      sub.dispose();
      t.search.clearDecorations();
    };
  }, [terminalId]);

  const run = useCallback(
    (dir: "next" | "prev", incremental = false) => {
      const t = getTerminal(terminalId);
      if (!t) return;
      if (!query) {
        t.search.clearDecorations();
        setResult(null);
        return;
      }
      const opts = { caseSensitive, incremental: incremental && dir === "next", decorations: t.decorations };
      const found = dir === "next" ? t.search.findNext(query, opts) : t.search.findPrevious(query, opts);
      if (!found) setResult({ index: -1, count: 0 });
    },
    [terminalId, query, caseSensitive],
  );

  useEffect(() => {
    run("next", true);
  }, [query, caseSensitive]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => {
    onClose();
    focusTerminal(terminalId);
  };

  const label = !query ? "" : result && result.count === 0 ? "No results" : result && result.index >= 0 ? `${result.index + 1}/${result.count}` : result ? `${result.count}+` : "";

  return (
    <div className="hive-term-find" role="search" onClick={(e) => e.stopPropagation()} onContextMenu={(e) => e.stopPropagation()}>
      <input
        ref={inputRef}
        className="hive-term-find__input"
        value={query}
        placeholder="Find"
        spellCheck={false}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            run(e.shiftKey ? "prev" : "next");
          } else if (e.key === "Escape") {
            e.preventDefault();
            close();
          }
          e.stopPropagation();
        }}
      />
      <span className="hive-term-find__count" aria-live="polite">
        {label}
      </span>
      <button
        type="button"
        className={`hive-term-btn${caseSensitive ? " is-on" : ""}`}
        title="Match case"
        aria-pressed={caseSensitive}
        onClick={() => setCaseSensitive((v) => !v)}
      >
        <CaseSensitive size={14} />
      </button>
      <button type="button" className="hive-term-btn" title="Previous match (Shift+Enter)" onClick={() => run("prev")}>
        <ArrowUp size={14} />
      </button>
      <button type="button" className="hive-term-btn" title="Next match (Enter)" onClick={() => run("next")}>
        <ArrowDown size={14} />
      </button>
      <button type="button" className="hive-term-btn" title="Close (Esc)" onClick={close}>
        <X size={14} />
      </button>
    </div>
  );
};
