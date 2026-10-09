/**
 * Jev Insights tab: what Jev costs, what it (probably) saves, and whether its hints land. Everything here comes from
 * IPC `getInsights` ({ impact, scan }); money and token figures that depend on the character-count heuristic are
 * labelled "est.". `InsightsBody` is pure (props in, markup out) so it can be rendered on the server in tests.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, Gauge, Loader2, RefreshCw } from "lucide-react";
import type { ModuleHost, ModuleTab } from "@hive/module-sdk/renderer";
import {
  DECISIVE_CONFIDENCE,
  JevMethods,
  type ImpactDay,
  type ImpactRecentCall,
  type ImpactSummary,
  type JevInsights as JevInsightsData,
  type JevQuestionType,
  type SessionGroupStats,
  type SessionScanSummary,
} from "../shared.ts";
import "./jev.css";

export const REFRESH_MS = 15_000;
/** While the cold session scan is still running (scan === null) we poll faster. */
export const SCAN_POLL_MS = 3_000;
export type TrendRange = 7 | 30;

// ---------------------------------------------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------------------------------------------

export const usd = (n: number | null | undefined, digits = 4): string => {
  if (n === null || n === undefined) return "n/a";
  const sign = n < 0 ? "-" : "";
  const a = Math.abs(n);
  return `${sign}$${a.toFixed(a >= 1 ? 2 : a > 0 && a < 0.0001 ? 6 : digits)}`;
};
export const tok = (n: number): string =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n));
export const pct = (share: number | null | undefined, digits = 0): string => (share === null || share === undefined ? "n/a" : `${(share * 100).toFixed(digits)}%`);
export const pctPoints = (n: number | null | undefined): string => (n === null || n === undefined ? "n/a" : `${n.toFixed(0)}%`);
export const msText = (n: number | null | undefined): string => (n === null || n === undefined ? "n/a" : n >= 1000 ? `${(n / 1000).toFixed(2)}s` : `${Math.round(n)}ms`);
export const shortId = (id: string): string => id.slice(0, 8);

const FEATURE_LABEL: Record<string, string> = { compact: "Compaction hints", ask_jev: "ask_jev tool" };
const TYPE_LABEL: Record<JevQuestionType, string> = { noul: "Yes / no", choice: "Choice", score: "Score" };
const ERROR_LABEL: Record<string, string> = {
  cap: "Daily cap",
  auth: "Auth",
  timeout: "Timeout",
  gather: "Gather (files / command)",
  api: "API",
  disabled: "Disabled",
  invalid: "Invalid input",
};

const hasAnyActivity = (impact: ImpactSummary): boolean =>
  impact.calls > 0 || impact.recent.length > 0 || impact.funnel.advice > 0 || impact.funnel.missed > 0 || Object.keys(impact.errorsByKind).length > 0;

// ---------------------------------------------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------------------------------------------

const Section: React.FC<{ title: string; desc?: React.ReactNode; aside?: React.ReactNode; children: React.ReactNode; className?: string }> = ({
  title,
  desc,
  aside,
  children,
  className,
}) => (
  <section className={`jev-card jev-ins-section${className ? ` ${className}` : ""}`}>
    <div className="jev-ins-section__head">
      <div>
        <h4 className="jev-card__sub">{title}</h4>
        {desc && <p className="jev-card__desc">{desc}</p>}
      </div>
      {aside}
    </div>
    {children}
  </section>
);

const Headline: React.FC<{ label: string; value: string; sub: React.ReactNode; tone?: "good" | "bad" | "warn"; est?: boolean }> = ({ label, value, sub, tone, est }) => (
  <div className={`jev-stat jev-headline${tone ? ` jev-headline--${tone}` : ""}`}>
    <div className="jev-stat__label">
      {label}
      {est && <span className="jev-est"> est.</span>}
    </div>
    <div className="jev-stat__value jev-headline__value">{value}</div>
    <div className="jev-stat__sub">{sub}</div>
  </div>
);

const Meter: React.FC<{ value: number | null; label: string; tone?: "good" | "bad" | "warn" }> = ({ value, label, tone }) => (
  <div className="jev-meter" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value === null ? undefined : Math.round(value * 100)}>
    <div className={`jev-meter__fill${tone ? ` jev-meter__fill--${tone}` : ""}`} style={{ width: `${Math.max(0, Math.min(1, value ?? 0)) * 100}%` }} />
  </div>
);

