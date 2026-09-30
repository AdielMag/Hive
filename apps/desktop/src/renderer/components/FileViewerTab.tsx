import React, { useMemo, useState } from "react";
import {
  FileCode,
  FileText,
  Copy,
  Check,
  Sparkles,
  Eye,
  Code2,
  X,
  FileJson,
} from "lucide-react";
import type { TabItem } from "@pi-studio/protocol";
import { useSessionStore } from "../store/session-store.ts";

export const FileViewerTab: React.FC<{ tab: TabItem }> = ({ tab }) => {
  const { setPromptText, closeTab, newSessionTab, activeProject } = useSessionStore();
  const [copied, setCopied] = useState(false);

  const language = (tab.fileLanguage || "").toLowerCase();
  const fileName = tab.title || tab.filePath?.split(/[/\\]/).pop() || "File";
  const content = tab.fileContent || "";

  // Determine available view modes based on file type
  const isMarkdown = language === "markdown" || fileName.endsWith(".md") || fileName.endsWith(".markdown");
  const isHtml = language === "html" || fileName.endsWith(".html") || fileName.endsWith(".htm");
  const isSvg = fileName.endsWith(".svg");
  const isJson = language === "json" || fileName.endsWith(".json");
  const canRender = isMarkdown || isHtml || isSvg || isJson;

  // View mode: "compiled" (rendered/interpreted) or "source" (code/raw)
  const [viewMode, setViewMode] = useState<"compiled" | "source">(canRender ? "compiled" : "source");

  const lines = useMemo(() => content.split("\n"), [content]);
  const lineCount = lines.length;
  const fileSizeKb = (new Blob([content]).size / 1024).toFixed(1);

  const handleCopy = () => {
    void navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleAskPi = async () => {
    if (!activeProject) return;
    const relPath = tab.filePath?.replace(activeProject.path, "").replace(/^[/\\]/, "") || fileName;
    setPromptText(`Please explain and inspect ${relPath}:\n`);
    await newSessionTab(activeProject.id);
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        backgroundColor: "var(--bg-app)",
      }}
    >
      {/* File Header Bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 16px",
          background: "var(--bg-card)",
          borderBottom: "1px solid var(--border-subtle)",
          flexShrink: 0,
          gap: 12,
        }}
      >
        {/* Left: File Metadata */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          {isJson ? (
            <FileJson size={16} color="#f59e0b" style={{ flexShrink: 0 }} />
          ) : isMarkdown ? (
            <FileText size={16} color="#539bf5" style={{ flexShrink: 0 }} />
          ) : (
            <FileCode size={16} color="#38bdf8" style={{ flexShrink: 0 }} />
          )}

          <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--text-primary)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={tab.filePath}
            >
              {fileName}
            </span>
            <span
              style={{
                fontSize: 10,
                color: "var(--text-muted)",
                fontFamily: "var(--font-mono)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={tab.filePath}
            >
              {tab.filePath}
            </span>
          </div>

          <span
            style={{
              padding: "2px 6px",
              borderRadius: 4,
              fontSize: 10,
              fontWeight: 700,
              fontFamily: "var(--font-mono)",
              background: "rgba(255, 255, 255, 0.06)",
              color: "var(--text-secondary)",
              textTransform: "uppercase",
              flexShrink: 0,
            }}
          >
            {language || "TEXT"}
          </span>

          <span style={{ fontSize: 11, color: "var(--text-muted)", flexShrink: 0 }}>
            {lineCount} {lineCount === 1 ? "line" : "lines"} • {fileSizeKb} KB
          </span>
        </div>

        {/* Right: Mode Switcher & Action Buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {/* Mode Switcher Toggle */}
          {canRender && (
            <div
              style={{
                display: "flex",
                background: "var(--bg-input)",
                border: "1px solid var(--border-subtle)",
                borderRadius: 5,
                padding: 2,
                gap: 2,
              }}
            >
              <button
                onClick={() => setViewMode("compiled")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "3px 8px",
                  borderRadius: 3,
                  fontSize: 11,
                  border: "none",
                  cursor: "pointer",
                  fontWeight: 500,
                  background: viewMode === "compiled" ? "var(--bg-card)" : "transparent",
                  color: viewMode === "compiled" ? "var(--text-primary)" : "var(--text-muted)",
                  boxShadow: viewMode === "compiled" ? "0 1px 3px rgba(0,0,0,0.3)" : "none",
                }}
              >
                <Eye size={12} />
                <span>{isMarkdown ? "Rendered" : isJson ? "Formatted" : "Preview"}</span>
              </button>
              <button
                onClick={() => setViewMode("source")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "3px 8px",
                  borderRadius: 3,
                  fontSize: 11,
                  border: "none",
                  cursor: "pointer",
                  fontWeight: 500,
                  background: viewMode === "source" ? "var(--bg-card)" : "transparent",
                  color: viewMode === "source" ? "var(--text-primary)" : "var(--text-muted)",
                  boxShadow: viewMode === "source" ? "0 1px 3px rgba(0,0,0,0.3)" : "none",
                }}
              >
                <Code2 size={12} />
                <span>Source</span>
              </button>
            </div>
          )}

          {/* Copy Button */}
          <button
            onClick={handleCopy}
            title="Copy file contents"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "4px 8px",
              background: "var(--bg-input)",
              border: "1px solid var(--border-subtle)",
              borderRadius: 4,
              color: copied ? "var(--success)" : "var(--text-secondary)",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            <span>{copied ? "Copied" : "Copy"}</span>
          </button>

          {/* Ask Pi Button */}
          <button
            onClick={handleAskPi}
            title="Ask Pi to inspect and explain this file"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "4px 9px",
              background: "rgba(83, 155, 245, 0.12)",
              border: "1px solid rgba(83, 155, 245, 0.3)",
              borderRadius: 4,
              color: "var(--accent-base)",
              fontSize: 11,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            <Sparkles size={12} />
            <span>Ask Pi</span>
          </button>

          {/* Close Tab Button */}
          <button
            onClick={() => closeTab(tab.id)}
            title="Close tab"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              display: "flex",
              padding: 4,
              borderRadius: 3,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Main File Content Area */}
      <div style={{ flex: 1, overflow: "auto", position: "relative" }}>
        {viewMode === "compiled" && isMarkdown ? (
          <RenderedMarkdown content={content} />
        ) : viewMode === "compiled" && isJson ? (
          <RenderedJson content={content} />
        ) : viewMode === "compiled" && (isHtml || isSvg) ? (
          <RenderedHtmlOrSvg content={content} isSvg={isSvg} />
        ) : (
          <SourceCodeViewer lines={lines} language={language} />
        )}
      </div>
    </div>
  );
};

