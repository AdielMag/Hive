import React, { useRef, useState } from "react";
import {
  Send,
  Square,
  CornerDownLeft,
  Paperclip,
  FileText,
  X,
  Brain,
  Loader2,
  Image as ImageIcon,
} from "lucide-react";
import { useSessionStore } from "../store/session-store.ts";
import { ContextRing } from "./ContextRing.tsx";
import { ContextBreakdownModal } from "./ContextBreakdownModal.tsx";
import type { AttachedItem } from "@pi-studio/protocol";

interface ComposerProps {
  height?: number;
}

export const Composer: React.FC<ComposerProps> = ({ height }) => {
  const {
    promptText,
    setPromptText,
    sendPrompt,
    abort,
    transcript,
    models,
    selectedModel,
    setModel,
    thinkingLevels,
    selectedThinkingLevel,
    setThinkingLevel,
    isLoadingModels,
    attachments,
    addAttachments,
    removeAttachment,
    clearAttachments,
    stats,
    extensionWidgets,
  } = useSessionStore();

  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isRunning = transcript.running;

  // Extension widgets placed above/below the editor
  const aboveWidgets = Object.entries(extensionWidgets).filter(([, w]) => w.placement === "aboveEditor");
  const belowWidgets = Object.entries(extensionWidgets).filter(([, w]) => w.placement === "belowEditor");

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (isRunning) {
        if (e.ctrlKey || e.metaKey) {
          void sendPrompt("steer");
        } else {
          void sendPrompt("followUp");
        }
      } else {
        void sendPrompt();
      }
    } else if (e.key === "Escape" && isRunning) {
      e.preventDefault();
      void abort();
    }
  };

  // Attach files via native dialog
  const handlePickFiles = async () => {
    try {
      const paths = await window.studio.pickFiles();
      if (!paths || paths.length === 0) return;

      const newItems: AttachedItem[] = [];
      for (const p of paths) {
        const isImg = /\.(png|jpe?g|webp|gif|svg|bmp)$/i.test(p);
        if (isImg) {
          try {
            const media = await window.studio.readMediaFile(p);
            newItems.push({
              id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              name: media.name,
              path: p,
              kind: "image",
              mimeType: media.mimeType,
              size: media.size,
              dataBase64: media.data,
              previewUrl: `data:${media.mimeType};base64,${media.data}`,
            });
          } catch (err) {
            console.error("Failed to read image", p, err);
          }
        } else {
          try {
            const fileData = await window.studio.readFile(p);
            newItems.push({
              id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              name: p.split(/[/\\]/).pop() || "file",
              path: p,
              kind: "file",
              mimeType: "text/plain",
              size: fileData.size,
              textContent: fileData.content,
            });
          } catch (err) {
            console.error("Failed to read file", p, err);
          }
        }
      }
      if (newItems.length > 0) {
        addAttachments(newItems);
      }
    } catch (err) {
      console.error("Error picking files", err);
    }
  };

  // Handle Drag & Drop
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (!files.length) return;

    const newItems: AttachedItem[] = [];
    for (const file of files) {
      const realPath = window.studio.getPathForFile?.(file);
      const isImg = file.type.startsWith("image/") || /\.(png|jpe?g|webp|gif|svg|bmp)$/i.test(file.name);

      if (isImg) {
        if (realPath) {
          try {
            const media = await window.studio.readMediaFile(realPath);
            newItems.push({
              id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              name: media.name,
              path: realPath,
              kind: "image",
              mimeType: media.mimeType,
              size: media.size,
              dataBase64: media.data,
              previewUrl: `data:${media.mimeType};base64,${media.data}`,
            });
            continue;
          } catch {}
        }
        // Fallback to FileReader
        const dataUrl = await readFileAsDataUrl(file);
        const base64 = dataUrl.split(",")[1] ?? "";
        newItems.push({
          id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: file.name,
          path: realPath,
          kind: "image",
          mimeType: file.type || "image/png",
          size: file.size,
          dataBase64: base64,
          previewUrl: dataUrl,
        });
      } else {
        // Text file
        if (realPath) {
          try {
            const fileData = await window.studio.readFile(realPath);
            newItems.push({
              id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              name: file.name,
              path: realPath,
              kind: "file",
              mimeType: file.type || "text/plain",
              size: fileData.size,
              textContent: fileData.content,
            });
            continue;
          } catch {}
        }
        const text = await file.text();
        newItems.push({
          id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: file.name,
          kind: "file",
          mimeType: file.type || "text/plain",
          size: file.size,
          textContent: text,
        });
      }
    }

    if (newItems.length > 0) {
      addAttachments(newItems);
    }
  };

  // Handle Clipboard Paste
  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    const newItems: AttachedItem[] = [];

    for (const item of items) {
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (!file) continue;

        if (file.type.startsWith("image/")) {
          e.preventDefault();
          const dataUrl = await readFileAsDataUrl(file);
          const base64 = dataUrl.split(",")[1] ?? "";
          newItems.push({
            id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            name: file.name || `Pasted Image ${new Date().toLocaleTimeString()}`,
            kind: "image",
            mimeType: file.type || "image/png",
            size: file.size,
            dataBase64: base64,
            previewUrl: dataUrl,
          });
        }
      }
    }

    if (newItems.length > 0) {
      addAttachments(newItems);
    }
  };

  function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // Active thinking levels: use returned levels or fallback to ["low", "medium", "high"] if model reasoning
  const activeThinkingLevels =
    thinkingLevels.length > 0
      ? thinkingLevels
      : selectedModel?.reasoning
      ? ["low", "medium", "high"]
      : [];

  // Context usage metrics
  const contextTokens = stats?.contextUsage?.tokens ?? transcript.lastUsage?.totalTokens ?? 0;
  const contextWindow = stats?.contextUsage?.contextWindow ?? selectedModel?.contextWindow ?? 200_000;
  const contextPercent = stats?.contextUsage?.percent ?? (contextWindow > 0 ? (contextTokens / contextWindow) * 100 : 0);

  const canSend = promptText.trim().length > 0 || attachments.length > 0;

  return (
    <div
      style={{
        borderTop: "1px solid var(--border-subtle)",
        background: "var(--bg-app)",
        padding: "10px 16px 12px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        height: height ?? "auto",
        minHeight: 120,
        boxSizing: "border-box",
      }}
    >
      {/* Extension widgets above editor */}
      {aboveWidgets.map(([key, w]) => (
        <div
          key={key}
          style={{
            padding: "6px 10px",
            background: "rgba(255, 255, 255, 0.02)",
            border: "1px dashed var(--border-subtle)",
            borderRadius: 6,
            fontSize: 11,
            color: "var(--text-secondary)",
            fontFamily: "var(--font-mono)",
          }}
        >
          {w.lines.map((l, idx) => (
            <div key={idx}>{l}</div>
          ))}
        </div>
      ))}

      {/* Editor Box (Droppable area) */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDraggingOver(true);
        }}
        onDragLeave={() => setIsDraggingOver(false)}
        onDrop={handleDrop}
        style={{
          flex: 1,
          minHeight: 0,
          border: `1px solid ${isDraggingOver ? "var(--accent-base)" : "var(--border-prominent)"}`,
          borderRadius: 8,
          background: isDraggingOver ? "var(--accent-subtle)" : "var(--bg-input)",
          padding: "8px 10px",
          display: "flex",
          flexDirection: "column",
          gap: 6,
          transition: "border-color 0.15s ease, background 0.15s ease",
          position: "relative",
        }}
      >
        {/* Attached Items Preview Chips */}
        {attachments.length > 0 && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
              paddingBottom: 4,
              borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
              maxHeight: 110,
              overflowY: "auto",
            }}
          >
            {attachments.map((att) => (
              <div
                key={att.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "3px 8px",
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: 6,
                  fontSize: 11,
                  color: "var(--text-primary)",
                  maxWidth: 260,
                }}
              >
                {att.kind === "image" && att.previewUrl ? (
                  <img
                    src={att.previewUrl}
                    alt={att.name}
                    style={{ width: 18, height: 18, borderRadius: 3, objectFit: "cover" }}
                  />
                ) : (
                  <FileText size={14} color="var(--accent-base)" />
                )}
                <span
                  title={att.name}
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: 180,
                  }}
                >
                  {att.name}
                </span>
                {att.size ? (
                  <span style={{ fontSize: 9, color: "var(--text-muted)" }}>
                    ({(att.size / 1024).toFixed(0)}k)
                  </span>
                ) : null}
                <button
                  onClick={() => removeAttachment(att.id)}
                  title="Remove attachment"
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    padding: 0,
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={promptText}
          onChange={(e) => setPromptText(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={
            isDraggingOver
              ? "Drop files or images to attach..."
              : isRunning
              ? "Type to steer (Ctrl+Enter) or queue (Enter)..."
              : "Ask Pi or issue a task... (Drag & drop or paste files/images)"
          }
          style={{
            flex: 1,
            width: "100%",
            border: "none",
            background: "transparent",
            outline: "none",
            resize: "none",
            fontSize: 13,
            lineHeight: 1.4,
            color: "var(--text-primary)",
            minHeight: 48,
          }}
        />

        {/* Action / Toolbar Row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingTop: 4,
            borderTop: "1px solid rgba(255, 255, 255, 0.05)",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          {/* Left: Model & Thinking & Attachment Button & Context Ring */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {/* Attach button */}
            <button
              onClick={handlePickFiles}
              title="Attach files or images"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "3px 8px",
                background: "var(--bg-card)",
                border: "1px solid var(--border-subtle)",
                borderRadius: 4,
                fontSize: 11,
                color: "var(--text-secondary)",
                cursor: "pointer",
              }}
            >
              <Paperclip size={12} />
              <span>Attach</span>
            </button>

            {/* Model select */}
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <select
                value={selectedModel ? `${selectedModel.provider}/${selectedModel.id}` : ""}
                onChange={(e) => {
                  const [provider, modelId] = e.target.value.split("/");
                  if (provider && modelId) void setModel(provider, modelId);
                }}
                disabled={isLoadingModels && models.length === 0}
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: 4,
                  padding: "3px 8px",
                  fontSize: 11,
                  color: "var(--text-primary)",
                  cursor: "pointer",
                  maxWidth: 240,
                }}
              >
                {models.length === 0 ? (
                  <option value="">{isLoadingModels ? "Loading models..." : "No models found"}</option>
                ) : (
                  models.map((m) => (
                    <option key={`${m.provider}/${m.id}`} value={`${m.provider}/${m.id}`}>
                      {m.name || m.id} ({m.provider})
                    </option>
                  ))
                )}
              </select>
              {isLoadingModels && <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />}
            </div>

            {/* Thinking select */}
            {activeThinkingLevels.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <Brain size={13} color="var(--accent-base)" title="Reasoning / Thinking Level" />
                <select
                  value={selectedThinkingLevel}
                  onChange={(e) => void setThinkingLevel(e.target.value)}
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: 4,
                    padding: "3px 6px",
                    fontSize: 11,
                    color: "var(--text-secondary)",
                    cursor: "pointer",
                  }}
                >
                  {activeThinkingLevels.map((lvl) => (
                    <option key={lvl} value={lvl}>
                      thinking: {lvl}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Context Ring */}
            <ContextRing
              tokens={contextTokens}
              total={contextWindow}
              percent={contextPercent}
              onClick={() => setBreakdownOpen(true)}
            />
          </div>

          <ContextBreakdownModal isOpen={breakdownOpen} onClose={() => setBreakdownOpen(false)} />

          {/* Right: Send or Abort button */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {isRunning ? (
              <>
                <button
                  onClick={() => void sendPrompt("steer")}
                  disabled={!canSend}
                  title="Steer (interrupt after current tool)"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "4px 8px",
                    borderRadius: 4,
                    border: "1px solid var(--border-prominent)",
                    background: "transparent",
                    color: "var(--text-secondary)",
                    cursor: canSend ? "pointer" : "default",
                    fontSize: 11,
                  }}
                >
                  <CornerDownLeft size={12} /> Steer
                </button>
                <button
                  onClick={() => void abort()}
                  title="Stop generation"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "4px 10px",
                    borderRadius: 4,
                    border: "none",
                    background: "var(--danger)",
                    color: "#fff",
                    fontWeight: 500,
                    cursor: "pointer",
                    fontSize: 11,
                  }}
                >
                  <Square size={12} fill="#fff" /> Stop
                </button>
              </>
            ) : (
              <button
                onClick={() => void sendPrompt()}
                disabled={!canSend}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "5px 12px",
                  borderRadius: 4,
                  border: "none",
                  background: canSend ? "var(--accent-base)" : "var(--bg-card)",
                  color: canSend ? "#fff" : "var(--text-muted)",
                  fontWeight: 500,
                  cursor: canSend ? "pointer" : "default",
                  fontSize: 12,
                }}
              >
                <Send size={12} /> Send
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Extension widgets below editor */}
      {belowWidgets.map(([key, w]) => (
        <div
          key={key}
          style={{
            padding: "6px 10px",
            background: "rgba(255, 255, 255, 0.02)",
            border: "1px dashed var(--border-subtle)",
            borderRadius: 6,
            fontSize: 11,
            color: "var(--text-secondary)",
            fontFamily: "var(--font-mono)",
          }}
        >
          {w.lines.map((l, idx) => (
            <div key={idx}>{l}</div>
          ))}
        </div>
      ))}
    </div>
  );
};
