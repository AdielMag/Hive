/**
 * IDE-style code block: language badge, optional file name, one-click exact copy, Rider colours,
 * collapsible when long, line numbers for multi-line snippets.
 */
import React, { memo, useState } from "react";
import { Check, ChevronDown, ChevronUp, Copy, WrapText } from "lucide-react";
import { languageLabel, resolveLanguage } from "../../lib/highlight/languages.ts";
import { copyText } from "../../lib/clipboard.ts";
import { useAppearance } from "../../features/appearance/appearance-store.ts";
import { useHighlight } from "./useHighlight.ts";
import { HighlightedLines } from "./HighlightedLines.tsx";

interface Props {
  code: string;
  language?: string | null;
  fileName?: string;
  /** Debounce tokenization while the code is still streaming in. */
  streaming?: boolean;
  /** Collapse after this many lines (0 = never). */
  collapseAfter?: number;
  /** Hide header (used inside tool output where the parent has its own header). */
  bare?: boolean;
  lineNumbers?: boolean;
  startLine?: number;
}

export const CodeBlock: React.FC<Props> = memo(
  ({ code, language, fileName, streaming, collapseAfter = 28, bare, lineNumbers, startLine }) => {
    const lang = resolveLanguage(language ?? undefined);
    const wrapPref = useAppearance((s) => s.editor.wrapCode);
    const [wrap, setWrap] = useState<boolean | null>(null);
    const [expanded, setExpanded] = useState(false);
    const [copied, setCopied] = useState(false);
    const text = code.replace(/\n$/, "");
    const tokens = useHighlight(text, lang, streaming ? 120 : 0);
    const lineCount = text.split("\n").length;
    const collapsible = collapseAfter > 0 && lineCount > collapseAfter + 4;
    const collapsed = collapsible && !expanded;
    const effectiveWrap = wrap ?? wrapPref;

    const onCopy = async () => {
      if (await copyText(text)) {
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      }
    };

    return (
      <div className={`codeblock${bare ? " codeblock--bare" : ""}`}>
        {!bare && (
          <div className="codeblock__head">
            <span className="codeblock__lang">{languageLabel(lang, language ?? undefined)}</span>
            {fileName && <span className="codeblock__file" title={fileName}>{fileName}</span>}
            <span className="codeblock__spacer" />
            <span className="codeblock__meta">{lineCount} {lineCount === 1 ? "line" : "lines"}</span>
            <button className="codeblock__btn" onClick={() => setWrap(!effectiveWrap)} title={effectiveWrap ? "Disable soft wrap" : "Soft wrap"} aria-pressed={effectiveWrap}>
              <WrapText size={13} />
            </button>
            <button className={`codeblock__btn${copied ? " is-done" : ""}`} onClick={onCopy} title="Copy code">
              {copied ? <Check size={13} /> : <Copy size={13} />}
              <span>{copied ? "Copied" : "Copy"}</span>
            </button>
          </div>
        )}
        <div className={`codeblock__body selectable${collapsed ? " is-collapsed" : ""}`} style={collapsed ? { maxHeight: `${collapseAfter * 1.55}em` } : undefined}>
          {bare && (
            <button className={`codeblock__float-copy${copied ? " is-done" : ""}`} onClick={onCopy} title="Copy">
              {copied ? <Check size={12} /> : <Copy size={12} />}
            </button>
          )}
          <HighlightedLines code={text} tokens={tokens} lineNumbers={lineNumbers ?? lineCount > 3} startLine={startLine} wrap={effectiveWrap} />
        </div>
        {collapsible && (
          <button className="codeblock__expand" onClick={() => setExpanded(!expanded)}>
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {expanded ? "Collapse" : `Show all ${lineCount} lines`}
          </button>
        )}
      </div>
    );
  },
);
CodeBlock.displayName = "CodeBlock";