/** Rendered Markdown View */
const RenderedMarkdown: React.FC<{ content: string }> = ({ content }) => {
  // Simple markdown renderer for headers, code blocks, lists, quotes, and paragraphs
  const elements = useMemo(() => {
    const rawLines = content.split("\n");
    const nodes: React.ReactNode[] = [];
    let inCodeBlock = false;
    let codeBuffer: string[] = [];
    let codeLang = "";

    rawLines.forEach((line, idx) => {
      if (line.startsWith("```")) {
        if (inCodeBlock) {
          nodes.push(
            <pre
              key={`code-${idx}`}
              style={{
                background: "var(--bg-input)",
                border: "1px solid var(--border-subtle)",
                borderRadius: 6,
                padding: "10px 14px",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                overflowX: "auto",
                margin: "8px 0",
                color: "#e6edf3",
              }}
            >
              <code>{codeBuffer.join("\n")}</code>
            </pre>,
          );
          codeBuffer = [];
          inCodeBlock = false;
        } else {
          inCodeBlock = true;
          codeLang = line.slice(3).trim();
        }
        return;
      }

      if (inCodeBlock) {
        codeBuffer.push(line);
        return;
      }

      if (line.startsWith("# ")) {
        nodes.push(
          <h1 key={idx} style={{ fontSize: 20, fontWeight: 700, margin: "18px 0 8px", color: "var(--text-primary)", borderBottom: "1px solid var(--border-subtle)", paddingBottom: 6 }}>
            {line.slice(2)}
          </h1>,
        );
      } else if (line.startsWith("## ")) {
        nodes.push(
          <h2 key={idx} style={{ fontSize: 16, fontWeight: 600, margin: "14px 0 6px", color: "var(--text-primary)" }}>
            {line.slice(3)}
          </h2>,
        );
      } else if (line.startsWith("### ")) {
        nodes.push(
          <h3 key={idx} style={{ fontSize: 14, fontWeight: 600, margin: "12px 0 4px", color: "var(--accent-base)" }}>
            {line.slice(4)}
          </h3>,
        );
      } else if (line.startsWith("> ")) {
        nodes.push(
          <blockquote
            key={idx}
            style={{
              borderLeft: "3px solid var(--accent-base)",
              paddingLeft: 12,
              margin: "6px 0",
              color: "var(--text-secondary)",
              fontStyle: "italic",
            }}
          >
            {line.slice(2)}
          </blockquote>,
        );
      } else if (line.startsWith("- [x] ") || line.startsWith("- [ ] ")) {
        const checked = line.startsWith("- [x] ");
        nodes.push(
          <div key={idx} style={{ display: "flex", alignItems: "center", gap: 6, margin: "3px 0", paddingLeft: 8 }}>
            <input type="checkbox" checked={checked} readOnly style={{ accentColor: "var(--accent-base)" }} />
            <span style={{ textDecoration: checked ? "line-through" : "none", color: checked ? "var(--text-muted)" : "var(--text-primary)" }}>
              {line.slice(6)}
            </span>
          </div>,
        );
      } else if (line.startsWith("- ") || line.startsWith("* ")) {
        nodes.push(
          <li key={idx} style={{ marginLeft: 20, margin: "2px 0", color: "var(--text-primary)" }}>
            {line.slice(2)}
          </li>,
        );
      } else if (line.trim() === "") {
        nodes.push(<div key={idx} style={{ height: 8 }} />);
      } else {
        nodes.push(
          <p key={idx} style={{ margin: "4px 0", lineHeight: 1.6, color: "var(--text-primary)" }}>
            {line}
          </p>,
        );
      }
    });

    return nodes;
  }, [content]);

  return (
    <div
      style={{
        padding: "20px 32px",
        maxWidth: 860,
        margin: "0 auto",
        fontSize: 13,
        lineHeight: 1.6,
      }}
    >
      {elements}
    </div>
  );
};