const KV: React.FC<{ k: string; v: React.ReactNode }> = ({ k, v }) => (
  <div className="jev-kv">
    <span className="jev-kv__k">{k}</span>
    <span className="jev-kv__v">{v}</span>
  </div>
);

// ---------------------------------------------------------------------------------------------------------------
// Trend chart (plain SVG; labels are HTML so they don't stretch with the viewBox)
// ---------------------------------------------------------------------------------------------------------------

const CHART_W = 600;
const CHART_H = 120;

export const TrendChart: React.FC<{ days: readonly ImpactDay[] }> = ({ days }) => {
  const max = Math.max(0, ...days.map((d) => Math.max(d.savingsUsd, d.costUsd)));
  if (days.length === 0 || max <= 0) return <div className="jev-empty jev-empty--inline">No calls with savings or cost in this period.</div>;
  const slot = CHART_W / days.length;
  const barW = Math.max(1, slot * 0.62);
  const y = (v: number): number => CHART_H - (v / max) * (CHART_H - 4);
  const line = days.map((d, i) => `${(i * slot + slot / 2).toFixed(1)},${y(d.costUsd).toFixed(1)}`).join(" ");
  const total = days.reduce((a, d) => ({ saved: a.saved + d.savingsUsd, cost: a.cost + d.costUsd, calls: a.calls + d.calls }), { saved: 0, cost: 0, calls: 0 });
  return (
    <figure className="jev-chart">
      <svg
        className="jev-chart__svg"
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Estimated savings and Jev cost per day, last ${days.length} days`}
      >
        <line className="jev-chart__base" x1={0} x2={CHART_W} y1={CHART_H - 0.5} y2={CHART_H - 0.5} />
        {days.map((d, i) => {
          const h = Math.max(d.savingsUsd > 0 ? 1.5 : 0, CHART_H - y(d.savingsUsd));
          return (
            <rect key={d.day} className="jev-chart__bar" x={i * slot + (slot - barW) / 2} y={CHART_H - h} width={barW} height={h} rx={1.5}>
              <title>{`${d.day}: est. savings ${usd(d.savingsUsd)} · Jev cost ${usd(d.costUsd)} · ${d.calls} calls`}</title>
            </rect>
          );
        })}
        <polyline className="jev-chart__cost" points={line} fill="none" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="jev-chart__axis">
        <span>{days[0]!.day}</span>
        <span>peak {usd(max)}/day</span>
        <span>{days[days.length - 1]!.day}</span>
      </div>
      <figcaption className="jev-chart__legend">
        <span className="jev-legend jev-legend--saved">Est. savings {usd(total.saved)}</span>
        <span className="jev-legend jev-legend--cost">Jev cost {usd(total.cost)}</span>
        <span className="jev-muted">{total.calls} calls</span>
      </figcaption>
    </figure>
  );
};

// ---------------------------------------------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------------------------------------------

const FeatureSplit: React.FC<{ impact: ImpactSummary }> = ({ impact }) => {
  const rows = Object.entries(impact.byFeature).sort((a, b) => b[1].calls - a[1].calls);
  if (rows.length === 0) return <div className="jev-empty jev-empty--inline">No calls yet.</div>;
  return (
    <div className="jev-tablewrap">
      <table className="jev-table">
        <thead>
          <tr>
            <th>Feature</th>
            <th className="jev-num-cell">Calls</th>
            <th className="jev-num-cell">Failed</th>
            <th className="jev-num-cell">Cost</th>
            <th className="jev-num-cell">Saved (est.)</th>
            <th className="jev-num-cell">p50</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([name, f]) => (
            <tr key={name}>
              <td>{FEATURE_LABEL[name] ?? name}</td>
              <td className="jev-num-cell">{f.calls}</td>
              <td className={`jev-num-cell${f.failed > 0 ? " jev-bad" : ""}`}>{f.failed}</td>
              <td className="jev-num-cell">{usd(f.costUsd)}</td>
              <td className="jev-num-cell">{f.savedTokensEst > 0 ? `${tok(f.savedTokensEst)} · ${usd(f.savingsUsd)}` : "n/a"}</td>
              <td className="jev-num-cell">{msText(f.p50Ms)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const Funnel: React.FC<{ impact: ImpactSummary }> = ({ impact }) => {
  const { funnel, silent } = impact;
  const stages: { label: string; n: number; hint?: string }[] = [
    { label: "Advice", n: funnel.advice, hint: funnel.silentAdvice > 0 ? `${funnel.silentAdvice} silent` : undefined },
    { label: "Shown", n: funnel.shown },
    { label: "Acted on", n: funnel.compacted, hint: funnel.precision !== null ? `${pct(funnel.precision)} of shown` : undefined },
  ];
  const top = Math.max(1, ...stages.map((s) => s.n));
  if (funnel.advice === 0 && funnel.missed === 0 && silent.compactCalls === 0) return <div className="jev-empty jev-empty--inline">No compaction hints yet.</div>;
  return (
    <div className="jev-funnel">
      {stages.map((s) => (
        <div className="jev-funnel__row" key={s.label}>
          <span className="jev-funnel__label">{s.label}</span>
          <div className="jev-funnel__track">
            <div className="jev-funnel__fill" style={{ width: `${(s.n / top) * 100}%` }} />
          </div>
          <span className="jev-funnel__n">
            {s.n}
            {s.hint && <span className="jev-muted"> · {s.hint}</span>}
          </span>
        </div>
      ))}
      <div className="jev-kvgrid">
        <KV k="Dismissed / ignored / pending" v={`${funnel.dismissed} / ${funnel.ignored} / ${funnel.pending}`} />
        <KV k="Missed (compacted with no hint)" v={funnel.missed} />
        <KV k="Avg context at compaction, with hint" v={pctPoints(funnel.avgPctWithHint)} />
        <KV k="Avg context at compaction, no hint" v={pctPoints(funnel.avgPctWithoutHint)} />
        <KV
          k="Silent calls (no visible hint)"
          v={silent.silentShare === null ? "n/a" : `${pct(silent.silentShare)} · ${silent.silentCalls} of ${silent.compactCalls}`}
        />
      </div>
    </div>
  );
};

const Decisiveness: React.FC<{ impact: ImpactSummary }> = ({ impact }) => {
  const d = impact.decisiveness;
  if (d.answers === 0) return <div className="jev-empty jev-empty--inline">No answers yet.</div>;
  return (
    <div className="jev-bars">
      <div className="jev-bars__row jev-bars__row--total">
        <span className="jev-bars__label">All answers</span>
        <Meter value={d.share} label="Share of decisive answers" tone="good" />
        <span className="jev-bars__n">
          {pct(d.share)} <span className="jev-muted">of {d.answers}</span>
        </span>
      </div>
      {(Object.keys(TYPE_LABEL) as JevQuestionType[]).map((t) => {
        const row = d.byType[t];
        return (
          <div className="jev-bars__row" key={t}>
            <span className="jev-bars__label">{TYPE_LABEL[t]}</span>
            <Meter value={row.share} label={`Decisive ${TYPE_LABEL[t]} answers`} />
            <span className="jev-bars__n">
              {row.answers === 0 ? "n/a" : pct(row.share)} <span className="jev-muted">of {row.answers}</span>
            </span>
          </div>
        );
      })}
      <div className="jev-muted">Decisive = confidence of {Math.round(DECISIVE_CONFIDENCE * 100)}% or more.</div>
    </div>
  );
};

const Health: React.FC<{ impact: ImpactSummary }> = ({ impact }) => {
  const { latency, errorsByKind, cap } = impact;
  const kinds = Object.entries(errorsByKind).filter(([, n]) => (n ?? 0) > 0) as [string, number][];
  const used = cap.maxCallsPerDay > 0 ? Math.min(1, cap.usedToday / cap.maxCallsPerDay) : null;
  return (
    <div className="jev-health">
      <div className="jev-health__block">
        <div className="jev-stat__label">Latency</div>
        <div className="jev-kvgrid jev-kvgrid--tight">
          <KV k="p50" v={msText(latency.p50Ms)} />
          <KV k="p95" v={msText(latency.p95Ms)} />
          <KV k="Samples" v={latency.samples} />
        </div>
      </div>
      <div className="jev-health__block">
        <div className="jev-stat__label">Errors by kind</div>
        {kinds.length === 0 ? (
          <div className="jev-muted">No errors.</div>
        ) : (
          <div className="jev-chips">
            {kinds
              .sort((a, b) => b[1] - a[1])
              .map(([k, n]) => (
                <span className="ui-chip jev-chip-err" key={k}>
                  {ERROR_LABEL[k] ?? k} · {n}
                </span>
              ))}
          </div>
        )}
      </div>
      <div className="jev-health__block">
        <div className="jev-stat__label">Daily cap</div>
        {used === null ? (
          <div className="jev-muted">Unlimited ({cap.usedToday} calls today)</div>
        ) : (
          <>
            <Meter value={used} label="Daily call cap used" tone={used >= 1 ? "bad" : used >= 0.8 ? "warn" : undefined} />
            <div className="jev-muted">
              {cap.usedToday} of {cap.maxCallsPerDay} used · {cap.remainingToday ?? 0} left today
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const GroupRow: React.FC<{ label: string; g: SessionGroupStats }> = ({ label, g }) => (
  <tr>
    <td>{label}</td>
    <td className="jev-num-cell">{g.sessions}</td>
    <td className="jev-num-cell">{g.avgInputTokensPerTurn === null ? "n/a" : tok(g.avgInputTokensPerTurn)}</td>
    <td className="jev-num-cell">{g.compactionsPerSession === null ? "n/a" : g.compactionsPerSession.toFixed(2)}</td>
  </tr>
);

export const ScanSection: React.FC<{ scan: SessionScanSummary | null }> = ({ scan }) => (
  <Section
    title="Session scan"
    desc={
      scan
        ? `Read from Pi session files modified in the last ${scan.windowDays} days (${scan.scannedSessions} sessions scanned).`
        : "Reads your Pi session files to check whether Jev's savings hold up."
    }
    className="jev-scan"
  >
    {scan === null ? (
      <div className="jev-scan__loading" role="status">
        <Loader2 size={14} className="jev-spin" /> Scanning session files… the first scan can take a moment. This updates on its own.
      </div>
    ) : scan.scannedSessions === 0 ? (
      <div className="jev-empty jev-empty--inline">No session files found in the scan window.</div>
    ) : (
      <>
        <div className="jev-kvgrid">
          <KV
            k="Re-read rate"
            v={
              scan.reread.rate === null
                ? "n/a (no files sent to Jev)"
                : `${pct(scan.reread.rate)} · ${scan.reread.reread} of ${scan.reread.filesSent} files`
            }
          />
        </div>
        <p className="jev-muted">A re-read means the agent opened a file itself within 5 tool calls of sending it to Jev, which cancels that saving.</p>
        <div className="jev-tablewrap">
          <table className="jev-table">
            <thead>
              <tr>
                <th>Sessions</th>
                <th className="jev-num-cell">Count</th>
                <th className="jev-num-cell">Tokens / turn</th>
                <th className="jev-num-cell">Compactions / session</th>
              </tr>
            </thead>
            <tbody>
              <GroupRow label="With ask_jev" g={scan.withJev} />
              <GroupRow label="Without ask_jev" g={scan.withoutJev} />
            </tbody>
          </table>
        </div>
        <div className="jev-caveat" role="note">
          <strong>Correlation, not causation.</strong> {scan.caveat || "Sessions that use ask_jev differ from the others in more than Jev (size, task, model)."}
        </div>
      </>
    )}
  </Section>
);

const statusOf = (r: ImpactRecentCall): { text: string; tone: "ok" | "bad" | "muted" } =>
  r.ok ? { text: "ok", tone: "ok" } : r.refused ? { text: r.errorKind ? `refused · ${r.errorKind}` : "refused", tone: "muted" } : { text: r.errorKind ?? "error", tone: "bad" };

const RecentTable: React.FC<{
  rows: readonly ImpactRecentCall[];
  sessionTitle?: (sessionId: string) => string | undefined;
  onCopy?: (text: string) => void;
  copied: string | null;
}> = ({ rows, sessionTitle, onCopy, copied }) => {
  if (rows.length === 0) return <div className="jev-empty jev-empty--inline">No calls logged yet.</div>;
  return (
    <div className="jev-tablewrap jev-tablewrap--recent">
      <table className="jev-table">
        <thead>
          <tr>
            <th>When</th>
            <th>Feature</th>
            <th>Status</th>
            <th className="jev-num-cell">Time</th>
            <th className="jev-num-cell">Tokens</th>
            <th className="jev-num-cell">Saved (est.)</th>
            <th>Session</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const st = statusOf(r);
            const title = r.sessionId ? sessionTitle?.(r.sessionId) : undefined;
            return (
              <tr key={`${r.ts}-${i}`}>
                <td className="jev-nowrap">{new Date(r.ts).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                <td>{FEATURE_LABEL[r.feature] ?? r.feature}</td>
                <td>
                  <span className={st.tone === "ok" ? "jev-ok" : st.tone === "bad" ? "jev-bad" : "jev-muted"}>{st.text}</span>
                </td>
                <td className="jev-num-cell">{msText(r.ms)}</td>
                <td className="jev-num-cell">{tok(r.tokens)}</td>
                <td className="jev-num-cell">{r.savedTokensEst ? tok(r.savedTokensEst) : "n/a"}</td>
                <td>
                  {r.sessionId ? (
                    <span className="jev-sess" title={[r.cwd, r.toolCallId ? `tool call ${r.toolCallId}` : ""].filter(Boolean).join("\n") || undefined}>
                      {title && <span className="jev-sess__title">{title}</span>}
                      <code>{shortId(r.sessionId)}</code>
                      <button
                        type="button"
                        className="jev-copy"
                        aria-label={`Copy session id ${r.sessionId}`}
                        title="Copy session id"
                        onClick={() => onCopy?.(r.sessionId!)}
                      >
                        {copied === r.sessionId ? <Check size={11} /> : <Copy size={11} />}
                      </button>
                    </span>
                  ) : (
                    <span className="jev-muted">n/a</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

// ---------------------------------------------------------------------------------------------------------------
// Body + container
// ---------------------------------------------------------------------------------------------------------------

export interface InsightsBodyProps {
  data: JevInsightsData | null;
  error?: string | null;
  loading?: boolean;
  range: TrendRange;
  onRange?: (r: TrendRange) => void;
  onRefresh?: () => void;
  onCopy?: (text: string) => void;
  copiedId?: string | null;
  sessionTitle?: (sessionId: string) => string | undefined;
}

export const InsightsBody: React.FC<InsightsBodyProps> = ({ data, error, loading, range, onRange, onRefresh, onCopy, copiedId = null, sessionTitle }) => {
  const impact = data?.impact ?? null;
  const days = impact ? impact.daily.slice(-range) : [];
  const net = impact?.net;
  const lowConf = impact && impact.decisiveness.share !== null ? 1 - impact.decisiveness.share : null;

  return (
    <div className="jev-insights">
      <header className="jev-insights__head">
        <span className="jev-icon">
          <Gauge size={18} />
        </span>
        <div className="jev-insights__titles">
          <h2 className="jev-insights__title">Jev insights</h2>
          <p className="jev-card__desc">
            What Jev costs and what it likely saves. Savings are estimates (file and command bytes ÷ 4, priced at the main-model rate), not measured.
          </p>
        </div>
        <button type="button" className="jev-btn jev-btn--ghost" onClick={onRefresh} disabled={loading} title="Rescan session files and reload">
          {loading ? <Loader2 size={13} className="jev-spin" /> : <RefreshCw size={13} />} Refresh
        </button>
      </header>

      {error && (
        <div className="jev-bad" role="alert">
          {error}
        </div>
      )}

      {!impact ? (
        <div className="jev-empty" role="status">
          <Loader2 size={14} className="jev-spin" /> Loading insights…
        </div>
      ) : !hasAnyActivity(impact) ? (
        <>
          <div className="jev-empty" role="status">
            <strong>No Jev activity yet.</strong>
            <span>Calls from ask_jev and compaction hints appear here once Jev is set up and used. Add your TypeSafe key in Settings → Jev.</span>
          </div>
          <ScanSection scan={data?.scan ?? null} />
        </>
      ) : (
        <>
          <div className="jev-headlines">
            <Headline
              label="Net savings"
              est
              value={usd(net!.netUsd, 2)}
              tone={net!.netUsd > 0 ? "good" : net!.netUsd < 0 ? "bad" : undefined}
              sub={
                <>
                  {tok(net!.savedTokensEst)} tokens saved ({usd(net!.savingsUsd, 2)} at ${net!.mainModelPricePerMTokUsd}/MTok) − Jev cost {usd(net!.jevCostUsd)}
                </>
              }
            />
            <Headline
              label="Hint acceptance"
              value={pct(impact.funnel.precision)}
              sub={impact.funnel.shown > 0 ? `${impact.funnel.compacted} of ${impact.funnel.shown} shown hints acted on` : "no hints shown yet"}
            />
            <Headline
              label="Low confidence"
              value={pct(lowConf)}
              tone={lowConf !== null && lowConf > 0.4 ? "warn" : undefined}
              sub={impact.decisiveness.answers > 0 ? `answers under ${Math.round(DECISIVE_CONFIDENCE * 100)}% of ${impact.decisiveness.answers}` : "no answers yet"}
            />
            <Headline
              label="Errors"
              value={pct(impact.errorRate, 1)}
              tone={impact.errorRate !== null && impact.errorRate > 0.1 ? "bad" : undefined}
              sub={`${impact.failedCalls} of ${impact.calls} API calls failed`}
            />
          </div>

          <Section
            title="Trend"
            desc="Daily est. savings (bars) against what Jev cost (line)."
            aside={
              <div className="jev-seg" role="group" aria-label="Trend range">
                {([7, 30] as const).map((r) => (
                  <button key={r} type="button" className={`jev-seg__btn${range === r ? " is-active" : ""}`} aria-pressed={range === r} onClick={() => onRange?.(r)}>
                    {r}d
                  </button>
                ))}
              </div>
            }
          >
            <TrendChart days={days} />
          </Section>

          <div className="jev-ins-grid">
            <Section title="By feature">
              <FeatureSplit impact={impact} />
            </Section>
            <Section title="Health">
              <Health impact={impact} />
            </Section>
            <Section title="Compaction hint funnel" desc="Advice from Jev, hints you saw, and the ones you acted on.">
              <Funnel impact={impact} />
            </Section>
            <Section title="Decisiveness" desc="How often Jev gives a clear answer, by question type.">
              <Decisiveness impact={impact} />
            </Section>
          </div>

          <ScanSection scan={data?.scan ?? null} />

          <Section title="Recent calls" desc={`Newest ${impact.recent.length} calls. Hive can't jump to another session from here, so copy the session id.`}>
            <RecentTable rows={impact.recent} sessionTitle={sessionTitle} onCopy={onCopy} copied={copiedId} />
          </Section>
        </>
      )}
    </div>
  );
};

