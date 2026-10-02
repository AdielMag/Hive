/** Read-only file viewer: Rider-highlighted source with line numbers, rendered Markdown / JSON / HTML / SVG. */
import React, { useMemo, useState } from "react";
import { Check, Code2, Copy, Eye, FileCode, FileJson, FileText, Sparkles, X } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import type { TabItem } from "@hive/protocol";
import { useSessionStore } from "../store/session-store.ts";
import { Markdown } from "./code/Markdown.tsx";
import { HighlightedLines } from "./code/HighlightedLines.tsx";
import { useHighlight } from "./code/useHighlight.ts";
import { languageFromPath, languageLabel, resolveLanguage } from "../lib/highlight/languages.ts";
import { copyText } from "../lib/clipboard.ts";
import { useAppearance } from "../features/appearance/appearance-store.ts";

export const FileViewerTab: React.FC<{ tab: TabItem }> = ({ tab }) => {
  const { setPromptText, closeTab, newSessionTab, activeProject } = useSessionStore(
    useShallow((s) => ({ setPromptText: s.setPromptText, closeTab: s.closeTab, newSessionTab: s.newSessionTab, activeProject: s.activeProject })),
  );
  const [copied, setCopied] = useState(false);
  const fileName = tab.title || tab.filePath?.split(/[/\\]/).pop() || "File";
  const content = tab.fileContent || "";
  const lang = languageFromPath(tab.filePath ?? fileName) ?? resolveLanguage(tab.fileLanguage);

  const isMarkdown = lang === "markdown";
  const isHtml = lang === "html";
  const isSvg = /\.svg$/i.test(fileName);
  const isJson = lang === "json" || lang === "jsonc";
  const canRender = isMarkdown || isHtml || isSvg || isJson;
  const [mode, setMode] = useState<"rendered" | "source">(isMarkdown || isSvg ? "rendered" : "source");

  const lineCount = useMemo(() => content.split("\n").length, [content]);
  const sizeKb = (new Blob([content]).size / 1024).toFixed(1);

  const onCopy = async () => {
    if (await copyText(content)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    }
  };

  const askPi = async () => {
    if (!activeProject) return;
    const rel = tab.filePath?.replace(activeProject.path, "").replace(/^[/\\]/, "") || fileName;
    await newSessionTab(activeProject.id);
    setPromptText(`Explain ${rel} — what it does and anything notable:\n`);
  };

  return (
    <div className="viewer">
      <div className="viewer__bar">
        <span className="viewer__icon">{isJson ? <FileJson size={16} /> : isMarkdown ? <FileText size={16} /> : <FileCode size={16} />}</span>
        <div className="viewer__names">
          <span className="viewer__name" title={tab.filePath}>
            {fileName}
          </span>
          <span className="viewer__path selectable" title={tab.filePath}>
            {tab.filePath}
          </span>
        </div>
        <span className="ui-chip">{languageLabel(lang, tab.fileLanguage)}</span>
        <span className="viewer__meta">
          {lineCount.toLocaleString()} lines · {sizeKb} KB
        </span>
        <span style={{ flex: 1 }} />
        {canRender && (
          <div className="ui-seg">
            <button aria-pressed={mode === "rendered"} onClick={() => setMode("rendered")}>
              <Eye size={12} /> {isMarkdown ? "Preview" : isJson ? "Formatted" : "Preview"}
            </button>
            <button aria-pressed={mode === "source"} onClick={() => setMode("source")}>
              <Code2 size={12} /> Source
            </button>
          </div>
        )}
        <button className="ui-btn ui-btn--sm" onClick={onCopy} title="Copy file contents">
          {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "Copied" : "Copy"}
        </button>
        <button className="ui-btn ui-btn--sm" onClick={() => void askPi()} title="Start a session asking Pi about this file" disabled={!activeProject}>
          <Sparkles size={12} /> Ask Pi
        </button>
        <button className="ui-btn ui-btn--sm ui-btn--ghost ui-btn--icon" onClick={() => void closeTab(tab.id)} title="Close">
          <X size={14} />
        </button>
      </div>

      <div className="viewer__body">
        {mode === "rendered" && isMarkdown ? (
          <div className="viewer__doc">
            <Markdown text={content} />
          </div>
        ) : mode === "rendered" && isJson ? (
          <SourceView code={prettyJson(content)} lang="json" />
        ) : mode === "rendered" && isSvg ? (
          <div className="viewer__svg">
            <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(content)}`} alt={fileName} />
          </div>
        ) : mode === "rendered" && isHtml ? (
          <iframe className="viewer__iframe" srcDoc={content} sandbox="" title="HTML preview" />
        ) : (
          <SourceView code={content} lang={lang} />
        )}
      </div>
    </div>
  );
};

function prettyJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

const SourceView: React.FC<{ code: string; lang: string | null }> = ({ code, lang }) => {
  const tokens = useHighlight(code, lang);
  const wrap = useAppearance((s) => s.editor.wrapCode);
  return (
    <div className="viewer__source selectable">
      <HighlightedLines code={code} tokens={tokens} lineNumbers wrap={wrap} />
    </div>
  );
};
