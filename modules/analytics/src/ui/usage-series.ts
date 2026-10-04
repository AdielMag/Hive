/** Shapes usage buckets into stacked chart series (top N models + "Other"). Pure. */
import type { UsageBucket } from "@hive/protocol";

export type UsageMetric = "cost" | "tokens";
export type UsageRange = "today" | "7d" | "30d" | "90d";

export const RANGE_DAYS: Record<UsageRange, number> = { today: 1, "7d": 7, "30d": 30, "90d": 90 };

export const SERIES_COLORS = ["#6C95EB", "#C191FF", "#39CC9B", "#C9A26D", "#ED94C0", "#66C3CC"];
export const OTHER_COLOR = "#7d828c";

export interface Series {
  key: string;
  label: string;
  color: string;
}

export interface StackedColumn {
  x: string;
  total: number;
  values: number[]; // aligned with series
}

export const metricOf = (b: UsageBucket, m: UsageMetric) => (m === "cost" ? b.cost : b.input + b.output + b.cacheRead + b.cacheWrite);

export function prettyModel(model: string): string {
  return model
    .replace(/^claude-/, "Claude ")
    .replace(/^gemini-/, "Gemini ")
    .replace(/^gpt-/, "GPT-")
    .replace(/-(\d+)-(\d+)$/, " $1.$2")
    .replace(/-(\d+)$/, " $1")
    .replace(/-/g, " ")
    .replace(/\b(opus|sonnet|haiku|flash|pro|mini|nano)\b/gi, (w) => w.charAt(0).toUpperCase() + w.slice(1));
}

export function buildStackedSeries(
  buckets: UsageBucket[],
  xs: string[],
  xOf: (b: UsageBucket) => string,
  metric: UsageMetric,
  topN = 5,
): { series: Series[]; columns: StackedColumn[]; max: number } {
  const inX = new Set(xs);
  const totalsByModel = new Map<string, number>();
  for (const b of buckets) {
    if (!inX.has(xOf(b))) continue;
    const key = `${b.provider}/${b.model}`;
    totalsByModel.set(key, (totalsByModel.get(key) ?? 0) + metricOf(b, metric));
  }
  const ranked = [...totalsByModel.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const top = ranked.slice(0, topN).map(([k]) => k);
  const hasOther = ranked.length > topN;
  const series: Series[] = top.map((key, i) => ({ key, label: prettyModel(key.split("/").slice(1).join("/")), color: SERIES_COLORS[i % SERIES_COLORS.length]! }));
  if (hasOther) series.push({ key: "__other", label: "Other", color: OTHER_COLOR });

  const idx = new Map(series.map((s, i) => [s.key, i]));
  const columns = new Map<string, StackedColumn>(xs.map((x) => [x, { x, total: 0, values: series.map(() => 0) }]));
  for (const b of buckets) {
    const col = columns.get(xOf(b));
    if (!col) continue;
    const v = metricOf(b, metric);
    const i = idx.get(`${b.provider}/${b.model}`) ?? idx.get("__other");
    if (i === undefined) continue;
    col.values[i]! += v;
    col.total += v;
  }
  const cols = [...columns.values()];
  return { series, columns: cols, max: Math.max(0, ...cols.map((c) => c.total)) };
}

/** A "nice" axis maximum and tick step for a value range. */
export function niceScale(max: number, ticks = 4): { max: number; step: number } {
  if (max <= 0) return { max: 1, step: 0.25 };
  const raw = max / ticks;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / pow;
  const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pow;
  return { max: Math.ceil(max / step) * step, step };
}
