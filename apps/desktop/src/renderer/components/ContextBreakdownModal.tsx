import React from "react";
import { X, PieChart, Minimize2, CheckCircle2 } from "lucide-react";
import { useSessionStore } from "../store/session-store.ts";
import { estimateContextBreakdown } from "@pi-studio/pi-adapter";

interface ContextBreakdownModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ContextBreakdownModal: React.FC<ContextBreakdownModalProps> = ({ isOpen, onClose }) => {
  const { transcript, stats, selectedModel, activeKey } = useSessionStore();

  if (!isOpen) return null;

  const contextTokens = stats?.contextUsage?.tokens ?? transcript.lastUsage?.totalTokens ?? 0;
  const contextWindow = stats?.contextUsage?.contextWindow ?? selectedModel?.contextWindow ?? 200_000;
  const percent = stats?.contextUsage?.percent ?? (contextWindow > 0 ? (contextTokens / contextWindow) * 100 : 0);

  const breakdown = estimateContextBreakdown(transcript, contextTokens);

  const handleCompact = async () => {
    if (!activeKey) return;
    await window.studio.rpc(activeKey, { type: "compact" });
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.65)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      }}
    >
      <div
        style={{
          width: 520,
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-prominent)",
          borderRadius: 10,
          padding: 24,
          boxShadow: "0 16px 40px rgba(0,0,0,0.5)",
          display: "flex",
          flexDirection: "column",
          gap: 18,
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <PieChart size={18} color="var(--accent-base)" />
            <span style={{ fontSize: 16, fontWeight: 600 }}>Context Window Breakdown</span>
          </div>
          <button
            onClick={onClose}
            style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Big numbers */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{ fontSize: 24, fontWeight: 700, color: "var(--text-primary)" }}>
              {contextTokens.toLocaleString()}{" "}
              <span style={{ fontSize: 14, color: "var(--text-muted)", fontWeight: 400 }}>
                / {contextWindow.toLocaleString()} tokens
              </span>
            </span>
            <span style={{ fontSize: 18, fontWeight: 600, color: "var(--accent-base)" }}>
              {percent.toFixed(1)}%
            </span>
          </div>

          {/* Progress Bar */}
          <div
            style={{
              height: 10,
              background: "rgba(255, 255, 255, 0.08)",
              borderRadius: 5,
              overflow: "hidden",
              position: "relative",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${Math.min(100, percent)}%`,
                background:
                  percent > 80
                    ? "var(--danger)"
                    : percent > 50
                      ? "var(--warning)"
                      : "var(--success)",
                borderRadius: 5,
                transition: "width 0.3s ease",
              }}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-muted)" }}>
            <span>0</span>
            <span>Auto-compact threshold (~85%)</span>
            <span>{contextWindow > 1000 ? `${(contextWindow / 1000).toFixed(0)}k` : contextWindow}</span>
          </div>
        </div>

        {/* Category Breakdown list */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>
              Tokens By Category
            </span>
            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
              {breakdown.isExact ? "Total exact · categories estimated" : "Estimated"}
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 180, overflowY: "auto" }}>
            {breakdown.categories.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--text-muted)", padding: "12px 0", textAlign: "center" }}>
                Context is empty
              </div>
            ) : (
              breakdown.categories.map((cat) => (
                <div key={cat.label} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                    <span style={{ color: "var(--text-secondary)" }}>{cat.label}</span>
                    <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>
                      {cat.tokens.toLocaleString()} ({cat.percentage.toFixed(0)}%)
                    </span>
                  </div>
                  <div style={{ height: 4, background: "rgba(255, 255, 255, 0.05)", borderRadius: 2 }}>
                    <div
                      style={{
                        height: "100%",
                        width: `${Math.min(100, cat.percentage)}%`,
                        background: "var(--accent-base)",
                        borderRadius: 2,
                      }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Top consumers */}
        {breakdown.topItems.length > 0 && (
          <div>
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>
              Top Context Items
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
              {breakdown.topItems.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 11,
                    color: "var(--text-secondary)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                    {item.label}
                  </span>
                  <span>{item.tokens.toLocaleString()} tokens</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
          <button
            onClick={handleCompact}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "transparent",
              border: "1px solid var(--border-prominent)",
              color: "var(--text-secondary)",
              borderRadius: 6,
              padding: "6px 12px",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            <Minimize2 size={13} /> Compact Now
          </button>

          <button
            onClick={onClose}
            style={{
              padding: "6px 16px",
              borderRadius: 6,
              border: "none",
              background: "var(--accent-base)",
              color: "#fff",
              fontWeight: 500,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
