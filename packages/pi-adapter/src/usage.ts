/**
 * Usage analytics over Pi session files (JSONL). Browser-safe: no Node imports.
 *
 * Main streams every session file through `SessionUsageParser` to produce compact per-day buckets;
 * the renderer slices those buckets with `summarizeUsage` for any range / grouping.
 */
import type { UsageBucket } from "@hive/protocol";

export interface UsageTurn {
  timestamp: number;
  provider: string;
  model: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** YYYY-MM-DD in the local timezone. */
export function localDay(ts: number): string {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * Parses one JSONL line. Returns the session cwd for the header record, a usage turn for assistant
 * messages with usage, or null. Cheap substring checks skip JSON.parse for the vast majority of lines.
 */
export function parseUsageLine(line: string): { cwd: string } | UsageTurn | null {
  if (line.startsWith('{"type":"session"')) {
    try {
      const rec = JSON.parse(line) as { cwd?: string };
      return typeof rec.cwd === "string" ? { cwd: rec.cwd } : null;
    } catch {
      return null;
    }
  }
  if (!line.includes('"usage"') || !line.includes('"role":"assistant"')) return null;
  try {
    const rec = JSON.parse(line) as {
      type?: string;
      timestamp?: string;
      message?: {
        role?: string;
        provider?: string;
        model?: string;
        timestamp?: number;
        usage?: {
          input?: number;
          output?: number;
          cacheRead?: number;
          cacheWrite?: number;
          cost?: { total?: number };
        };
      };
    };
    const msg = rec.message;
    if (rec.type !== "message" || msg?.role !== "assistant" || !msg.usage) return null;
    const u = msg.usage;
    const timestamp = num(msg.timestamp) || (rec.timestamp ? Date.parse(rec.timestamp) : 0);
    if (!timestamp) return null;
    return {
      timestamp,
      provider: msg.provider || "unknown",
      model: msg.model || "unknown",
      input: num(u.input),
      output: num(u.output),
      cacheRead: num(u.cacheRead),
      cacheWrite: num(u.cacheWrite),
      cost: num(u.cost?.total),
    };
  } catch {
    return null;
  }
}

/** Accumulates the turns of ONE session file into day buckets. */
export class SessionUsageParser {
  cwd = "";
  readonly days = new Set<string>();
  private readonly buckets = new Map<string, UsageBucket>();

  push(line: string): void {
    const parsed = parseUsageLine(line);
    if (!parsed) return;
    if ("cwd" in parsed) {
      this.cwd = parsed.cwd;
      return;
    }
    const day = localDay(parsed.timestamp);
    const hour = new Date(parsed.timestamp).getHours();
    this.days.add(day);
    const key = `${day}|${hour}|${parsed.provider}|${parsed.model}`;
    let b = this.buckets.get(key);
    if (!b) {
      b = { day, hour, provider: parsed.provider, model: parsed.model, cwd: "", turns: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
      this.buckets.set(key, b);
    }
    b.turns += 1;
    b.input += parsed.input;
    b.output += parsed.output;
    b.cacheRead += parsed.cacheRead;
    b.cacheWrite += parsed.cacheWrite;
    b.cost += parsed.cost;
  }

  result(): UsageBucket[] {
    return [...this.buckets.values()].map((b) => ({ ...b, cwd: this.cwd }));
  }
}

// ---------------------------------------------------------------------------------------------
// Renderer-side summarization
// ---------------------------------------------------------------------------------------------

export interface UsageTotals {
  turns: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  /** input + output + cacheRead + cacheWrite */
  tokens: number;
}

export interface UsageGroupRow extends UsageTotals {
  key: string;
  provider?: string;
  /** Session rows only: working directory, and the first / last local day with activity (in range). */
  cwd?: string;
  firstDay?: string;
  lastDay?: string;
}

export interface UsageDayRow extends UsageTotals {
  day: string;
  sessions: number;
}

export interface UsageHourRow extends UsageTotals {
  hour: number;
}

export interface UsageSummary {
  totals: UsageTotals;
  days: UsageDayRow[];
  /** Per-hour totals across the range (most useful for single-day ranges). */
  hours: UsageHourRow[];
  byModel: UsageGroupRow[];
  byProvider: UsageGroupRow[];
  byProject: UsageGroupRow[];
  /** One row per session file (key = session path), most expensive first. */
  bySession: UsageGroupRow[];
  /** Cache-read share of all prompt-side tokens, 0..1. */
  cacheHitRate: number;
  activeDays: number;
  sessions: number;
}

const emptyTotals = (): UsageTotals => ({ turns: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, tokens: 0 });

function addInto(t: UsageTotals, b: UsageBucket): void {
  t.turns += b.turns;
  t.input += b.input;
  t.output += b.output;
  t.cacheRead += b.cacheRead;
  t.cacheWrite += b.cacheWrite;
  t.cost += b.cost;
  t.tokens += b.input + b.output + b.cacheRead + b.cacheWrite;
}

/** Comparable form of a session file path (separator- and case-insensitive; Windows paths vary). */
export function normalizeSessionPath(p: string): string {
  return p.replace(/\\/g, "/").toLowerCase();
}

/** Buckets that belong to one session file. */
export function filterBucketsBySession(buckets: UsageBucket[], sessionPath: string): UsageBucket[] {
  const want = normalizeSessionPath(sessionPath);
  return buckets.filter((b) => b.session !== undefined && normalizeSessionPath(b.session) === want);
}

/** Inclusive list of local days from `first` to `last` (YYYY-MM-DD). */
export function daysBetween(first: string, last: string): string[] {
  const out: string[] = [];
  const [y, m, d] = first.split("-").map(Number) as [number, number, number];
  const cur = new Date(y, m - 1, d, 12);
  for (let i = 0; i < 4000; i++) {
    const day = localDay(cur.getTime());
    out.push(day);
    if (day >= last) break;
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

/** Inclusive list of local days ending today. `days` = 1 for today only. */
export function lastNDays(days: number, now = Date.now()): string[] {
  const out: string[] = [];
  const d = new Date(now);
  d.setHours(12, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const x = new Date(d);
    x.setDate(d.getDate() - i);
    out.push(localDay(x.getTime()));
  }
  return out;
}

export function projectLabel(cwd: string): string {
  if (!cwd) return "Unknown";
  const parts = cwd.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? cwd;
}

export function summarizeUsage(
  buckets: UsageBucket[],
  dayRange: string[],
  sessionDays: string[][] = [],
): UsageSummary {
  const inRange = new Set(dayRange);
  const days = new Map<string, UsageDayRow>(
    dayRange.map((day) => [day, { day, sessions: 0, ...emptyTotals() }]),
  );
  const totals = emptyTotals();
  const hours: UsageHourRow[] = Array.from({ length: 24 }, (_, hour) => ({ hour, ...emptyTotals() }));
  const byModel = new Map<string, UsageGroupRow>();
  const byProvider = new Map<string, UsageGroupRow>();
  const byProject = new Map<string, UsageGroupRow>();
  const bySession = new Map<string, UsageGroupRow>();

  const group = (map: Map<string, UsageGroupRow>, key: string, b: UsageBucket, provider?: string) => {
    let row = map.get(key);
    if (!row) {
      row = { key, provider, ...emptyTotals() };
      map.set(key, row);
    }
    addInto(row, b);
  };

  for (const b of buckets) {
    if (!inRange.has(b.day)) continue;
    addInto(totals, b);
    addInto(days.get(b.day)!, b);
    addInto(hours[b.hour] ?? hours[0]!, b);
    group(byModel, `${b.provider}/${b.model}`, b, b.provider);
    group(byProvider, b.provider, b, b.provider);
    group(byProject, projectLabel(b.cwd), b);
    if (b.session) {
      group(bySession, b.session, b);
      const row = bySession.get(b.session)!;
      row.cwd = b.cwd;
      if (!row.firstDay || b.day < row.firstDay) row.firstDay = b.day;
      if (!row.lastDay || b.day > row.lastDay) row.lastDay = b.day;
    }
  }

  let sessions = 0;
  for (const sd of sessionDays) {
    let hit = false;
    for (const day of sd) {
      const row = days.get(day);
      if (row) {
        row.sessions += 1;
        hit = true;
      }
    }
    if (hit) sessions += 1;
  }

  const sortRows = (m: Map<string, UsageGroupRow>) =>
    [...m.values()].sort((a, b) => b.cost - a.cost || b.tokens - a.tokens);
  const dayRows = [...days.values()];
  const promptSide = totals.input + totals.cacheRead + totals.cacheWrite;

  return {
    totals,
    days: dayRows,
    hours,
    byModel: sortRows(byModel),
    byProvider: sortRows(byProvider),
    byProject: sortRows(byProject),
    bySession: sortRows(bySession),
    cacheHitRate: promptSide > 0 ? totals.cacheRead / promptSide : 0,
    activeDays: dayRows.filter((d) => d.turns > 0).length,
    sessions,
  };
}
