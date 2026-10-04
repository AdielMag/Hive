/**
 * Usage analytics window: spend, tokens, requests, sessions and cache efficiency for Today / 7 / 30 / 90
 * days, with a stacked per-model chart and model / provider / project breakdowns.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  BarChart2,
  BarChart3,
  Coins,
  Database,
  FolderKanban,
  Layers,
  MessagesSquare,
  RefreshCw,
  Sparkles,
  TrendingUp,
  X,
  Zap,
} from "lucide-react";
import {
  daysBetween,
  filterBucketsBySession,
  lastNDays,
  localDay,
  normalizeSessionPath,
  projectLabel,
  summarizeUsage,
  type UsageGroupRow,
  type UsageTotals,
} from "@hive/pi-adapter";
import { formatCost, formatDayLabel, formatTokens } from "@hive/module-sdk/format";
import { AnalyticsMethods } from "../shared.ts";
import { analyticsHost } from "./analytics-host.ts";
import { useInsights } from "./insights-store.ts";
import { UsageChart, type ChartType } from "./UsageChart.tsx";
import { RANGE_DAYS, buildStackedSeries, prettyModel, type UsageMetric, type UsageRange } from "./usage-series.ts";
import { AiUsageInsightsModal } from "./AiUsageInsights.tsx";
import { analyzeUsageTelemetry, type AiUsageAnalysisResult } from "./insights-analyzer.ts";

const RANGES: Array<[UsageRange, string]> = [
  ["today", "Today"],
  ["7d", "7 days"],
  ["30d", "30 days"],
  ["90d", "90 days"],
];

type UsageTable = "model" | "provider" | "project" | "session";

export const UsageView: React.FC = () => {
  const usage = useInsights((s) => s.usage);
  const loading = useInsights((s) => s.usageLoading);
  const error = useInsights((s) => s.usageError);
  const refresh = useInsights((s) => s.refreshUsage);
  const focus = useInsights((s) => s.focusSession);
  const setFocus = useInsights((s) => s.setFocusSession);
  const allSessions = analyticsHost().hooks.useSessionCatalog();
  const resolvedUsageModel = analyticsHost().hooks.useFeatureModel("usageAnalysis");

  const [range, setRange] = useState<UsageRange>(() => (analyticsHost().storage.get("hive.usage.range") as UsageRange) || "7d");
  const [metric, setMetric] = useState<UsageMetric>("cost");
  const [chartType, setChartType] = useState<ChartType>(() => (analyticsHost().storage.get("hive.usage.chartType") as ChartType) || "line");
  const [table, setTable] = useState<UsageTable>("model");
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<AiUsageAnalysisResult | null>(null);
  const runIdRef = useRef(0);

  // A scoped view is usually opened for a session that just ran, so bypass the report's short cache.
  useEffect(() => {
    void refresh(focus !== null);
  }, [refresh, focus]);
  useEffect(() => analyticsHost().storage.set("hive.usage.range", range), [range]);
  useEffect(() => analyticsHost().storage.set("hive.usage.chartType", chartType), [chartType]);

  const scoped = focus !== null;
  const focusBuckets = useMemo(() => (usage && focus ? filterBucketsBySession(usage.buckets, focus) : null), [usage, focus]);
  const days = useMemo(() => {
    if (focusBuckets) {
      if (!focusBuckets.length) return lastNDays(1);
      const ds = focusBuckets.map((b) => b.day).sort();
      return daysBetween(ds[0]!, ds[ds.length - 1]!);
    }
    return lastNDays(RANGE_DAYS[range]);
  }, [focusBuckets, range, usage?.generatedAt]);
  const buckets = focusBuckets ?? usage?.buckets ?? [];
  const summary = useMemo(() => {
    if (!usage) return null;
    const sessionDays = focusBuckets ? (focusBuckets.length ? [[...new Set(focusBuckets.map((b) => b.day))]] : []) : usage.sessionDays;
    return summarizeUsage(buckets, days, sessionDays);
  }, [usage, buckets, focusBuckets, days]);
  const prevSummary = useMemo(() => {
    if (!usage || scoped || range === "today") return null;
    const n = RANGE_DAYS[range];
    const prevDays = lastNDays(n * 2).slice(0, n);
    return summarizeUsage(usage.buckets, prevDays, usage.sessionDays);
  }, [usage, range, scoped]);

  // Single-day views (Today, or a session that only ran on one day) chart per hour instead of per day.
  const hourly = scoped ? days.length === 1 : range === "today";
  const nDays = scoped ? days.length : RANGE_DAYS[range];

  const chart = useMemo(() => {
    if (!usage) return null;
    if (hourly) {
      const day = scoped ? days[0]! : localDay(Date.now());
      const hours = Array.from({ length: 24 }, (_, h) => String(h));
      return buildStackedSeries(buckets.filter((b) => b.day === day), hours, (b) => String(b.hour), metric);
    }
    return buildStackedSeries(buckets, days, (b) => b.day, metric);
  }, [usage, buckets, days, hourly, scoped, metric]);

  const sessionLabels = useMemo(() => {
    const m = new Map<string, string>();
    for (const x of allSessions) m.set(normalizeSessionPath(x.path), (x.title || x.name || x.firstMessage || "").trim());
    return m;
  }, [allSessions]);
  const labelFor = (path: string) => {
    const known = sessionLabels.get(normalizeSessionPath(path));
    if (known) return known.length > 80 ? `${known.slice(0, 80)}…` : known;
    return (path.split(/[\\/]/).pop() ?? path).replace(/\.jsonl$/, "");
  };

  const kind: UsageTable = scoped && table === "session" ? "model" : table;
  const rows = summary
    ? kind === "model"
      ? summary.byModel
      : kind === "provider"
        ? summary.byProvider
        : kind === "project"
          ? summary.byProject
          : summary.bySession
    : [];

  const handleRunAiAnalysis = async () => {
    if (!usage || !summary) return;
    const currentRunId = ++runIdRef.current;
    setAiLoading(true);
    setAiModalOpen(true);

    const baseAnalysis = analyzeUsageTelemetry(
      usage,
      summary.totals,
      summary.byModel,
      summary.byProvider,
      summary.byProject,
      summary.activeDays,
      nDays,
    );
    setAiAnalysis(baseAnalysis);

    if (resolvedUsageModel.isHeuristic) {
      setTimeout(() => {
        if (runIdRef.current === currentRunId) {
          setAiLoading(false);
        }
      }, 300);
      return;
    }

    try {
      const summaryText = `Total Spend: $${summary.totals.cost.toFixed(2)}
Total Tokens: ${summary.totals.tokens} (Input: ${summary.totals.input}, Output: ${summary.totals.output}, Cache Reads: ${summary.totals.cacheRead})
Total Turns: ${summary.totals.turns}
Active Days: ${summary.activeDays} / ${nDays} days
Top Models: ${summary.byModel.slice(0, 4).map((m) => `${m.key}: $${m.cost.toFixed(2)} (${m.tokens} tokens)`).join(", ")}
Telemetry Score: ${baseAnalysis.score}/100 (${baseAnalysis.scoreLabel})`;

      const llmResult = await analyticsHost().ipc.invoke<string>(
        AnalyticsMethods.generateInsights,
        { summaryText, model: resolvedUsageModel.id || undefined },
      );

      if (runIdRef.current !== currentRunId) return;

      if (llmResult && llmResult.trim()) {
        const firstPara = llmResult.trim().split("\n\n")[0]?.replace(/^#+\s*/, "");
        const bulletLines = llmResult
          .split("\n")
          .filter((l) => /^\s*[-*•\d\.]+\s+/.test(l))
          .map((l) => l.replace(/^\s*[-*•\d\.]+\s+/, "").trim())
          .filter(Boolean);

        const newRecs = bulletLines.slice(0, 2).map((b, idx) => ({
          id: `llm-rec-${idx}`,
          title: `AI Recommendation ${idx + 1}`,
          action: b,
          difficulty: "Easy" as const,
        }));

        setAiAnalysis((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            summary: firstPara || prev.summary,
            recommendations: newRecs.length > 0 ? [...newRecs, ...prev.recommendations] : prev.recommendations,
          };
        });
      }
    } catch (err) {
      console.warn("LLM usage insights generation failed, keeping telemetry heuristics:", err);
    } finally {
      if (runIdRef.current === currentRunId) {
        setAiLoading(false);
      }
    }
  };

  return (
    <div className="usage">
      <div className="usage__header">
        <div>
          <div className="usage__title">
            <BarChart3 size={18} /> Usage
          </div>
          <div className="usage__subtitle">
            {scoped
              ? "Single session"
              : usage
                ? `${usage.sessionFiles.toLocaleString()} session files · scanned in ${usage.scanMs} ms`
                : "Reading your Pi sessions…"}
          </div>
        </div>
        <div className="usage__actions">
          <button
            type="button"
            className="ui-btn"
            onClick={handleRunAiAnalysis}
            disabled={!summary || scoped}
            title={
              scoped
                ? "AI analysis covers all sessions"
                : `Analyze telemetry with AI · Using ${resolvedUsageModel.name || resolvedUsageModel.id} (${resolvedUsageModel.sourceLabel})`
            }
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "linear-gradient(135deg, rgba(var(--accent-rgb), 0.22), rgba(var(--accent-rgb), 0.08))",
              border: "1px solid rgba(var(--accent-rgb), 0.4)",
              color: "var(--accent-base)",
              fontWeight: 600,
              fontSize: 11,
              padding: "4px 10px",
              cursor: summary ? "pointer" : "default",
            }}
          >
            <Sparkles size={13} />
            <span>Analyze with AI</span>
            {React.createElement(analyticsHost().ui.AiModelChip, { model: resolvedUsageModel, clickable: false, feature: "usageAnalysis" })}
          </button>
          {focus ? (
            <div className="usage__focus" title={focus}>
              <MessagesSquare size={13} />
              <span className="usage__focus-name">{labelFor(focus)}</span>
              <button type="button" onClick={() => setFocus(null)} title="Back to all sessions" aria-label="Show all sessions">
                <X size={12} />
              </button>
            </div>
          ) : (
            <div className="ui-seg" role="group" aria-label="Range">
              {RANGES.map(([id, label]) => (
                <button key={id} aria-pressed={range === id} onClick={() => setRange(id)}>
                  {label}
                </button>
              ))}
            </div>
          )}
          <button className="ui-btn ui-btn--icon" onClick={() => void refresh(true)} disabled={loading} title="Rescan sessions">
            <RefreshCw size={14} className={loading ? "spin" : undefined} />
          </button>
        </div>
      </div>

      {error && !usage && <div className="ui-empty">Couldn’t read usage: {error}</div>}
      {!summary && !error && (
        <div className="usage__grid">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="ui-skeleton" style={{ height: 92 }} />
          ))}
        </div>
      )}

      {summary && (
        <>
          <div className="usage__grid">
            <Kpi icon={<Coins size={15} />} label="Spend" value={formatCost(summary.totals.cost)} delta={delta(summary.totals.cost, prevSummary?.totals.cost)} hint={nDays === 1 ? "API-equivalent cost" : `${formatCost(summary.totals.cost / Math.max(1, nDays))} / day avg`} />
            <Kpi icon={<Layers size={15} />} label="Tokens" value={formatTokens(summary.totals.tokens)} delta={delta(summary.totals.tokens, prevSummary?.totals.tokens)} hint={`${formatTokens(summary.totals.input + summary.totals.cacheRead + summary.totals.cacheWrite)} in · ${formatTokens(summary.totals.output)} out`} />
            <Kpi icon={<Zap size={15} />} label="Requests" value={summary.totals.turns.toLocaleString()} delta={delta(summary.totals.turns, prevSummary?.totals.turns)} hint={summary.totals.turns ? `${formatCost(summary.totals.cost / summary.totals.turns)} per request` : "—"} />
            {scoped ? (
              <Kpi icon={<MessagesSquare size={15} />} label="Active days" value={summary.activeDays.toLocaleString()} hint={days.length > 1 ? `${formatDayLabel(days[0]!)} – ${formatDayLabel(days[days.length - 1]!)}` : formatDayLabel(days[0]!, "long")} />
            ) : (
              <Kpi icon={<MessagesSquare size={15} />} label="Sessions" value={summary.sessions.toLocaleString()} delta={delta(summary.sessions, prevSummary?.sessions)} hint={`${summary.activeDays} active ${summary.activeDays === 1 ? "day" : "days"}`} />
            )}
            <Kpi icon={<Database size={15} />} label="Cache hit rate" value={`${Math.round(summary.cacheHitRate * 100)}%`} hint={`${formatTokens(summary.totals.cacheRead)} tokens served from cache`} />
            <Kpi icon={<Activity size={15} />} label="Top model" value={summary.byModel[0] ? prettyModel(summary.byModel[0].key.split("/").slice(1).join("/")) : "—"} hint={summary.byModel[0] ? `${Math.round((summary.byModel[0].cost / Math.max(summary.totals.cost, 1e-9)) * 100)}% of spend` : "No activity"} small />
          </div>

          <div className="ui-card usage__card">
            <div className="usage__card-head">
              <span className="usage__card-title">{hourly ? (scoped ? "Session by hour" : "Today by hour") : `Daily ${metric === "cost" ? "spend" : "tokens"}`}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div className="ui-seg" role="group" aria-label="Chart style">
                  <button aria-pressed={chartType === "bars"} onClick={() => setChartType("bars")} title="Stacked bars">
                    <BarChart2 size={13} />
                  </button>
                  <button aria-pressed={chartType === "line"} onClick={() => setChartType("line")} title="Smooth spline curve & area">
                    <TrendingUp size={13} />
                  </button>
                </div>
                <div className="ui-seg" role="group" aria-label="Metric">
                  <button aria-pressed={metric === "cost"} onClick={() => setMetric("cost")}>
                    Cost
                  </button>
                  <button aria-pressed={metric === "tokens"} onClick={() => setMetric("tokens")}>
                    Tokens
                  </button>
                </div>
              </div>
            </div>
            {chart && chart.max > 0 ? (
              <>
                <UsageChart
                  series={chart.series}
                  columns={chart.columns}
                  max={chart.max}
                  metric={metric}
                  chartType={chartType}
                  labelEvery={hourly ? 3 : scoped ? Math.max(1, Math.ceil(days.length / 10)) : range === "7d" ? 1 : range === "30d" ? 5 : 15}
                  xLabel={(x) => (hourly ? `${x.padStart(2, "0")}:00` : !scoped && range === "7d" ? formatDayLabel(x, "weekday") : formatDayLabel(x))}
                  xTitle={(x) => (hourly ? `${x.padStart(2, "0")}:00 – ${String(Number(x) + 1).padStart(2, "0")}:00` : formatDayLabel(x, "long"))}
                />
                <div className="usage__legend">
                  {chart.series.map((s) => (
                    <span key={s.key}>
                      <i style={{ background: s.color }} />
                      {s.label}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <div className="ui-empty" style={{ height: 220 }}>
                {scoped ? "No usage recorded for this session yet." : "No usage in this range yet."}
              </div>
            )}
          </div>

          <div className="usage__split">
            <div className="ui-card usage__card">
              <div className="usage__card-head">
                <span className="usage__card-title">Token mix</span>
              </div>
              <TokenMix totals={summary.totals} />
            </div>
            <div className="ui-card usage__card">
              <div className="usage__card-head">
                <span className="usage__card-title">By provider</span>
              </div>
              <div className="usage__providers">
                {summary.byProvider.length === 0 && <div className="ui-empty">No activity</div>}
                {summary.byProvider.map((p) => (
                  <div key={p.key} className="usage__provider">
                    {React.createElement(analyticsHost().ui.ProviderIcon, { provider: p.key, size: 16 })}
                    <span className="usage__provider-name">{p.key}</span>
                    <span className="usage__provider-bar">
                      <i style={{ width: `${(p.cost / Math.max(summary.totals.cost, 1e-9)) * 100}%` }} />
                    </span>
                    <span className="usage__num">{formatCost(p.cost)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="ui-card usage__card">
            <div className="usage__card-head">
              <span className="usage__card-title">Breakdown</span>
              <div className="ui-seg" role="group" aria-label="Group by">
                {!scoped && (
                  <button aria-pressed={table === "session"} onClick={() => setTable("session")}>
                    <MessagesSquare size={12} /> Sessions
                  </button>
                )}
                <button aria-pressed={kind === "model"} onClick={() => setTable("model")}>
                  Models
                </button>
                <button aria-pressed={kind === "provider"} onClick={() => setTable("provider")}>
                  Providers
                </button>
                <button aria-pressed={kind === "project"} onClick={() => setTable("project")}>
                  <FolderKanban size={12} /> Projects
                </button>
              </div>
            </div>
            <BreakdownTable rows={rows} total={summary.totals} kind={kind} labelFor={labelFor} onPick={setFocus} />
          </div>

          <AiUsageInsightsModal
            isOpen={aiModalOpen}
            onClose={() => setAiModalOpen(false)}
            analysis={aiAnalysis}
            onReanalyze={handleRunAiAnalysis}
            isLoading={aiLoading}
            model={resolvedUsageModel}
          />
        </>
      )}
    </div>
  );
};

function delta(cur: number, prev: number | undefined): number | null {
  if (prev === undefined || prev === null) return null;
  if (prev === 0) return cur > 0 ? null : 0;
  return ((cur - prev) / prev) * 100;
}

const Kpi: React.FC<{ icon: React.ReactNode; label: string; value: string; hint?: string; delta?: number | null; small?: boolean }> = ({ icon, label, value, hint, delta: d, small }) => (
  <div className="ui-card usage-kpi">
    <div className="usage-kpi__label">
      <span className="usage-kpi__icon">{icon}</span>
      {label}
      {d !== null && d !== undefined && (
        <span className={`usage-kpi__delta ${d > 0.5 ? "is-up" : d < -0.5 ? "is-down" : ""}`} title="vs. previous period">
          {d > 0 ? "▲" : d < 0 ? "▼" : "•"} {d >= 200 ? `${(d / 100 + 1).toFixed(d >= 900 ? 0 : 1)}×` : `${Math.abs(d).toFixed(0)}%`}
        </span>
      )}
    </div>
    <div className={`usage-kpi__value${small ? " usage-kpi__value--small" : ""}`} title={value}>
      {value}
    </div>
    {hint && <div className="usage-kpi__hint">{hint}</div>}
  </div>
);

const TokenMix: React.FC<{ totals: UsageTotals }> = ({ totals }) => {
  const parts = [
    { label: "Input", value: totals.input, color: "#6C95EB" },
    { label: "Output", value: totals.output, color: "#39CC9B" },
    { label: "Cache read", value: totals.cacheRead, color: "#C191FF" },
    { label: "Cache write", value: totals.cacheWrite, color: "#C9A26D" },
  ];
  const sum = Math.max(1, parts.reduce((a, p) => a + p.value, 0));
  return (
    <div className="token-mix">
      <div className="token-mix__bar">
        {parts.map((p) => (p.value > 0 ? <i key={p.label} style={{ width: `${(p.value / sum) * 100}%`, background: p.color }} title={`${p.label}: ${formatTokens(p.value)}`} /> : null))}
      </div>
      <div className="token-mix__legend">
        {parts.map((p) => (
          <div key={p.label} className="token-mix__item">
            <i style={{ background: p.color }} />
            <span>{p.label}</span>
            <b>{formatTokens(p.value)}</b>
            <em>{Math.round((p.value / sum) * 100)}%</em>
          </div>
        ))}
      </div>
    </div>
  );
};

const SESSION_ROW_LIMIT = 100;

const BreakdownTable: React.FC<{
  rows: UsageGroupRow[];
  total: UsageTotals;
  kind: UsageTable;
  labelFor: (path: string) => string;
  onPick: (path: string) => void;
}> = ({ rows, total, kind, labelFor, onPick }) => {
  if (!rows.length) return <div className="ui-empty">No activity in this range.</div>;
  const shown = kind === "session" ? rows.slice(0, SESSION_ROW_LIMIT) : rows;
  return (
    <div className="usage-table-wrap">
      <table className="usage-table">
        <thead>
          <tr>
            <th>{kind === "model" ? "Model" : kind === "provider" ? "Provider" : kind === "project" ? "Project" : "Session"}</th>
            <th className="num">Requests</th>
            <th className="num">Input</th>
            <th className="num">Output</th>
            <th className="num">Cache read</th>
            <th className="num">Cost</th>
            <th className="share">Share</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => {
            const share = total.cost > 0 ? r.cost / total.cost : total.tokens > 0 ? r.tokens / total.tokens : 0;
            const name = kind === "model" ? prettyModel(r.key.split("/").slice(1).join("/")) : kind === "session" ? labelFor(r.key) : r.key;
            return (
              <tr
                key={r.key}
                className={kind === "session" ? "is-clickable" : undefined}
                onClick={kind === "session" ? () => onPick(r.key) : undefined}
                tabIndex={kind === "session" ? 0 : undefined}
                onKeyDown={kind === "session" ? (e) => e.key === "Enter" && onPick(r.key) : undefined}
                title={kind === "session" ? "Show usage for this session only" : undefined}
              >
                <td>
                  <div className="usage-table__name">
                    {r.provider && kind !== "project" && kind !== "session" && React.createElement(analyticsHost().ui.ProviderIcon, { provider: r.provider, size: 14 })}
                    <span title={r.key}>{name}</span>
                    {kind === "session" && (
                      <em className="usage-table__sub">
                        {projectLabel(r.cwd ?? "")} · {r.firstDay === r.lastDay ? formatDayLabel(r.lastDay ?? "") : `${formatDayLabel(r.firstDay ?? "")} – ${formatDayLabel(r.lastDay ?? "")}`}
                      </em>
                    )}
                  </div>
                </td>
                <td className="num">{r.turns.toLocaleString()}</td>
                <td className="num">{formatTokens(r.input + r.cacheWrite)}</td>
                <td className="num">{formatTokens(r.output)}</td>
                <td className="num">{formatTokens(r.cacheRead)}</td>
                <td className="num strong">{formatCost(r.cost)}</td>
                <td className="share">
                  <div className="usage-table__share">
                    <span>
                      <i style={{ width: `${share * 100}%` }} />
                    </span>
                    <em>{(share * 100).toFixed(share < 0.1 ? 1 : 0)}%</em>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {kind === "session" && rows.length > SESSION_ROW_LIMIT && (
        <div className="usage-table__more">Showing the top {SESSION_ROW_LIMIT} of {rows.length.toLocaleString()} sessions by cost.</div>
      )}
    </div>
  );
};