export const JevInsights: React.FC<{ tab?: ModuleTab; host: ModuleHost }> = ({ host }) => {
  const [data, setData] = useState<JevInsightsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState<TrendRange>(30);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const alive = useRef(true);
  const inFlight = useRef(false);
  const catalog = host.hooks.useSessionCatalog();

  useEffect(() => {
    alive.current = true;
    return () => void (alive.current = false);
  }, []);

  const load = useCallback(
    async (force = false) => {
      if (inFlight.current && !force) return;
      inFlight.current = true;
      if (force) setLoading(true);
      try {
        const next = await host.ipc.invoke<JevInsightsData>(JevMethods.getInsights, force ? { force: true } : undefined);
        if (alive.current) {
          setData(next);
          setError(null);
        }
      } catch (e) {
        if (alive.current) setError(e instanceof Error ? e.message : String(e));
      } finally {
        inFlight.current = false;
        if (alive.current) setLoading(false);
      }
    },
    [host],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const scanPending = data !== null && data.scan === null;
  useEffect(() => {
    const t = setInterval(() => void load(), scanPending ? SCAN_POLL_MS : REFRESH_MS);
    return () => clearInterval(t);
  }, [load, scanPending]);

  const copy = useCallback(
    (text: string) => {
      void host.clipboard.copy(text).then((ok) => {
        if (!ok || !alive.current) return;
        setCopiedId(text);
        setTimeout(() => alive.current && setCopiedId((c) => (c === text ? null : c)), 1500);
      });
    },
    [host],
  );

  const sessionTitle = useCallback(
    (sessionId: string): string | undefined => {
      const s = catalog.find((c) => c.path.includes(sessionId));
      return s ? s.title || s.name || s.firstMessage?.slice(0, 48) : undefined;
    },
    [catalog],
  );

  return (
    <InsightsBody
      data={data}
      error={error}
      loading={loading}
      range={range}
      onRange={setRange}
      onRefresh={() => void load(true)}
      onCopy={copy}
      copiedId={copiedId}
      sessionTitle={sessionTitle}
    />
  );
};
