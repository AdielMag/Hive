import React, { useState } from "react";
import { PieChart, Minimize2, Loader2, Sparkles, CheckCircle2, AlertTriangle, Layers, Info } from "lucide-react";
import { useSessionStore } from "../store/session-store.ts";
import { estimateContextBreakdown } from "@pi-studio/pi-adapter";
import { ProviderIcon } from "./ProviderIcon.tsx";

const CATEGORY_COLORS: Record<string, string> = {
  system: "#a855f7", // purple
  user: "#3b82f6", // blue
  assistant: "#10b981", // green
  tool: "#f59e0b", // amber/orange
  extension: "#ec4899", // pink
  summary: "#6b7280", // gray
};

export const ContextBreakdownPanel: React.FC = () => {
  const { transcript, stats, selectedModel, activeKey } = useSessionStore();
  const [compacting, setCompacting] = useState(false);
  const [compactDone, setCompactDone] = useState(false);

  const contextTokens = stats?.contextUsage?.tokens ?? transcript.lastUsage?.totalTokens ?? 0;
  const contextWindow = stats?.contextUsage?.contextWindow ?? selectedModel?.contextWindow ?? 200_000;
  const percent = stats?.contextUsage?.percent ?? (contextWindow > 0 ? (contextTokens / contextWindow) * 100 : 0);

  const breakdown = estimateContextBreakdown(transcript, contextTokens);

  const handleCompact = async () => {
    if (!activeKey || compacting) return;
    setCompacting(true);
    setCompactDone(false);
    try {
      await window.studio.rpc(activeKey, { type: "compact" });
      setCompactDone(true);
      setTimeout(() => setCompactDone(false), 3000);
    } catch (err) {
      console.error("Compaction failed:", err);
    } finally {
      setCompacting(false);
    }
  };

  const getUsageColor = (pct: number) => {
    if (pct > 80) return "var(--danger)";
    if (pct > 50) return "var(--warning)";
    return "var(--accent-base)";
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflowY: "auto",
        background: "var(--bg-sidebar)",
        color: "var(--text-primary)",
      }}
    >
      {/* Panel Header */}
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid var(--border-subtle)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <PieChart size={16} color="var(--accent-base)" />
          <span style={{ fontWeight: 600, fontSize: 13, letterSpacing: "-0.01em" }}>Context Breakdown</span>
        </div>
        <span
          style={{
            fontSize: 10,
            padding: "2px 6px",
            borderRadius: 4,
            background: breakdown.isExact ? "rgba(16, 185, 129, 0.12)" : "rgba(255, 255, 255, 0.06)",
            color: breakdown.isExact ? "var(--success)" : "var(--text-muted)",
            fontWeight: 500,
          }}
        >
          {breakdown.isExact ? "Exact Total" : "Estimated"}
        </span>
      </div>

      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 18 }}>
        {/* Token Usage Card */}
        <div
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 8,
            padding: 14,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "var(--font-mono)" }}>
                {contextTokens.toLocaleString()}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                of {contextWindow.toLocaleString()} max tokens
              </div>
            </div>
            <div
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: getUsageColor(percent),
                fontFamily: "var(--font-mono)",
              }}
            >
              {percent.toFixed(1)}%
            </div>
          </div>

          {/* Context Meter Bar */}
          <div
            style={{
              position: "relative",
              height: 8,
              background: "rgba(255, 255, 255, 0.08)",
              borderRadius: 4,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${Math.min(100, percent)}%`,
                background: getUsageColor(percent),
                borderRadius: 4,
                transition: "width 0.3s ease",
              }}
            />
          </div>

          {/* Threshold markers */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 10,
              color: "var(--text-muted)",
              marginTop: -2,
            }}
          >
            <span>0</span>
            <span style={{ color: percent >= 85 ? "var(--warning)" : "var(--text-muted)" }}>
              Auto-compact threshold: 85%
            </span>
            <span>{contextWindow >= 1000 ? `${Math.round(contextWindow / 1000)}k` : contextWindow}</span>
          </div>

          {/* Active Model Indicator */}
          {selectedModel && (
            <div
              style={{
                fontSize: 11,
                color: "var(--text-secondary)",
                borderTop: "1px solid var(--border-subtle)",
                paddingTop: 8,
                marginTop: 2,
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <span>Model Window</span>
              <span style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>
                <ProviderIcon provider={selectedModel.provider} size={12} />
                {selectedModel.name || selectedModel.id}
              </span>
            </div>
          )}
        </div>

        {/* Tokens By Category */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--text-secondary)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              By Category
            </span>
            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{breakdown.categories.length} sources</span>
          </div>

          {breakdown.categories.length === 0 ? (
            <div
              style={{
                padding: "20px 12px",
                textAlign: "center",
                color: "var(--text-muted)",
                fontSize: 12,
                background: "rgba(255, 255, 255, 0.02)",
                borderRadius: 6,
                border: "1px dashed var(--border-subtle)",
              }}
            >
              No context tokens recorded yet. Start a conversation or run tasks to view category breakdown.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {breakdown.categories.map((cat) => {
                const color = CATEGORY_COLORS[cat.category] || "var(--accent-base)";
                return (
                  <div
                    key={cat.label}
                    style={{
                      background: "rgba(255, 255, 255, 0.02)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: 6,
                      padding: "8px 10px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            background: color,
                            flexShrink: 0,
                          }}
                        />
                        <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-primary)" }}>{cat.label}</span>
                      </div>
                      <span
                        style={{
                          fontSize: 11,
                          fontFamily: "var(--font-mono)",
                          color: "var(--text-secondary)",
                        }}
                      >
                        {cat.tokens.toLocaleString()} ({cat.percentage.toFixed(0)}%)
                      </span>
                    </div>

                    <div
                      style={{
                        height: 4,
                        background: "rgba(255, 255, 255, 0.05)",
                        borderRadius: 2,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${Math.min(100, cat.percentage)}%`,
                          background: color,
                          borderRadius: 2,
                          transition: "width 0.3s ease",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Top Context Consumers */}
        {breakdown.topItems.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--text-secondary)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Top Offenders
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {breakdown.topItems.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    background: "rgba(255, 255, 255, 0.02)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: 6,
                    padding: "6px 10px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: 11,
                  }}
                >
                  <span
                    style={{
                      color: "var(--text-secondary)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      marginRight: 8,
                      flex: 1,
                    }}
                    title={item.label}
                  >
                    {item.label}
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      color: "var(--accent-hover)",
                      flexShrink: 0,
                    }}
                  >
                    ~{item.tokens.toLocaleString()} tokens
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
          <button
            onClick={handleCompact}
            disabled={compacting || !activeKey}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              padding: "8px 14px",
              borderRadius: 6,
              border: "1px solid var(--border-prominent)",
              background: compactDone
                ? "rgba(16, 185, 129, 0.12)"
                : compacting
                  ? "rgba(255, 255, 255, 0.05)"
                  : "var(--bg-elevated)",
              color: compactDone ? "var(--success)" : "var(--text-primary)",
              fontSize: 12,
              fontWeight: 500,
              cursor: compacting || !activeKey ? "not-allowed" : "pointer",
              transition: "all 0.15s ease",
            }}
          >
            {compacting ? (
              <>
                <Loader2 size={14} className="spin" />
                Compacting Session...
              </>
            ) : compactDone ? (
              <>
                <CheckCircle2 size={14} color="var(--success)" />
                Session Compacted
              </>
            ) : (
              <>
                <Minimize2 size={14} color="var(--accent-base)" />
                Compact Context Now
              </>
            )}
          </button>
          <div style={{ fontSize: 10, color: "var(--text-muted)", textAlign: "center" }}>
            Compacting summarizes previous turns while preserving key instructions.
          </div>
        </div>
      </div>
    </div>
  );
};
