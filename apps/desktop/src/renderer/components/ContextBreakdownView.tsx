import React, { useEffect, useMemo, useRef, useState } from "react";
import { Minimize2, Loader2, CheckCircle2, Info, Brain, ChevronRight, Sparkles } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { applyCompactionResult, useSessionStore, type CompactionOutcome } from "../store/session-store.ts";
import {
  estimateContextBreakdown,
  type ContextBreakdownNode,
  type ContextBreakdownResult,
  type ContextCategory,
  type ContextSystemParts,
} from "@hive/pi-adapter";
import type { ContextFileInfo } from "@hive/protocol";
import { useActiveRegistry } from "../store/ai-registry-store.ts";
import { ProviderIcon } from "./ProviderIcon.tsx";
import { getSupportedThinkingLevels } from "../lib/models/thinking.ts";
import "../styles/context-panel.css";

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
const SYSTEM_NOTE =
  "Instructions, tool definitions and context files (AGENTS.md, skills). They aren't in the transcript, so their size is the total minus the estimated message sizes. Expand the row for an estimated split; \"Base prompt & other\" is whatever the known parts don't explain.";

const fmtK = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}K`;
  return String(Math.round(n));
};

const fmtPct = (p: number) => (p > 0 && p < 1 ? "<1" : p.toFixed(p < 10 ? 1 : 0));

export interface ContextBreakdownData {
  breakdown: ContextBreakdownResult;
  contextTokens: number;
  contextWindow: number;
  percent: number;
}

/** Sizes of AGENTS.md / SYSTEM.md style files for `cwd`; fetched once per cwd (they rarely change). */
const contextFilesCache = new Map<string, { at: number; files: ContextFileInfo[] }>();
const CONTEXT_FILES_TTL_MS = 15_000;

const NO_CONTEXT_FILES: ContextFileInfo[] = [];
const contextFilesInFlight = new Map<string, Promise<ContextFileInfo[]>>();

function fetchContextFiles(cwd: string | undefined, cacheKey: string): Promise<ContextFileInfo[]> {
  const pending = contextFilesInFlight.get(cacheKey);
  if (pending) return pending;
  const p = window
    .studio!.getContextFiles(cwd)
    .then((res) => {
      contextFilesCache.set(cacheKey, { at: Date.now(), files: res });
      return res;
    })
    .finally(() => contextFilesInFlight.delete(cacheKey));
  contextFilesInFlight.set(cacheKey, p);
  return p;
}

function useContextFiles(cwd: string | undefined, refreshToken: unknown): ContextFileInfo[] {
  const cacheKey = cwd ?? "";
  const [files, setFiles] = useState<ContextFileInfo[]>(
    () => contextFilesCache.get(cacheKey)?.files ?? NO_CONTEXT_FILES,
  );
  useEffect(() => {
    const cached = contextFilesCache.get(cacheKey);
    setFiles(cached?.files ?? NO_CONTEXT_FILES);
    if (cached && Date.now() - cached.at < CONTEXT_FILES_TTL_MS) return;
    if (!window.studio?.getContextFiles) return;
    let cancelled = false;
    fetchContextFiles(cwd, cacheKey)
      .then((res) => {
        if (!cancelled) setFiles(res);
      })
      .catch(() => {
        /* The breakdown still works without the file sizes. */
      });
    return () => {
      cancelled = true;
    };
  }, [cacheKey, cwd, refreshToken]);
  return files;
}

/** Shared data source so the composer ring and the side panel agree on the same numbers. */
export function useContextBreakdown(): ContextBreakdownData {
  const { transcript, stats, selectedModel } = useSessionStore(
    useShallow((s) => ({
      transcript: s.transcript,
      stats: s.stats,
      selectedModel: s.selectedModel,
    })),
  );
  const registry = useActiveRegistry();
  // Re-check the file sizes (TTL-gated) whenever the conversation grows, so AGENTS.md edits show up.
  const contextFiles = useContextFiles(registry?.cwd, transcript.lastUsage);
  const systemParts = useMemo<ContextSystemParts | null>(() => {
    if (!registry && contextFiles.length === 0) return null;
    return {
      skills: registry?.skills,
      tools: registry?.tools,
      contextFiles: contextFiles.map((f) => ({
        label: f.label,
        path: f.path,
        chars: f.chars,
      })),
    };
  }, [registry, contextFiles]);
  const contextTokens = stats?.contextUsage?.tokens ?? transcript.lastUsage?.totalTokens ?? 0;
  const contextWindow = selectedModel?.contextWindow ?? stats?.contextUsage?.contextWindow ?? 200_000;
  const breakdown = useMemo(
    // Only subdivide the system residual once Pi reports an exact total; before that the view stays as it was.
    () => estimateContextBreakdown(transcript, contextTokens, contextTokens > 0 ? systemParts : null),
    [transcript, contextTokens, systemParts],
  );
  const tokens = contextTokens > 0 ? contextTokens : breakdown.totalTokens;
  const percent = contextWindow > 0 ? (tokens / contextWindow) * 100 : 0;
  return { breakdown, contextTokens: tokens, contextWindow, percent };
}

function colorFor(key: string, category: ContextCategory, toolIndex: Map<string, number>): string {
  if (category !== "tool") return CATEGORY_COLORS[category];
  const i = toolIndex.get(key) ?? 0;
  return TOOL_SHADES[i % TOOL_SHADES.length]!;
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Eases a number toward its target so totals "count up" instead of jumping. */
function useAnimatedNumber(target: number, duration = 650): number {
  const [value, setValue] = useState(prefersReducedMotion() ? target : 0);
  const fromRef = useRef(value);
  useEffect(() => {
    if (prefersReducedMotion()) {
      setValue(target);
      fromRef.current = target;
      return;
    }
    const from = fromRef.current;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const v = from + (target - from) * eased;
      fromRef.current = v;
      setValue(v);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

/** Flips to true one frame after mount so CSS transitions can animate from an empty state. */
function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  return mounted;
}

interface Segment {
  key: string;
  label: string;
  color: string;
  frac: number;
  share: number;
}

const Donut: React.FC<{
  segments: Segment[];
  percent: number;
  hovered: string | null;
  onHover(key: string | null): void;
}> = ({ segments, percent, hovered, onHover }) => {
  const size = 116;
  const stroke = 11;
  const r = (size - stroke) / 2;
  const c = size / 2;
  const circ = 2 * Math.PI * r;
  const mounted = useMounted();
  const shownPct = useAnimatedNumber(percent);
  const gap = segments.length > 1 ? 2 : 0;

  let cursor = 0;
  const arcs = segments.map((s) => {
    const frac = Math.max(0, Math.min(s.frac, 1 - cursor));
    const len = Math.max(0, frac * circ - gap);
    const arc = {
      ...s,
      start: cursor * circ,
      len: frac > 0 ? Math.max(len, 1.5) : 0,
    };
    cursor += frac;
    return arc;
  });

  const tickAngle = (AUTO_COMPACT_PCT / 100) * 2 * Math.PI;
  const t1 = r - stroke / 2 - 3;
  const t2 = r + stroke / 2 + 3;
  const hover = hovered ? segments.find((s) => s.key === hovered) : undefined;

  return (
    <div className="ctx-donut" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={c} cy={c} r={r} fill="none" stroke="var(--ctx-track)" strokeWidth={stroke} />
        {arcs.map((a) => (
          <circle
            key={a.key}
            className={`ctx-donut__seg${hovered && hovered !== a.key ? " is-dim" : ""}`}
            cx={c}
            cy={c}
            r={r}
            stroke={a.color}
            style={{
              strokeWidth: hovered === a.key ? stroke + 4 : stroke,
              strokeDasharray: `${mounted ? a.len : 0} ${circ}`,
              strokeDashoffset: mounted ? -a.start : 0,
            }}
            onMouseEnter={() => onHover(a.key)}
            onMouseLeave={() => onHover(null)}
          >
            <title>{`${a.label}: ${fmtPct(a.share)}% of used context`}</title>
          </circle>
        ))}
        <line
          className={`ctx-donut__tick${percent >= AUTO_COMPACT_PCT ? " is-hit" : ""}`}
          x1={c + Math.cos(tickAngle) * t1}
          y1={c + Math.sin(tickAngle) * t1}
          x2={c + Math.cos(tickAngle) * t2}
          y2={c + Math.sin(tickAngle) * t2}
        >
          <title>{`Auto-compacts at ${AUTO_COMPACT_PCT}%`}</title>
        </line>
      </svg>
      <div className="ctx-donut__center">
        {hover ? (
          <>
            <span className="ctx-donut__pct" style={{ color: hover.color }}>
              {fmtPct(hover.share)}
              <small>%</small>
            </span>
            <span className="ctx-donut__label">{hover.label}</span>
          </>
        ) : (
          <>
            <span className="ctx-donut__pct">
              {fmtPct(shownPct)}
              <small>%</small>
            </span>
            <span className="ctx-donut__label">used</span>
          </>
        )}
      </div>
    </div>
  );
};

/** Nested, collapsible split of a category (skills, tool calls vs results, …). */
const SubRows: React.FC<{
  nodes: ContextBreakdownNode[];
  color: string;
  depth: number;
  expanded: Set<string>;
  onToggle(key: string): void;
}> = ({ nodes, color, depth, expanded, onToggle }) => (
  <div className="ctx-sub" style={{ ["--c" as string]: color, ["--depth" as string]: depth }}>
    {nodes.map((n) => {
      const hasKids = Boolean(n.children?.length);
      const open = hasKids && expanded.has(n.key);
      const title = [n.detail, `${n.tokens.toLocaleString()} tokens`].filter(Boolean).join(" — ");
      return (
        <React.Fragment key={n.key}>
          <div
            className={`ctx-subrow${hasKids ? " is-expandable" : ""}`}
            title={title}
            role={hasKids ? "button" : undefined}
            tabIndex={hasKids ? 0 : undefined}
            aria-expanded={hasKids ? open : undefined}
            onClick={hasKids ? () => onToggle(n.key) : undefined}
            onKeyDown={
              hasKids
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onToggle(n.key);
                    }
                  }
                : undefined
            }
          >
            <span className="ctx-subrow__label">
              {hasKids ? (
                <ChevronRight size={11} className={`ctx-chevron${open ? " is-open" : ""}`} />
              ) : (
                <span className="ctx-subrow__spacer" />
              )}
              <span className="ctx-subrow__name">{n.label}</span>
              {n.count != null && n.count > 1 && <span className="ctx-row__count">×{n.count}</span>}
            </span>
            <span className="ctx-row__tokens">{fmtK(n.tokens)}</span>
            <span className="ctx-row__pct">{fmtPct(n.percentage)}%</span>
            <div className="ctx-subrow__bar">
              <div style={{ width: `${Math.min(100, n.percentage)}%` }} />
            </div>
          </div>
          {open && n.children && (
            <SubRows nodes={n.children} color={color} depth={depth + 1} expanded={expanded} onToggle={onToggle} />
          )}
        </React.Fragment>
      );
    })}
  </div>
);

export const ContextBreakdownView: React.FC<{ data: ContextBreakdownData }> = ({ data }) => {
  const { selectedModel, activeKey } = useSessionStore(
    useShallow((s) => ({
      selectedModel: s.selectedModel,
      activeKey: s.activeKey,
    })),
  );
  const { breakdown, contextTokens, contextWindow, percent } = data;
  const [compacting, setCompacting] = useState(false);
  const [compactDone, setCompactDone] = useState(false);
  const [compactResult, setCompactResult] = useState<CompactionOutcome | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [showItems, setShowItems] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const toggleExpanded = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const shownTokens = useAnimatedNumber(contextTokens);

  const toolIndex = useMemo(() => {
    const m = new Map<string, number>();
    breakdown.categories.filter((c) => c.category === "tool").forEach((c, i) => m.set(c.key, i));
    return m;
  }, [breakdown]);

  const segments: Segment[] = useMemo(
    () =>
      breakdown.categories.map((c) => ({
        key: c.key,
        label: c.label,
        color: colorFor(c.key, c.category, toolIndex),
        frac: contextWindow > 0 ? c.tokens / contextWindow : 0,
        share: c.percentage,
      })),
    [breakdown, toolIndex, contextWindow],
  );

  const free = Math.max(0, contextWindow - contextTokens);
  const empty = breakdown.categories.length === 0;
  const status =
    percent >= AUTO_COMPACT_PCT
      ? { label: "Near auto-compact", color: "var(--danger)", hot: true }
      : percent >= 60
        ? { label: "Filling up", color: "var(--warning)", hot: false }
        : { label: "Plenty of room", color: "var(--success)", hot: false };

  const levels = selectedModel ? getSupportedThinkingLevels(selectedModel).filter((l) => l !== "off") : [];
  const hasReasoning = Boolean(selectedModel?.reasoning) && levels.length > 0;

  const handleCompact = async () => {
    if (!activeKey || compacting) return;
    setCompacting(true);
    setCompactDone(false);
    try {
      const res = await window.studio.rpc(activeKey, { type: "compact" });
      if (res.ok) {
        setCompactResult(await applyCompactionResult(activeKey, res.data));
        setCompactDone(true);
        setTimeout(() => setCompactDone(false), 8000);
      }
    } catch (err) {
      console.error("Compaction failed:", err);
    } finally {
      setCompacting(false);
    }
  };

  const compactDisabled = compacting || !activeKey || empty;

  return (
    <>
      {/* ── Hero: gauge + totals ─────────────────────────────────── */}
      <section className="ctx-hero">
        <div className="ctx-hero__top">
          <Donut segments={segments} percent={percent} hovered={hovered} onHover={setHovered} />
          <div className="ctx-hero__stats">
            <span className="ctx-hero__tokens">{fmtK(shownTokens)}</span>
            <span className="ctx-hero__of">of {fmtK(contextWindow)} tokens</span>
            <span
              className={`ctx-hero__status${status.hot ? " is-hot" : ""}`}
              style={{ ["--ctx-status" as string]: status.color }}
              title={`Auto-compacts at ${AUTO_COMPACT_PCT}%`}
            >
              <span className="ctx-hero__status-dot" />
              {status.label}
            </span>
            <span className="ctx-hero__free">{fmtK(free)} free</span>
          </div>
        </div>

        {selectedModel && (
          <div className="ctx-hero__model">
            <ProviderIcon provider={selectedModel.provider} size={13} />
            <span className="ctx-hero__model-name" title={selectedModel.name || selectedModel.id}>
              {selectedModel.name || selectedModel.id}
            </span>
            {hasReasoning && (
              <span className="ctx-hero__reasoning" title={`Thinking levels: ${levels.join(", ")}`}>
                <Brain size={11} style={{ color: "var(--accent-base)" }} />
                reasoning
              </span>
            )}
          </div>
        )}

        <button
          className={`ctx-compact${compactDone ? " is-done" : percent >= 60 && !compactDisabled ? " is-urgent" : ""}`}
          onClick={handleCompact}
          disabled={compactDisabled}
          title="Summarizes earlier turns to free up space"
        >
          {compacting ? (
            <>
              <Loader2 size={14} className="spin" /> Compacting…
            </>
          ) : compactDone ? (
            <>
              <CheckCircle2 size={14} /> Compacted
              {compactResult &&
                ` · ${fmtK(compactResult.tokensBefore)} → ${compactResult.tokensAfter != null ? `~${fmtK(compactResult.tokensAfter)}` : "?"}`}
            </>
          ) : (
            <>
              <Minimize2 size={14} color="var(--accent-base)" /> Compact now
            </>
          )}
        </button>
      </section>

      {/* ── Breakdown ────────────────────────────────────────────── */}
      {empty ? (
        <div className="ctx-empty">
          <Sparkles size={18} />
          <span>
            Nothing in context yet.
            <br />
            Send a message to see how the window fills up.
          </span>
        </div>
      ) : (
        <section className="ctx-section">
          <div className="ctx-section__head">
            <span>Breakdown</span>
            <span>{breakdown.categories.length} sources</span>
          </div>
          <div>
            {segments.map((s, i) => {
              const cat = breakdown.categories[i]!;
              const hasKids = Boolean(cat.children?.length);
              const open = hasKids && expanded.has(s.key);
              return (
                <React.Fragment key={s.key}>
                  <div
                    className={`ctx-row${hovered === s.key ? " is-active" : ""}${hasKids ? " is-expandable" : ""}`}
                    style={{ ["--c" as string]: s.color, ["--i" as string]: i }}
                    onMouseEnter={() => setHovered(s.key)}
                    onMouseLeave={() => setHovered(null)}
                    title={`${cat.tokens.toLocaleString()} tokens`}
                    role={hasKids ? "button" : undefined}
                    tabIndex={hasKids ? 0 : undefined}
                    aria-expanded={hasKids ? open : undefined}
                    onClick={hasKids ? () => toggleExpanded(s.key) : undefined}
                    onKeyDown={
                      hasKids
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              toggleExpanded(s.key);
                            }
                          }
                        : undefined
                    }
                  >
                    <span className="ctx-row__dot" />
                    <span className="ctx-row__label">
                      {hasKids && <ChevronRight size={12} className={`ctx-chevron${open ? " is-open" : ""}`} />}
                      <span>{s.label}</span>
                      {cat.count > 1 && <span className="ctx-row__count">×{cat.count}</span>}
                      {s.key === "system" && (
                        <span className="ctx-row__info" title={SYSTEM_NOTE}>
                          <Info size={12} />
                        </span>
                      )}
                    </span>
                    <span className="ctx-row__tokens">{fmtK(cat.tokens)}</span>
                    <span className="ctx-row__pct">{fmtPct(s.share)}%</span>
                    <div className="ctx-row__bar">
                      <div style={{ width: `${Math.min(100, s.share)}%` }} />
                    </div>
                  </div>
                  {open && cat.children && (
                    <SubRows
                      nodes={cat.children}
                      color={s.color}
                      depth={0}
                      expanded={expanded}
                      onToggle={toggleExpanded}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Largest items (collapsed by default) ─────────────────── */}
      {breakdown.topItems.length > 0 && (
        <section className="ctx-section" style={{ animationDelay: "0.12s" }}>
          <button className="ctx-section__head" onClick={() => setShowItems((v) => !v)} aria-expanded={showItems}>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <ChevronRight size={12} className={`ctx-chevron${showItems ? " is-open" : ""}`} />
              Largest items
            </span>
            <span>{breakdown.topItems.length}</span>
          </button>
          {showItems && (
            <div className="ctx-items">
              {breakdown.topItems.map((item, idx) => (
                <div
                  key={idx}
                  className="ctx-item"
                  style={{ ["--i" as string]: idx }}
                  title={item.detail ? `${item.label}: ${item.detail}` : item.label}
                >
                  <span className="ctx-item__dot" style={{ background: CATEGORY_COLORS[item.category] }} />
                  <span className="ctx-item__text">
                    <b>{item.label}</b>
                    <span
                      style={{
                        fontFamily: item.category === "tool" ? "var(--font-mono)" : undefined,
                      }}
                    >
                      {item.detail ?? ""}
                    </span>
                  </span>
                  <span className="ctx-item__tokens">~{fmtK(item.tokens)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </>
  );
};
