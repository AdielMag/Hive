import React, { useState } from "react";
import { AlertCircle, Copy, Check, X, ChevronDown, ChevronUp, RotateCw } from "lucide-react";
import { copyText } from "../lib/clipboard.ts";
import { useSessionStore } from "../store/session-store.ts";
import { detectAuthError } from "../lib/auth-errors.ts";
import { summarizeError } from "../lib/error-summary.ts";
import { AuthErrorActions } from "./AuthErrorActions.tsx";

export const SessionErrorBanner: React.FC<{ error: string }> = ({ error }) => {
  const clearError = useSessionStore((s) => s.clearError);
  const activeProvider = useSessionStore((s) => s.selectedModel?.provider);
  const auth = detectAuthError(error, activeProvider);
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const activeKey = useSessionStore((s) => s.activeKey);
  const compactSession = useSessionStore((s) => s.compactSession);
  const retryLastMessage = useSessionStore((s) => s.retryLastMessage);
  const { headline, action } = summarizeError(error);
  const [compacting, setCompacting] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const canCompact = action === "compact" && !auth && !!activeKey;
  const canRetry = action === "retry" && !auth;

  const handleRetry = async () => {
    if (retrying) return;
    setRetrying(true);
    try {
      await retryLastMessage();
    } finally {
      setRetrying(false);
    }
  };

  const handleCompact = async () => {
    if (!activeKey || compacting) return;
    setCompacting(true);
    try {
      await compactSession(activeKey);
    } finally {
      setCompacting(false);
    }
  };

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
            style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13, fontWeight: 500, userSelect: "text" }}
          >
            {headline}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {auth && <AuthErrorActions auth={auth} tone="banner" />}
          {canRetry && (
            <button
              type="button"
              onClick={() => void handleRetry()}
              disabled={retrying}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                background: "rgba(229, 83, 75, 0.25)",
                border: "1px solid rgba(229, 83, 75, 0.5)",
                borderRadius: 4,
                color: "var(--danger)",
                padding: "2px 8px",
                fontSize: 11,
                fontWeight: 600,
                cursor: retrying ? "default" : "pointer",
              }}
            >
              <RotateCw size={11} className={retrying ? "spin" : undefined} />
              <span>{retrying ? "Retrying…" : "Retry"}</span>
            </button>
          )}
          {canCompact && (
            <button
              type="button"
              onClick={() => void handleCompact()}
              disabled={compacting}
              style={{
                background: "rgba(229, 83, 75, 0.2)",
                border: "1px solid rgba(229, 83, 75, 0.4)",
                borderRadius: 4,
                color: "var(--danger)",
                padding: "2px 8px",
                fontSize: 11,
                fontWeight: 500,
                cursor: compacting ? "default" : "pointer",
              }}
            >
              {compacting ? "Compacting…" : "Compact conversation"}
            </button>
          )}
          {(
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
              <span>Details</span>
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
              transition: "background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease",
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
      {expanded && (
        <pre
          style={{
            margin: "6px 0 2px 23px",
            maxHeight: 160,
            overflow: "auto",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--text-muted)",
            userSelect: "text",
          }}
        >
          {error}
        </pre>
      )}
    </div>
  );
};
