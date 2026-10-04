/** Read-only file viewer: highlighted source with line numbers, rendered Markdown / JSON / HTML / SVG. */
import React, { useEffect, useMemo, useState } from "react";
import { Check, Code2, Copy, Eye, FileCode, FileJson, FileText, Sparkles, X } from "lucide-react";
import type { ModuleHost, ModuleTab } from "@hive/module-sdk/renderer";
import { fileBaseName, type FileTabData } from "../shared.ts";

const errorText = (err: unknown): string => (err instanceof Error ? err.message : String(err));

export const FileViewerTab: React.FC<{ tab: ModuleTab; host: ModuleHost }> = ({ tab, host }) => {
  const { project: activeProject } = host.hooks.useActiveSession();
  const activeModel = host.hooks.useFeatureModel("session");
  const { AiModelChip, Markdown, HighlightedSource } = host.ui;
  const data = (tab.data ?? {}) as FileTabData;

  // Tabs opened without content (e.g. by another module) load it themselves.
  useEffect(() => {
    if (data.content !== undefined || !tab.filePath) return;
    let cancelled = false;
    host.files
      .read(tab.filePath)
      .then((res) => {
        if (!cancelled) host.tabs.update(tab.id, { data: { content: res.content, language: res.language } });
      })
      .catch((err: unknown) => {
        if (!cancelled) host.tabs.update(tab.id, { data: { content: `Failed to load file: ${errorText(err)}` } });
      });
    return () => {
      cancelled = true;
    };
  }, [data.content, tab.filePath, tab.id, host]);

  const [copied, setCopied] = useState(false);
  const fileName = tab.title || (tab.filePath ? fileBaseName(tab.filePath) : "File");
  const content = data.content ?? "";
  const lang = host.languages.fromPath(tab.filePath ?? fileName) ?? host.languages.resolve(data.language);

  const isMarkdown = lang === "markdown";
  const isHtml = lang === "html";
  const isSvg = /\.svg$/i.test(fileName);
  const isJson = lang === "json" || lang === "jsonc";
  const canRender = isMarkdown || isHtml || isSvg || isJson;
  const [mode, setMode] = useState<"rendered" | "source">(isMarkdown || isSvg ? "rendered" : "source");

  const lineCount = useMemo(() => content.split("\n").length, [content]);
  const sizeKb = (new Blob([content]).size / 1024).toFixed(1);

  const onCopy = async () => {
    if (await host.clipboard.copy(content)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    }
  };

  const askPi = async () => {
    if (!activeProject) return;
    const rel = tab.filePath?.replace(activeProject.path, "").replace(/^[/\\]/, "") || fileName;
    await host.sessions.newSession(activeProject.id);
    host.sessions.setPrompt(`Explain ${rel} — what it does and anything notable:\n`);
  };

  const source = (code: string, language: string | null) => (
    <div className="viewer__source selectable">
      <HighlightedSource code={code} language={language} />
    </div>
  );

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
        <span className="ui-chip">{host.languages.label(lang, data.language)}</span>
        <span className="viewer__meta">
          {lineCount.toLocaleString()} lines · {sizeKb} KB
        </span>
        <span style={{ flex: 1 }} />
        {canRender && (
          <div className="ui-seg">
            <button aria-pressed={mode === "rendered"} onClick={() => setMode("rendered")}>
              <Eye size={12} /> {isJson ? "Formatted" : "Preview"}
            </button>
            <button aria-pressed={mode === "source"} onClick={() => setMode("source")}>
              <Code2 size={12} /> Source
            </button>
          </div>
        )}
        <button className="ui-btn ui-btn--sm" onClick={onCopy} title="Copy file contents">
          {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "Copied" : "Copy"}
        </button>
        <button
          className="ui-btn ui-btn--sm"
          onClick={() => void askPi()}
          title={`Start a session asking Pi about this file · Model: ${activeModel.name || activeModel.id} (${activeModel.sourceLabel})`}
          disabled={!activeProject}
          style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
        >
          <Sparkles size={12} /> Ask Pi
          <AiModelChip model={activeModel} clickable={false} feature="session" />
        </button>
        <button className="ui-btn ui-btn--sm ui-btn--ghost ui-btn--icon" onClick={() => host.tabs.close(tab.id)} title="Close">
          <X size={14} />
        </button>
      </div>

      <div className="viewer__body">
        {mode === "rendered" && isMarkdown ? (
          <div className="viewer__doc">
            <Markdown text={content} />
          </div>
        ) : mode === "rendered" && isJson ? (
          source(prettyJson(content), "json")
        ) : mode === "rendered" && isSvg ? (
          <div className="viewer__svg">
            <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(content)}`} alt={fileName} />
          </div>
        ) : mode === "rendered" && isHtml ? (
          <iframe className="viewer__iframe" srcDoc={content} sandbox="" title="HTML preview" />
        ) : (
          source(content, lang)
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
