import React, { useMemo, useState } from "react";
import { Minimize2, Loader2, CheckCircle2, Info, Brain } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useSessionStore } from "../store/session-store.ts";
import { estimateContextBreakdown, type ContextCategory, type ContextBreakdownResult } from "@hive/pi-adapter";
import { ProviderIcon } from "./ProviderIcon.tsx";
import { getSupportedThinkingLevels } from "../lib/models/thinking.ts";

export const CATEGORY_COLORS: Record<ContextCategory, string> = {
  system: "#a78bfa",
  user: "#60a5fa",
  assistant: "#34d399",
  thinking: "#2dd4bf",
  tool: "#fbbf24",
  extension: "#f472b6",
  summary: "#94a3b8",
};

const TOOL_SHADES = ["#fbbf24", "#fb923c", "#f59e0b", "#facc15", "#fdba74", "#eab308"];
const AUTO_COMPACT_PCT = 85;

const fmtK = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}K`;
  return String(n);
};

const usageColor = (pct: number) =>
  pct >= AUTO_COMPACT_PCT ? "var(--danger)" : pct >= 60 ? "var(--warning)" : "var(--success)";

export interface ContextBreakdownData {
  breakdown: ContextBreakdownResult;
  contextTokens: number;
  contextWindow: number;
  percent: number;
}

/** Shared data source so the composer ring, panel and modal all agree on the same numbers. */
export function useContextBreakdown(): ContextBreakdownData {
  const { transcript, stats, selectedModel } = useSessionStore(
    useShallow((s) => ({ transcript: s.transcript, stats: s.stats, selectedModel: s.selectedModel })),
  );
  const contextTokens = stats?.contextUsage?.tokens ?? transcript.lastUsage?.totalTokens ?? 0;
  const contextWindow = selectedModel?.contextWindow ?? stats?.contextUsage?.contextWindow ?? 200_000;
  const breakdown = useMemo(() => estimateContextBreakdown(transcript, contextTokens), [transcript, contextTokens]);
  const tokens = contextTokens > 0 ? contextTokens : breakdown.totalTokens;
  const percent = contextWindow > 0 ? (tokens / contextWindow) * 100 : 0;
  return { breakdown, contextTokens: tokens, contextWindow, percent };
}

function colorFor(key: string, category: ContextCategory, toolIndex: Map<string, number>): string {
  if (category !== "tool") return CATEGORY_COLORS[category];
  const i = toolIndex.get(key) ?? 0;
  return TOOL_SHADES[i % TOOL_SHADES.length]!;
}

const SectionTitle: React.FC<{ children: React.ReactNode; right?: React.ReactNode }> = ({ children, right }) => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
    <span
      style={{
        fontSize: 10.5,
        fontWeight: 600,
        color: "var(--text-muted)",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
      }}
    >
      {children}
    </span>
    {right && <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>{right}</span>}
  </div>
);

export const ContextBreakdownView: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { selectedModel, activeKey } = useSessionStore(
    useShallow((s) => ({ selectedModel: s.selectedModel, activeKey: s.activeKey })),
  );
  const { breakdown, contextTokens, contextWindow, percent } = useContextBreakdown();
  const [compacting, setCompacting] = useState(false);
  const [compactDone, setCompactDone] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);

  const toolIndex = useMemo(() => {
    const m = new Map<string, number>();
    breakdown.categories.filter((c) => c.category === "tool").forEach((c, i) => m.set(c.key, i));
    return m;
  }, [breakdown]);

  const free = Math.max(0, contextWindow - contextTokens);
  const color = usageColor(percent);
  const empty = breakdown.categories.length === 0;

  const handleCompact = async () => {
    if (!activeKey || compacting) return;
    setCompacting(true);
    setCompactDone(false);
    try {
      const res = await window.studio.rpc(activeKey, { type: "compact" });
      if (res.ok) {
        setCompactDone(true);
        setTimeout(() => setCompactDone(false), 3000);
      }
    } catch (err) {
      console.error("Compaction failed:", err);
    } finally {
      setCompacting(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: compact ? 16 : 20 }}>
      {/* ── Usage summary ─────────────────────────────────────────── */}
      <div
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border-subtle)",
          borderRadius: 10,
          padding: 14,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
              <span
                style={{
                  fontSize: 24,
                  fontWeight: 700,
                  fontFamily: "var(--font-mono)",
                  letterSpacing: "-0.02em",
                  color: "var(--text-primary)",
                }}
              >
                {fmtK(contextTokens)}
              </span>
              <span style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                / {fmtK(contextWindow)} tokens
              </span>
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
              {fmtK(free)} free · {breakdown.isExact ? "reported by model" : "estimated"}
            </div>
          </div>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              fontFamily: "var(--font-mono)",
              color,
              background: `color-mix(in srgb, ${color} 14%, transparent)`,
              border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
              padding: "3px 8px",
              borderRadius: 999,
              flexShrink: 0,
            }}
          >
            {percent.toFixed(percent < 10 ? 1 : 0)}%
          </span>
        </div>

        {/* Stacked bar: each segment is a category's share of the whole window */}
        <div style={{ position: "relative" }}>
          <div
            style={{
              display: "flex",
              height: 10,
              borderRadius: 5,
              overflow: "hidden",
              background: "rgba(var(--fg-rgb), 0.07)",
              gap: 1,
            }}
          >
            {breakdown.categories.map((c) => {
              const w = contextWindow > 0 ? (c.tokens / contextWindow) * 100 : 0;
              const segColor = colorFor(c.key, c.category, toolIndex);
              return (
                <div
                  key={c.key}
                  title={`${c.label}: ${c.tokens.toLocaleString()} tokens`}
                  onMouseEnter={() => setHovered(c.key)}
                  onMouseLeave={() => setHovered(null)}
                  style={{
                    width: `${w}%`,
                    minWidth: w > 0 ? 2 : 0,
                    background: segColor,
                    opacity: hovered && hovered !== c.key ? 0.35 : 1,
                    transition: "width 0.3s ease, opacity 0.15s ease",
                  }}
                />
              );
            })}
          </div>
          {/* auto-compact marker */}
          <div
            title={`Auto-compact at ${AUTO_COMPACT_PCT}%`}
            style={{
              position: "absolute",
              left: `${AUTO_COMPACT_PCT}%`,
              top: -3,
              bottom: -3,
              width: 2,
              borderRadius: 1,
              background: percent >= AUTO_COMPACT_PCT ? "var(--danger)" : "rgba(var(--fg-rgb), 0.35)",
            }}
          />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-muted)", marginTop: -4 }}>
          <span>0</span>
          <span>auto-compacts at {AUTO_COMPACT_PCT}%</span>
          <span>{fmtK(contextWindow)}</span>
        </div>

        {selectedModel && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              fontSize: 11,
              color: "var(--text-muted)",
              borderTop: "1px solid var(--border-subtle)",
              paddingTop: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span>Model</span>
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  color: "var(--text-secondary)",
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                  textOverflow: "ellipsis",
                }}
              >
                <ProviderIcon provider={selectedModel.provider} size={12} />
                {selectedModel.name || selectedModel.id}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span>Context size</span>
              <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>
                {contextWindow.toLocaleString()} tokens ({fmtK(contextWindow)})
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span>Thinking levels</span>
              <span style={{ color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 4 }}>
                {(() => {
                  const levels = getSupportedThinkingLevels(selectedModel);
                  const hasReasoning = Boolean(selectedModel.reasoning) && levels.some((l) => l !== "off");
                  if (!hasReasoning) return <span style={{ color: "var(--text-muted)" }}>Not supported</span>;
                  return (
                    <>
                      <Brain size={11} style={{ color: "var(--accent-base)" }} />
                      <span>{levels.filter((l) => l !== "off").join(", ")}</span>
                    </>
                  );
                })()}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── Categories ────────────────────────────────────────────── */}
      <div>
        <SectionTitle right={empty ? undefined : `${breakdown.categories.length} sources`}>What's using it</SectionTitle>
        {empty ? (
          <div
            style={{
              padding: "22px 14px",
              textAlign: "center",
              color: "var(--text-muted)",
              fontSize: 12,
              lineHeight: 1.5,
              borderRadius: 8,
              border: "1px dashed var(--border-subtle)",
            }}
          >
            Nothing in context yet.
            <br />
            Send a message to see how the window fills up.
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              border: "1px solid var(--border-subtle)",
              borderRadius: 8,
              overflow: "hidden",
            }}
          >
            {breakdown.categories.map((c, i) => {
              const segColor = colorFor(c.key, c.category, toolIndex);
              const isHover = hovered === c.key;
              return (
                <div
                  key={c.key}
                  onMouseEnter={() => setHovered(c.key)}
                  onMouseLeave={() => setHovered(null)}
                  style={{
                    padding: "8px 10px",
                    borderTop: i === 0 ? "none" : "1px solid var(--border-subtle)",
                    background: isHover ? "rgba(var(--fg-rgb), 0.04)" : "transparent",
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    transition: "background 0.12s ease",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: segColor, flexShrink: 0 }} />
                    <span
                      style={{
                        fontSize: 12,
                        color: "var(--text-primary)",
                        flex: 1,
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {c.label}
                      {c.count > 1 && (
                        <span style={{ marginLeft: 6, fontSize: 10.5, color: "var(--text-muted)" }}>×{c.count}</span>
                      )}
                    </span>
                    <span style={{ fontSize: 11.5, fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>
                      {fmtK(c.tokens)}
                    </span>
                    <span
                      style={{
                        fontSize: 10.5,
                        fontFamily: "var(--font-mono)",
                        color: "var(--text-muted)",
                        width: 34,
                        textAlign: "right",
                      }}
                    >
                      {c.percentage < 1 ? "<1" : c.percentage.toFixed(0)}%
                    </span>
                  </div>
                  <div style={{ height: 3, borderRadius: 2, background: "rgba(var(--fg-rgb), 0.05)", overflow: "hidden" }}>
                    <div
                      style={{
                        height: "100%",
                        width: `${Math.min(100, c.percentage)}%`,
                        background: segColor,
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
        {breakdown.categories.some((c) => c.key === "system") && (
          <div style={{ display: "flex", gap: 6, marginTop: 8, fontSize: 10.5, color: "var(--text-muted)", lineHeight: 1.45 }}>
            <Info size={12} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              System prompt & tools covers instructions, tool definitions and context files (AGENTS.md, skills). Those
              aren't shown in the transcript, so their size is the total minus the estimated message sizes.
            </span>
          </div>
        )}
      </div>

      {/* ── Largest items ─────────────────────────────────────────── */}
      {breakdown.topItems.length > 0 && (
        <div>
          <SectionTitle>Largest items</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {breakdown.topItems.map((item, idx) => (
              <div
                key={idx}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 8px",
                  borderRadius: 6,
                  fontSize: 11.5,
                }}
                title={item.detail ? `${item.label}: ${item.detail}` : item.label}
              >
                <span
                  style={{ width: 6, height: 6, borderRadius: "50%", background: CATEGORY_COLORS[item.category], flexShrink: 0 }}
                />
                <span style={{ color: "var(--text-primary)", fontWeight: 500, flexShrink: 0 }}>{item.label}</span>
                <span
                  style={{
                    color: "var(--text-muted)",
                    flex: 1,
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    fontFamily: item.category === "tool" ? "var(--font-mono)" : undefined,
                    fontSize: item.category === "tool" ? 10.5 : 11.5,
                  }}
                >
                  {item.detail ?? ""}
                </span>
                <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)", flexShrink: 0 }}>
                  ~{fmtK(item.tokens)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Compact ───────────────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <button
          onClick={handleCompact}
          disabled={compacting || !activeKey || empty}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: "8px 14px",
            borderRadius: 8,
            border: "1px solid var(--border-prominent)",
            background: compactDone ? "color-mix(in srgb, var(--success) 12%, transparent)" : "var(--bg-elevated)",
            color: compactDone ? "var(--success)" : "var(--text-primary)",
            fontSize: 12,
            fontWeight: 500,
            cursor: compacting || !activeKey || empty ? "not-allowed" : "pointer",
            opacity: !activeKey || empty ? 0.55 : 1,
            transition: "all 0.15s ease",
          }}
        >
          {compacting ? (
            <>
              <Loader2 size={14} className="spin" /> Compacting…
            </>
          ) : compactDone ? (
            <>
              <CheckCircle2 size={14} /> Compacted
            </>
          ) : (
            <>
              <Minimize2 size={14} color="var(--accent-base)" /> Compact now
            </>
          )}
        </button>
        <div style={{ fontSize: 10.5, color: "var(--text-muted)", textAlign: "center" }}>
          Summarizes earlier turns to free up space.
        </div>
      </div>
    </div>
  );
};
