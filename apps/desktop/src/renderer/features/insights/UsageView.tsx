/**
 * Usage analytics window: spend, tokens, requests, sessions and cache efficiency for Today / 7 / 30 / 90
 * days, with a stacked per-model chart and model / provider / project breakdowns.
 */
import React, { useEffect, useMemo, useState } from "react";
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
  Zap,
} from "lucide-react";
import { lastNDays, localDay, summarizeUsage, type UsageGroupRow, type UsageTotals } from "@hive/pi-adapter";
import { ProviderIcon } from "../../components/ProviderIcon.tsx";
import { formatCost, formatDayLabel, formatTokens } from "../../lib/format.ts";
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

export const UsageView: React.FC = () => {
  const usage = useInsights((s) => s.usage);
  const loading = useInsights((s) => s.usageLoading);
  const error = useInsights((s) => s.usageError);
  const refresh = useInsights((s) => s.refreshUsage);
  const [range, setRange] = useState<UsageRange>(() => (localStorage.getItem("pi-studio.usage.range") as UsageRange) || "7d");
  const [metric, setMetric] = useState<UsageMetric>("cost");
  const [chartType, setChartType] = useState<ChartType>(() => (localStorage.getItem("pi-studio.usage.chartType") as ChartType) || "line");
  const [table, setTable] = useState<"model" | "provider" | "project">("model");
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<AiUsageAnalysisResult | null>(null);

  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => localStorage.setItem("pi-studio.usage.range", range), [range]);
  useEffect(() => localStorage.setItem("pi-studio.usage.chartType", chartType), [chartType]);

  const days = useMemo(() => lastNDays(RANGE_DAYS[range]), [range, usage?.generatedAt]);
  const summary = useMemo(() => (usage ? summarizeUsage(usage.buckets, days, usage.sessionDays) : null), [usage, days]);
  const prevSummary = useMemo(() => {
    if (!usage || range === "today") return null;
    const n = RANGE_DAYS[range];
    const prevDays = lastNDays(n * 2).slice(0, n);
    return summarizeUsage(usage.buckets, prevDays, usage.sessionDays);
  }, [usage, range]);

  const chart = useMemo(() => {
    if (!usage) return null;
    if (range === "today") {
      const today = localDay(Date.now());
      const hours = Array.from({ length: 24 }, (_, h) => String(h));
      const todays = usage.buckets.filter((b) => b.day === today);
      return buildStackedSeries(todays, hours, (b) => String(b.hour), metric);
    }
    return buildStackedSeries(usage.buckets, days, (b) => b.day, metric);
  }, [usage, days, range, metric]);

  const rows = summary ? (table === "model" ? summary.byModel : table === "provider" ? summary.byProvider : summary.byProject) : [];

  const handleRunAiAnalysis = () => {
    if (!usage || !summary) return;
    setAiLoading(true);
    setAiModalOpen(true);
    setTimeout(() => {
      const res = analyzeUsageTelemetry(
        usage,
        summary.totals,
        summary.byModel,
        summary.byProvider,
        summary.byProject,
        summary.activeDays,
        RANGE_DAYS[range],
      );
      setAiAnalysis(res);
      setAiLoading(false);
    }, 450);
  };

  return (
    <div className="usage">
      <div className="usage__header">
        <div>
          <div className="usage__title">
            <BarChart3 size={18} /> Usage
          </div>
          <div className="usage__subtitle">
            {usage ? `${usage.sessionFiles.toLocaleString()} session files · scanned in ${usage.scanMs} ms` : "Reading your Pi sessions…"}
          </div>
        </div>
        <div className="usage__actions">
          <button
            type="button"
            className="ui-btn"
            onClick={handleRunAiAnalysis}
            disabled={!summary}
            title="Generate deep AI telemetry insights & cost analysis"
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
          </button>
          <div className="ui-seg" role="group" aria-label="Range">
            {RANGES.map(([id, label]) => (
              <button key={id} aria-pressed={range === id} onClick={() => setRange(id)}>
                {label}
              </button>
            ))}
          </div>
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
            <Kpi icon={<Coins size={15} />} label="Spend" value={formatCost(summary.totals.cost)} delta={delta(summary.totals.cost, prevSummary?.totals.cost)} hint={range === "today" ? "API-equivalent cost" : `${formatCost(summary.totals.cost / Math.max(1, RANGE_DAYS[range]))} / day avg`} />
            <Kpi icon={<Layers size={15} />} label="Tokens" value={formatTokens(summary.totals.tokens)} delta={delta(summary.totals.tokens, prevSummary?.totals.tokens)} hint={`${formatTokens(summary.totals.input + summary.totals.cacheRead + summary.totals.cacheWrite)} in · ${formatTokens(summary.totals.output)} out`} />
            <Kpi icon={<Zap size={15} />} label="Requests" value={summary.totals.turns.toLocaleString()} delta={delta(summary.totals.turns, prevSummary?.totals.turns)} hint={summary.totals.turns ? `${formatCost(summary.totals.cost / summary.totals.turns)} per request` : "—"} />
            <Kpi icon={<MessagesSquare size={15} />} label="Sessions" value={summary.sessions.toLocaleString()} delta={delta(summary.sessions, prevSummary?.sessions)} hint={`${summary.activeDays} active ${summary.activeDays === 1 ? "day" : "days"}`} />
            <Kpi icon={<Database size={15} />} label="Cache hit rate" value={`${Math.round(summary.cacheHitRate * 100)}%`} hint={`${formatTokens(summary.totals.cacheRead)} tokens served from cache`} />
            <Kpi icon={<Activity size={15} />} label="Top model" value={summary.byModel[0] ? prettyModel(summary.byModel[0].key.split("/").slice(1).join("/")) : "—"} hint={summary.byModel[0] ? `${Math.round((summary.byModel[0].cost / Math.max(summary.totals.cost, 1e-9)) * 100)}% of spend` : "No activity"} small />
          </div>

          <div className="ui-card usage__card">
            <div className="usage__card-head">
              <span className="usage__card-title">{range === "today" ? "Today by hour" : `Daily ${metric === "cost" ? "spend" : "tokens"}`}</span>
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
                  labelEvery={range === "today" ? 3 : range === "7d" ? 1 : range === "30d" ? 5 : 15}
                  xLabel={(x) => (range === "today" ? `${x.padStart(2, "0")}:00` : range === "7d" ? formatDayLabel(x, "weekday") : formatDayLabel(x))}
                  xTitle={(x) => (range === "today" ? `${x.padStart(2, "0")}:00 – ${String(Number(x) + 1).padStart(2, "0")}:00` : formatDayLabel(x, "long"))}
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
                No usage in this range yet.
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
                    <ProviderIcon provider={p.key} size={16} />
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
                <button aria-pressed={table === "model"} onClick={() => setTable("model")}>
                  Models
                </button>
                <button aria-pressed={table === "provider"} onClick={() => setTable("provider")}>
                  Providers
                </button>
                <button aria-pressed={table === "project"} onClick={() => setTable("project")}>
                  <FolderKanban size={12} /> Projects
                </button>
              </div>
            </div>
            <BreakdownTable rows={rows} total={summary.totals} kind={table} />
          </div>

          <AiUsageInsightsModal
            isOpen={aiModalOpen}
            onClose={() => setAiModalOpen(false)}
            analysis={aiAnalysis}
            onReanalyze={handleRunAiAnalysis}
            isLoading={aiLoading}
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

const BreakdownTable: React.FC<{ rows: UsageGroupRow[]; total: UsageTotals; kind: "model" | "provider" | "project" }> = ({ rows, total, kind }) => {
  if (!rows.length) return <div className="ui-empty">No activity in this range.</div>;
  return (
    <div className="usage-table-wrap">
      <table className="usage-table">
        <thead>
          <tr>
            <th>{kind === "model" ? "Model" : kind === "provider" ? "Provider" : "Project"}</th>
            <th className="num">Requests</th>
            <th className="num">Input</th>
            <th className="num">Output</th>
            <th className="num">Cache read</th>
            <th className="num">Cost</th>
            <th className="share">Share</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const share = total.cost > 0 ? r.cost / total.cost : total.tokens > 0 ? r.tokens / total.tokens : 0;
            const name = kind === "model" ? prettyModel(r.key.split("/").slice(1).join("/")) : r.key;
            return (
              <tr key={r.key}>
                <td>
                  <div className="usage-table__name">
                    {r.provider && kind !== "project" && <ProviderIcon provider={r.provider} size={14} />}
                    <span title={r.key}>{name}</span>
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
    </div>
  );
};
