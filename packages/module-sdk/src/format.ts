/** Number / time formatting shared by insights, transcript and status bar. */

/** The UI is English; use an English locale with 24h time so dates don't mix scripts. */
const LOCALE = typeof navigator !== "undefined" && navigator.language.startsWith("en") ? navigator.language : "en-GB";

export function formatTokens(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(abs >= 1e10 ? 0 : 1)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(abs >= 1e7 ? 0 : 1)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(abs >= 1e4 ? 0 : 1)}k`;
  return String(Math.round(n));
}

export function formatCost(usd: number): string {
  if (!usd) return "$0";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 100) return `$${usd.toFixed(2)}`;
  return `$${Math.round(usd).toLocaleString()}`;
}

export function formatPercent(p: number, digits = 0): string {
  return `${p.toFixed(digits)}%`;
}

/** "2h 14m", "3d 4h", "45s" */
export function formatDuration(ms: number): string {
  if (ms <= 0) return "now";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

/** Stopwatch style: "42s", "3m 05s", "1h 02m". Used for how long the agent worked. */
export function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (h > 0) return `${h}h ${pad(m)}m`;
  if (m > 0) return `${m}m ${pad(sec)}s`;
  return `${sec}s`;
}

/** "Today 14:30", "Tomorrow 09:00", "Sat 07:59" */
export function formatResetAt(ts: number, now = Date.now()): string {
  const d = new Date(ts);
  const time = d.toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit" });
  const today = new Date(now);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(d) - startOf(today)) / 86_400_000);
  if (diffDays === 0) return `Today ${time}`;
  if (diffDays === 1) return `Tomorrow ${time}`;
  if (diffDays > 1 && diffDays < 7) return `${d.toLocaleDateString(LOCALE, { weekday: "short" })} ${time}`;
  return `${d.toLocaleDateString(LOCALE, { month: "short", day: "numeric" })} ${time}`;
}

export function formatAgo(ts: number, now = Date.now()): string {
  const diff = now - ts;
  if (diff < 45_000) return "just now";
  return `${formatDuration(diff)} ago`;
}

export function formatDayLabel(day: string, style: "short" | "long" | "weekday" = "short"): string {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(y!, m! - 1, d!);
  if (style === "weekday") return date.toLocaleDateString(LOCALE, { weekday: "short", day: "numeric" });
  return style === "long"
    ? date.toLocaleDateString(LOCALE, { weekday: "long", month: "short", day: "numeric" })
    : date.toLocaleDateString(LOCALE, { month: "short", day: "numeric" });
}
