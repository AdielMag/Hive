import React, { useRef } from "react";
import { Send, Square, CornerDownLeft } from "lucide-react";
import { useSessionStore } from "../store/session-store.ts";
import { ContextRing } from "./ContextRing.tsx";

export const Composer: React.FC = () => {
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
    stats,
    extensionWidgets,
  } = useSessionStore();

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isRunning = transcript.running;

  // Extension widgets placed above the editor
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

  // Context usage metrics
  const contextTokens = stats?.contextUsage?.tokens ?? transcript.lastUsage?.totalTokens ?? 0;
  const contextWindow = stats?.contextUsage?.contextWindow ?? selectedModel?.contextWindow ?? 200_000;
  const contextPercent = stats?.contextUsage?.percent ?? (contextWindow > 0 ? (contextTokens / contextWindow) * 100 : 0);

  return (
    <div
      style={{
        borderTop: "1px solid var(--border-subtle)",
        background: "var(--bg-app)",
        padding: "10px 16px 12px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
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

      {/* Editor Box */}
      <div
        style={{
          border: "1px solid var(--border-prominent)",
          borderRadius: 8,
          background: "var(--bg-input)",
          padding: "8px 10px",
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <textarea
          ref={textareaRef}
          value={promptText}
          onChange={(e) => setPromptText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isRunning ? "Type to steer (Ctrl+Enter) or queue (Enter)..." : "Ask Pi or issue a task..."}
          rows={3}
          style={{
            width: "100%",
            border: "none",
            background: "transparent",
            outline: "none",
            resize: "none",
            fontSize: 13,
            lineHeight: 1.4,
            color: "var(--text-primary)",
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
          }}
        >
          {/* Left: Model & Thinking & Context Ring */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {/* Model select */}
            <select
              value={selectedModel ? `${selectedModel.provider}/${selectedModel.id}` : ""}
              onChange={(e) => {
                const [provider, modelId] = e.target.value.split("/");
                if (provider && modelId) void setModel(provider, modelId);
              }}
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border-subtle)",
                borderRadius: 4,
                padding: "3px 8px",
                fontSize: 11,
                color: "var(--text-primary)",
                cursor: "pointer",
                maxWidth: 220,
              }}
            >
              {models.map((m) => (
                <option key={`${m.provider}/${m.id}`} value={`${m.provider}/${m.id}`}>
                  {m.name || m.id} ({m.provider})
                </option>
              ))}
            </select>

            {/* Thinking select */}
            {thinkingLevels.length > 0 && (
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
                {thinkingLevels.map((lvl) => (
                  <option key={lvl} value={lvl}>
                    thinking: {lvl}
                  </option>
                ))}
              </select>
            )}

            {/* Context Ring */}
            <ContextRing tokens={contextTokens} total={contextWindow} percent={contextPercent} />
          </div>

          {/* Right: Send or Abort button */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {isRunning ? (
              <>
                <button
                  onClick={() => void sendPrompt("steer")}
                  disabled={!promptText.trim()}
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
                    cursor: promptText.trim() ? "pointer" : "default",
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
                disabled={!promptText.trim()}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "5px 12px",
                  borderRadius: 4,
                  border: "none",
                  background: promptText.trim() ? "var(--accent-base)" : "var(--bg-card)",
                  color: promptText.trim() ? "#fff" : "var(--text-muted)",
                  fontWeight: 500,
                  cursor: promptText.trim() ? "pointer" : "default",
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
