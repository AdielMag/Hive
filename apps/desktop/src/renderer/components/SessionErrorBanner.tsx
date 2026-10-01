import React, { useState } from "react";
import { AlertCircle, Copy, Check, X, ChevronDown, ChevronUp } from "lucide-react";
import { copyText } from "../lib/clipboard.ts";
import { useSessionStore } from "../store/session-store.ts";

export const SessionErrorBanner: React.FC<{ error: string }> = ({ error }) => {
  const clearError = useSessionStore((s) => s.clearError);
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const lines = error.split("\n");
  const hasMultipleLines = lines.length > 1 || error.length > 120;
  const firstLine = lines[0] ?? error;

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await copyText(error);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div
      className="session-error-banner"
      style={{
        display: "flex",
        flexDirection: "column",
        background: "rgba(229, 83, 75, 0.12)",
        borderBottom: "1px solid rgba(229, 83, 75, 0.35)",
        color: "var(--danger)",
        fontSize: 12,
        padding: "6px 12px",
        boxSizing: "border-box",
        position: "relative",
        zIndex: 5,
        animation: "errorSlideDown 0.18s ease-out",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
          <AlertCircle size={15} style={{ flexShrink: 0, color: "var(--danger)" }} />
          <div
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: expanded ? "normal" : "nowrap",
              fontFamily: "var(--font-mono)",
              fontSize: 11.5,
              fontWeight: 500,
              userSelect: "text",
            }}
            title={error}
          >
            {expanded ? error : firstLine}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {hasMultipleLines && (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                background: "rgba(229, 83, 75, 0.15)",
                border: "1px solid rgba(229, 83, 75, 0.25)",
                borderRadius: 4,
                color: "var(--danger)",
                padding: "2px 6px",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              <span>{expanded ? "Collapse" : "Details"}</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleCopy}
            title="Copy error details to clipboard"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              background: copied ? "var(--success)" : "rgba(229, 83, 75, 0.2)",
              border: `1px solid ${copied ? "var(--success)" : "rgba(229, 83, 75, 0.4)"}`,
              borderRadius: 4,
              color: copied ? "#fff" : "var(--danger)",
              padding: "2px 8px",
              fontSize: 11,
              fontWeight: 500,
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            {copied ? <Check size={11} /> : <Copy size={11} />}
            <span>{copied ? "Copied!" : "Copy Error"}</span>
          </button>

          {clearError && (
            <button
              type="button"
              onClick={clearError}
              title="Dismiss error"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                background: "transparent",
                border: "none",
                color: "var(--danger)",
                opacity: 0.8,
                padding: 3,
                cursor: "pointer",
                borderRadius: 3,
              }}
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