/** Rendered JSON Viewer */
const RenderedJson: React.FC<{ content: string }> = ({ content }) => {
  const parsed = useMemo(() => {
    try {
      return { ok: true, data: JSON.parse(content) };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }, [content]);

  if (!parsed.ok) {
    return (
      <div style={{ padding: 20, color: "var(--danger)" }}>
        <strong>Invalid JSON:</strong> {parsed.error}
      </div>
    );
  }

  return (
    <div style={{ padding: 20, fontFamily: "var(--font-mono)", fontSize: 11 }}>
      <JsonTreeRenderer data={parsed.data} />
    </div>
  );
};

/** Simple recursive JSON tree renderer */
const JsonTreeRenderer: React.FC<{ data: any; depth?: number }> = ({ data, depth = 0 }) => {
  if (data === null) return <span style={{ color: "var(--text-muted)" }}>null</span>;
  if (typeof data === "boolean") return <span style={{ color: "#38bdf8" }}>{String(data)}</span>;
  if (typeof data === "number") return <span style={{ color: "#f59e0b" }}>{data}</span>;
  if (typeof data === "string") return <span style={{ color: "#34d399" }}>"{data}"</span>;

  if (Array.isArray(data)) {
    if (data.length === 0) return <span>[]</span>;
    return (
      <div>
        <span>[</span>
        <div style={{ paddingLeft: 16 }}>
          {data.map((item, idx) => (
            <div key={idx} style={{ display: "flex", gap: 4 }}>
              <span style={{ color: "var(--text-muted)" }}>{idx}:</span>
              <JsonTreeRenderer data={item} depth={depth + 1} />
              {idx < data.length - 1 && <span>,</span>}
            </div>
          ))}
        </div>
        <span>]</span>
      </div>
    );
  }

  if (typeof data === "object") {
    const keys = Object.keys(data);
    if (keys.length === 0) return <span>{"{}"}</span>;
    return (
      <div>
        <span>{"{"}</span>
        <div style={{ paddingLeft: 16 }}>
          {keys.map((key, idx) => (
            <div key={key} style={{ display: "flex", gap: 4 }}>
              <span style={{ color: "#818cf8" }}>"{key}"</span>:
              <JsonTreeRenderer data={data[key]} depth={depth + 1} />
              {idx < keys.length - 1 && <span>,</span>}
            </div>
          ))}
        </div>
        <span>{"}"}</span>
      </div>
    );
  }

  return <span>{String(data)}</span>;
};

/** Rendered HTML or SVG Viewer */
const RenderedHtmlOrSvg: React.FC<{ content: string; isSvg: boolean }> = ({ content, isSvg }) => {
  if (isSvg) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 30,
          height: "100%",
          background: "var(--bg-app)",
        }}
        dangerouslySetInnerHTML={{ __html: content }}
      />
    );
  }

  return (
    <iframe
      srcDoc={content}
      sandbox="allow-scripts"
      style={{
        width: "100%",
        height: "100%",
        border: "none",
        background: "#ffffff",
      }}
      title="HTML Preview"
    />
  );
};

/** Source Code Viewer with Line Numbers */
const SourceCodeViewer: React.FC<{ lines: string[]; language: string }> = ({ lines, language }) => {
  return (
    <div
      style={{
        display: "flex",
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        lineHeight: 1.5,
        minWidth: "fit-content",
        padding: "10px 0",
      }}
    >
      {/* Line Numbers Gutter */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          padding: "0 12px 0 16px",
          color: "var(--text-muted)",
          textAlign: "right",
          userSelect: "none",
          borderRight: "1px solid var(--border-subtle)",
          flexShrink: 0,
          opacity: 0.6,
        }}
      >
        {lines.map((_, idx) => (
          <div key={idx} style={{ height: "1.5em" }}>
            {idx + 1}
          </div>
        ))}
      </div>

      {/* Code Lines */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          padding: "0 16px",
          flex: 1,
          color: "var(--text-primary)",
          whiteSpace: "pre",
        }}
      >
        {lines.map((line, idx) => (
          <div key={idx} style={{ height: "1.5em" }}>
            {formatCodeLine(line, language)}
          </div>
        ))}
      </div>
    </div>
  );
};

/** Simple keyword / string / comment colorizer */
function formatCodeLine(line: string, _lang: string): React.ReactNode {
  if (line.trim().startsWith("//") || line.trim().startsWith("#")) {
    return <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>{line}</span>;
  }
  return line;
}
