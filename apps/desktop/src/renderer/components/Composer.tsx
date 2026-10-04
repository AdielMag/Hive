import React, { useEffect, useRef, useState, useMemo } from "react";
import {
  Send,
  Square,
  CornerDownLeft,
  Paperclip,
  X,
  ChevronDown,
  Brain,
  Check,
  Search,
  Cpu,
  SlidersHorizontal,
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useSessionStore } from "../store/session-store.ts";
import { useUi } from "../store/ui-store.ts";
import { ContextRing } from "./ContextRing.tsx";
import { useContextBreakdown } from "./ContextBreakdownView.tsx";
import { ProviderIcon } from "./ProviderIcon.tsx";
import { ThinkingPicker } from "./ThinkingPicker.tsx";
import { ModePicker } from "./ModePicker.tsx";
import { QueuedMessagesBar } from "./transcript/QueuedMessages.tsx";
import { ModelSwitchCacheBar } from "./ModelSwitchCacheBar.tsx";
import { AttachmentTray } from "./AttachmentTray.tsx";
import { formatContextWindow, getSupportedThinkingLevels } from "../lib/models/thinking.ts";
import type { AttachedItem } from "@hive/protocol";

interface ComposerProps {
  height?: number;
}

export const Composer: React.FC<ComposerProps> = ({ height }) => {
  const { promptText, setPromptText, sendPrompt, abort, running, models, allCatalogModels, enabledModelKeys, selectedModel, setModel, isLoadingModels, attachments, addAttachments, removeAttachment, extensionWidgets } = useSessionStore(useShallow((s) => ({ promptText: s.promptText, setPromptText: s.setPromptText, sendPrompt: s.sendPrompt, abort: s.abort, running: s.transcript.running, models: s.models, allCatalogModels: s.allCatalogModels, enabledModelKeys: s.enabledModelKeys, selectedModel: s.selectedModel, setModel: s.setModel, isLoadingModels: s.isLoadingModels, attachments: s.attachments, addAttachments: s.addAttachments, removeAttachment: s.removeAttachment, extensionWidgets: s.extensionWidgets })));

  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [modelFilter, setModelFilter] = useState("");
  const modelPickerRef = useRef<HTMLDivElement>(null);
  const modelSearchInputRef = useRef<HTMLInputElement>(null);

  // Click outside to close model picker dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modelPickerRef.current && !modelPickerRef.current.contains(e.target as Node)) {
        setModelPickerOpen(false);
        setModelFilter("");
      }
    };
    if (modelPickerOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      setTimeout(() => modelSearchInputRef.current?.focus(), 50);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [modelPickerOpen]);

  // Combine models from active session and catalog so all known models can be shown if active
  const baseModels = useMemo(() => {
    const map = new Map<string, typeof models[0]>();
    for (const m of allCatalogModels) {
      map.set(`${m.provider}/${m.id}`, m);
    }
    for (const m of models) {
      map.set(`${m.provider}/${m.id}`, m);
    }
    return Array.from(map.values());
  }, [allCatalogModels, models]);

  // Filter to only enabled models (if enabledModelKeys is specified)
  const visibleModels = useMemo(() => {
    if (!enabledModelKeys || enabledModelKeys.length === 0) {
      return baseModels;
    }
    const enabledSet = new Set(enabledModelKeys);
    const filtered = baseModels.filter((m) => {
      const fullKey = `${m.provider}/${m.id}`;
      if (enabledSet.has(fullKey)) return true;
      return enabledModelKeys.some((k) => !k.includes("/") && k === m.id);
    });
    return filtered.length > 0 ? filtered : baseModels;
  }, [baseModels, enabledModelKeys]);

  // User search filter
  const filteredModels = useMemo(() => {
    const q = modelFilter.trim().toLowerCase();
    if (!q) return visibleModels;
    return visibleModels.filter(
      (m) =>
        (m.name || "").toLowerCase().includes(q) ||
        (m.id || "").toLowerCase().includes(q) ||
        (m.provider || "").toLowerCase().includes(q),
    );
  }, [visibleModels, modelFilter]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isRunning = running;

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

  // Context usage metrics
  // Same source as the breakdown modal, so the ring and the popup always agree.
  const { contextTokens, contextWindow, percent: contextPercent } = useContextBreakdown();

  const canSend = promptText.trim().length > 0 || attachments.length > 0;

  return (
    <div
      style={{
        background: "var(--bg-app)",
        padding: "6px 18px 14px 18px",
        maxWidth: 920,
        width: "100%",
        margin: "0 auto",
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
            background: "rgba(var(--fg-rgb), 0.02)",
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

      {/* Mid-session model switch: suggest compacting before the new model re-reads everything uncached */}
      <ModelSwitchCacheBar />

      {/* Queued messages banner if any */}
      <QueuedMessagesBar />

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
          borderRadius: 14,
          background: isDraggingOver ? "var(--accent-subtle)" : "var(--bg-card)",
          boxShadow: "0 6px 24px rgba(0,0,0,0.18)",
          padding: "10px 12px 8px",
          display: "flex",
          flexDirection: "column",
          gap: 6,
          transition: "border-color 0.15s ease, background 0.15s ease",
          position: "relative",
        }}
      >
        {/* Attached items: compact preview tiles */}
        <AttachmentTray attachments={attachments} onRemove={removeAttachment} />

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
            fontSize: 13.5,
            lineHeight: 1.5,
            color: "var(--text-primary)",
            minHeight: 44,
          }}
        />

        {/* Action / Toolbar Row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingTop: 4,
            gap: 8,
          }}
        >
          {/* Left: Mode, Model, Thinking, Attachment Button & Context Ring */}
          <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0, flex: 1 }}>
            {/* Attach button */}
            <button
              onClick={handlePickFiles}
              title="Attach files or images"
              style={{
                flexShrink: 0,
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

            {/* Mode selector */}
            <ModePicker />

            {/* Model select with custom dropdown and provider icon */}
            <div ref={modelPickerRef} style={{ position: "relative", minWidth: 0, flexShrink: 1 }}>
              <button
                type="button"
                onClick={() => setModelPickerOpen((prev) => !prev)}
                disabled={isLoadingModels && visibleModels.length === 0}
                title={
                  selectedModel
                    ? `${selectedModel.name || selectedModel.id} (${selectedModel.provider}) · Context: ${formatContextWindow(selectedModel.contextWindow) || "unknown"} (${(selectedModel.contextWindow ?? 0).toLocaleString()} tokens) · Thinking: ${
                        Boolean(selectedModel.reasoning)
                          ? getSupportedThinkingLevels(selectedModel).filter((l) => l !== "off").join(", ") || "supported"
                          : "off"
                      }`
                    : undefined
                }
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  background: modelPickerOpen ? "var(--bg-elevated)" : "var(--bg-card)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: 4,
                  padding: "3px 8px",
                  fontSize: 11,
                  color: "var(--text-primary)",
                  cursor: "pointer",
                  maxWidth: "100%",
                  minWidth: 0,
                }}
              >
                {selectedModel ? (
                  <ProviderIcon provider={selectedModel.provider} size={13} />
                ) : (
                  <Cpu size={13} color="var(--text-muted)" />
                )}
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: 160,
                  }}
                >
                  {selectedModel ? selectedModel.name || selectedModel.id : isLoadingModels ? "Loading model…" : "Select Model"}
                </span>
                <ChevronDown
                  size={11}
                  color="var(--text-muted)"
                  style={{
                    transform: modelPickerOpen ? "rotate(180deg)" : "none",
                    transition: "transform 0.15s ease",
                  }}
                />
              </button>

              {/* Dropdown Menu */}
              {modelPickerOpen && (
                <div
                  style={{
                    position: "absolute",
                    bottom: "100%",
                    left: 0,
                    marginBottom: 6,
                    width: 280,
                    maxHeight: 280,
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border-prominent)",
                    borderRadius: 6,
                    boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                    zIndex: 1000,
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                  }}
                >
                  {/* Search box */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "6px 8px",
                      borderBottom: "1px solid var(--border-subtle)",
                      background: "var(--bg-card)",
                    }}
                  >
                    <Search size={12} color="var(--text-muted)" />
                    <input
                      ref={modelSearchInputRef}
                      type="text"
                      value={modelFilter}
                      onChange={(e) => setModelFilter(e.target.value)}
                      placeholder="Search models..."
                      style={{
                        background: "transparent",
                        border: "none",
                        outline: "none",
                        color: "var(--text-primary)",
                        fontSize: 11,
                        width: "100%",
                      }}
                    />
                    {modelFilter && (
                      <button
                        onClick={() => setModelFilter("")}
                        style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 0 }}
                      >
                        <X size={11} />
                      </button>
                    )}
                  </div>

                  {/* Models list */}
                  <div style={{ overflowY: "auto", padding: "4px 0", flex: 1 }}>
                    {filteredModels.length === 0 ? (
                      <div style={{ padding: "8px 12px", color: "var(--text-muted)", fontSize: 11, fontStyle: "italic" }}>
                        No matching models
                      </div>
                    ) : (
                      filteredModels.map((m) => {
                        const isSelected = selectedModel?.provider === m.provider && selectedModel?.id === m.id;
                        const ctxStr = formatContextWindow(m.contextWindow);
                        const modelLevels = getSupportedThinkingLevels(m);
                        const hasReasoning = Boolean(m.reasoning) && modelLevels.some((l) => l !== "off");
                        return (
                          <div
                            key={`${m.provider}/${m.id}`}
                            onMouseDown={(e) => {
                              e.preventDefault();
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              void setModel(m.provider, m.id);
                              setModelPickerOpen(false);
                              setModelFilter("");
                            }}
                            style={{
                              padding: "6px 10px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 8,
                              cursor: "pointer",
                              fontSize: 11,
                              background: isSelected ? "rgba(var(--accent-rgb), 0.12)" : "transparent",
                              color: isSelected ? "var(--accent-base)" : "var(--text-primary)",
                            }}
                            onMouseEnter={(e) => {
                              if (!isSelected) e.currentTarget.style.background = "var(--bg-card-hover)";
                            }}
                            onMouseLeave={(e) => {
                              if (!isSelected) e.currentTarget.style.background = "transparent";
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: 8, overflow: "hidden", flex: 1 }}>
                              <ProviderIcon provider={m.provider} size={14} />
                              <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
                                <span style={{ fontWeight: isSelected ? 600 : 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {m.name || m.id}
                                </span>
                                <span style={{ fontSize: 9, color: "var(--text-muted)", textTransform: "capitalize" }}>
                                  {m.provider}
                                </span>
                              </div>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                              {ctxStr && (
                                <span
                                  title={`Context window: ${m.contextWindow?.toLocaleString()} tokens`}
                                  style={{
                                    fontSize: 9,
                                    padding: "1px 4px",
                                    borderRadius: 3,
                                    background: "var(--bg-card)",
                                    border: "1px solid var(--border-subtle)",
                                    color: "var(--text-muted)",
                                    fontFamily: "var(--font-mono, monospace)",
                                  }}
                                >
                                  {ctxStr}
                                </span>
                              )}
                              {hasReasoning && (
                                <span
                                  title={`Supports reasoning (${modelLevels.filter((l) => l !== "off").join(", ")})`}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    color: "var(--accent-base)",
                                  }}
                                >
                                  <Brain size={12} />
                                </span>
                              )}
                              {isSelected && <Check size={12} color="var(--accent-base)" style={{ flexShrink: 0 }} />}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Dropdown footer with Manage Models shortcut */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "6px 10px",
                      borderTop: "1px solid var(--border-subtle)",
                      background: "var(--bg-card)",
                      fontSize: 10,
                      color: "var(--text-muted)",
                    }}
                  >
                    <span>
                      {visibleModels.length} of {baseModels.length} models active
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setModelPickerOpen(false);
                        useUi.getState().openSettings("models");
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 3,
                        background: "transparent",
                        border: "none",
                        color: "var(--accent-base)",
                        fontSize: 10,
                        cursor: "pointer",
                        padding: 0,
                        fontWeight: 500,
                      }}
                    >
                      <SlidersHorizontal size={10} />
                      <span>Manage...</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Dynamic Thinking picker */}
            <ThinkingPicker />

            {/* Context Ring */}
            <span style={{ flexShrink: 0, display: "inline-flex" }}>
            <ContextRing
              tokens={contextTokens}
              total={contextWindow}
              percent={contextPercent}
              onClick={() => useUi.getState().toggleRight("context")}
            />
            </span>
          </div>

          {/* Right: Send or Abort button */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
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
                  padding: "6px 14px",
                  borderRadius: 8,
                  border: "none",
                  background: canSend ? "var(--accent-base)" : "rgba(var(--fg-rgb), 0.06)",
                  color: canSend ? "var(--accent-contrast)" : "var(--text-muted)",
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
            background: "rgba(var(--fg-rgb), 0.02)",
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
