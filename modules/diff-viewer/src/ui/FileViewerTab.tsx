/** Read-only file viewer: highlighted source with line numbers, rendered Markdown / JSON / HTML / SVG. */
import React, { useEffect, useMemo, useState } from "react";
import {
  Check,
  Code2,
  Copy,
  Eye,
  FileCode,
  FileImage,
  FileJson,
  FileText,
  FolderOpen,
  ImageOff,
  Sparkles,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { ModuleHost, ModuleTab } from "@hive/module-sdk/renderer";
import { fileBaseName, getFileManagerLabel, type FileTabData } from "../shared.ts";

const errorText = (err: unknown): string => (err instanceof Error ? err.message : String(err));

export const FileViewerTab: React.FC<{ tab: ModuleTab; host: ModuleHost }> = ({ tab, host }) => {
  const { project: activeProject } = host.hooks.useActiveSession();
  const activeModel = host.hooks.useFeatureModel("session");
  const { AiModelChip, Markdown, HighlightedSource } = host.ui;
  const data = (tab.data ?? {}) as FileTabData;

  const fileName = tab.title || (tab.filePath ? fileBaseName(tab.filePath) : "File");
  const isRasterImage = Boolean(
    (tab.filePath && /\.(png|jpe?g|webp|gif|bmp|ico|avif)$/i.test(tab.filePath)) ||
    /\.(png|jpe?g|webp|gif|bmp|ico|avif)$/i.test(fileName),
  );
  const isSvg = /\.svg$/i.test(tab.filePath ?? fileName);
  const isImage = isRasterImage || isSvg;

  const [imgError, setImgError] = useState(false);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [copied, setCopied] = useState(false);

  // Tabs opened without content or dataUrl load it themselves.
  useEffect(() => {
    if (!tab.filePath) return;
    const hasData = isRasterImage ? Boolean(data.dataUrl) : data.content !== undefined;
    if (hasData) return;

    let cancelled = false;
    host.files
      .read(tab.filePath)
      .then(async (res) => {
        if (cancelled) return;
        let dataUrl = res.dataUrl as string | undefined;
        let mimeType = res.mimeType as string | undefined;
        let size = res.size as number | undefined;

        if (isRasterImage && !dataUrl && host.files.readMedia && tab.filePath) {
          try {
            const media = await host.files.readMedia(tab.filePath);
            dataUrl = `data:${media.mimeType};base64,${media.data}`;
            mimeType = media.mimeType;
            size = media.size;
          } catch {}
        }

        host.tabs.update(tab.id, {
          data: {
            content: res.content,
            language: res.language,
            dataUrl,
            mimeType,
            size,
            isBinary: res.isBinary as boolean | undefined,
          },
        });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          host.tabs.update(tab.id, { data: { content: `Failed to load file: ${errorText(err)}` } });
          setImgError(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [data.content, data.dataUrl, isRasterImage, tab.filePath, tab.id, host]);

  const content = data.content ?? "";
  const lang = host.languages.fromPath(tab.filePath ?? fileName) ?? host.languages.resolve(data.language);

  const isMarkdown = !isImage && lang === "markdown";
  const isHtml = !isImage && lang === "html";
  const isJson = !isImage && (lang === "json" || lang === "jsonc");
  const canRender = isMarkdown || isHtml || isSvg || isJson;
  const [mode, setMode] = useState<"rendered" | "source">(
    data.line ? "source" : isMarkdown || isSvg ? "rendered" : "source",
  );
  const fileManagerLabel = useMemo(() => host.files.fileManagerLabel?.() ?? getFileManagerLabel(), [host]);

  const lineCount = useMemo(() => content.split("\n").length, [content]);
  const sizeKb = useMemo(() => {
    if (typeof data.size === "number") {
      return (data.size / 1024).toFixed(1);
    }
    return (new Blob([content]).size / 1024).toFixed(1);
  }, [data.size, content]);

  const metaLabel = isRasterImage
    ? `${dimensions ? `${dimensions.width} × ${dimensions.height} px · ` : ""}${sizeKb} KB`
    : isSvg && mode === "rendered" && dimensions
    ? `${dimensions.width} × ${dimensions.height} px · ${sizeKb} KB`
    : `${lineCount.toLocaleString()} lines · ${sizeKb} KB`;

  const typeLabel = isRasterImage
    ? (tab.filePath ?? fileName).split(".").pop()?.toUpperCase() || "IMAGE"
    : host.languages.label(lang, data.language);

  const onCopy = async () => {
    if (isRasterImage && data.dataUrl) {
      if (host.clipboard.copyImage) {
        const ok = await host.clipboard.copyImage(data.dataUrl);
        if (ok) {
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
          return;
        }
      }
      if (tab.filePath && (await host.clipboard.copy(tab.filePath))) {
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
        return;
      }
    }
    if (await host.clipboard.copy(content)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    }
  };

  const showInFolder = () => {
    if (tab.filePath && host.files.showInFolder) {
      void host.files.showInFolder(tab.filePath);
    }
  };

  const askPi = async () => {
    if (!activeProject) return;
    const rel = tab.filePath?.replace(activeProject.path, "").replace(/^[/\\]/, "") || fileName;
    await host.sessions.newSession(activeProject.id);
    const prompt = isImage
      ? `Explain or describe ${rel} — its contents, purpose, and anything notable:\n`
      : `Explain ${rel} — what it does and anything notable:\n`;
    host.sessions.setPrompt(prompt);
  };

  const source = (code: string, language: string | null) => (
    <div className="viewer__source selectable">
      <HighlightedSource code={code} language={language} targetLine={data.line} />
    </div>
  );

  const showZoom = (isRasterImage && Boolean(data.dataUrl)) || (isSvg && mode === "rendered");

  return (
    <div className="viewer">
      <div className="viewer__bar">
        <span className="viewer__icon">
          {isImage ? (
            <FileImage size={16} />
          ) : isJson ? (
            <FileJson size={16} />
          ) : isMarkdown ? (
            <FileText size={16} />
          ) : (
            <FileCode size={16} />
          )}
        </span>
        <div className="viewer__names">
          <span className="viewer__name" title={tab.filePath}>
            {fileName}
          </span>
          <span className="viewer__path selectable" title={tab.filePath}>
            {tab.filePath}
          </span>
        </div>
        <span className="ui-chip">{typeLabel}</span>
        <span className="viewer__meta">{metaLabel}</span>
        <span style={{ flex: 1 }} />
        {showZoom && (
          <div className="ui-seg">
            <button
              onClick={() => setZoom((z) => Math.max(0.25, Number((z - 0.25).toFixed(2))))}
              title="Zoom out"
              disabled={zoom <= 0.25}
            >
              <ZoomOut size={12} />
            </button>
            <button
              onClick={() => setZoom(1)}
              title="Reset zoom to 100%"
              style={{ minWidth: 42, fontSize: 11 }}
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              onClick={() => setZoom((z) => Math.min(4, Number((z + 0.25).toFixed(2))))}
              title="Zoom in"
              disabled={zoom >= 4}
            >
              <ZoomIn size={12} />
            </button>
          </div>
        )}
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
        {tab.filePath && (
          <button className="ui-btn ui-btn--sm" onClick={showInFolder} title={fileManagerLabel}>
            <FolderOpen size={12} /> {fileManagerLabel}
          </button>
        )}
        <button
          className="ui-btn ui-btn--sm"
          onClick={onCopy}
          title={isRasterImage ? "Copy image" : "Copy file contents"}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "Copied" : isRasterImage ? "Copy Image" : "Copy"}
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
        {isRasterImage ? (
          data.dataUrl ? (
            <div className="viewer__image">
              <img
                src={data.dataUrl}
                alt={fileName}
                style={zoom !== 1 ? { transform: `scale(${zoom})`, transformOrigin: "center" } : undefined}
                onLoad={(e) => {
                  const img = e.currentTarget;
                  setDimensions({ width: img.naturalWidth, height: img.naturalHeight });
                  setImgError(false);
                }}
                onError={() => setImgError(true)}
              />
            </div>
          ) : imgError ? (
            <div className="viewer__image-error">
              <ImageOff size={32} />
              <span>Failed to load image</span>
            </div>
          ) : (
            <div className="viewer__image-loading">
              <span>Loading image...</span>
            </div>
          )
        ) : mode === "rendered" && isMarkdown ? (
          <div className="viewer__doc">
            <Markdown text={content} />
          </div>
        ) : mode === "rendered" && isJson ? (
          source(prettyJson(content), "json")
        ) : mode === "rendered" && isSvg ? (
          <div className="viewer__image viewer__svg">
            <img
              src={data.dataUrl || `data:image/svg+xml;charset=utf-8,${encodeURIComponent(content)}`}
              alt={fileName}
              style={zoom !== 1 ? { transform: `scale(${zoom})`, transformOrigin: "center" } : undefined}
              onLoad={(e) => {
                const img = e.currentTarget;
                if (img.naturalWidth && img.naturalHeight) {
                  setDimensions({ width: img.naturalWidth, height: img.naturalHeight });
                }
              }}
            />
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
