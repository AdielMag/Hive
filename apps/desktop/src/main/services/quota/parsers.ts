/**
 * Pure parsers that normalize each provider's subscription-usage payload into QuotaGroup[].
 * Kept free of I/O so they are unit-testable against recorded payloads.
 */
import type { QuotaGroup, QuotaWindow } from "@pi-studio/protocol";

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec | undefined => (v && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : undefined);
const num = (v: unknown): number | undefined => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return undefined;
};
const clamp = (n: number) => Math.max(0, Math.min(100, n));

function timestamp(v: unknown, now: number, afterSeconds?: unknown): number | undefined {
  if (typeof v === "string") {
    const t = Date.parse(v);
    if (Number.isFinite(t)) return t;
  }
  const n = num(v);
  if (n !== undefined) return n < 1e12 ? n * 1000 : n; // seconds vs ms
  const after = num(afterSeconds);
  return after !== undefined ? now + after * 1000 : undefined;
}

/** Utilization fields are sometimes 0..1 fractions, sometimes 0..100 percents. */
function percent(v: unknown): number | undefined {
  const n = num(v);
  if (n === undefined) return undefined;
  return clamp(n <= 1 && n > 0 && !Number.isInteger(n) ? n * 100 : n);
}

const ANTHROPIC_WINDOWS: Array<[string, string, QuotaWindow["kind"]]> = [
  ["five_hour", "5-hour", "5h"],
  ["seven_day", "Weekly", "weekly"],
  ["seven_day_opus", "Weekly · Opus", "weekly"],
  ["seven_day_sonnet", "Weekly · Sonnet", "weekly"],
];

/** GET https://api.anthropic.com/api/oauth/usage */
export function parseAnthropicUsage(value: unknown, now = Date.now()): QuotaGroup[] {
  const root = rec(value);
  if (!root) return [];
  const windows: QuotaWindow[] = [];
  for (const [field, label, kind] of ANTHROPIC_WINDOWS) {
    const w = rec(root[field]);
    if (!w) continue;
    const used = percent(w.utilization ?? w.used_percent);
    if (used === undefined) continue;
    windows.push({ id: field, label, kind, usedPercent: used, resetsAt: timestamp(w.resets_at ?? w.reset_at, now) });
  }
  return windows.length ? [{ id: "claude", label: "Claude subscription", windows }] : [];
}

/** POST {cloudcode}/v1internal:retrieveUserQuotaSummary — buckets expose *remaining* fractions. */
export function parseAntigravityQuota(value: unknown, now = Date.now()): QuotaGroup[] {
  const root = rec(value);
  const groups = Array.isArray(root?.groups) ? root!.groups : [];
  const out: QuotaGroup[] = [];
  groups.forEach((g, gi) => {
    const group = rec(g);
    if (!group) return;
    const buckets = Array.isArray(group.buckets) ? group.buckets : [];
    const windows: QuotaWindow[] = [];
    for (const b of buckets) {
      const bucket = rec(b);
      if (!bucket) continue;
      const remaining = num(bucket.remainingFraction ?? bucket.remaining_fraction);
      if (remaining === undefined) continue;
      const id = String(bucket.bucketId ?? bucket.window ?? `bucket-${windows.length}`);
      const win = String(bucket.window ?? id).toLowerCase();
      const kind: QuotaWindow["kind"] = win.includes("5h") ? "5h" : win.includes("week") || win.includes("7d") ? "weekly" : "other";
      windows.push({
        id,
        label: kind === "5h" ? "5-hour" : kind === "weekly" ? "Weekly" : String(bucket.displayName ?? id),
        kind,
        usedPercent: clamp((1 - remaining) * 100),
        resetsAt: timestamp(bucket.resetTime, now, bucket.reset_in_seconds),
      });
    }
    if (!windows.length) return;
    out.push({
      id: String(group.displayName ?? `group-${gi}`).toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      label: String(group.displayName ?? `Group ${gi + 1}`),
      description: typeof group.description === "string" ? group.description : undefined,
      windows: sortWindows(windows),
    });
  });
  return out;
}

/** GET https://chatgpt.com/backend-api/wham/usage (ChatGPT/Codex subscription). */
export function parseCodexUsage(value: unknown, now = Date.now()): QuotaGroup[] {
  const root = rec(value);
  const rl = rec(root?.rate_limit) ?? rec(root?.rateLimit);
  if (!rl) return [];
  const windows: QuotaWindow[] = [];
  const pairs: Array<[unknown, string, string, QuotaWindow["kind"]]> = [
    [rl.primary_window ?? rl.primaryWindow, "primary", "5-hour", "5h"],
    [rl.secondary_window ?? rl.secondaryWindow, "secondary", "Weekly", "weekly"],
  ];
  for (const [raw, id, label, kind] of pairs) {
    const w = rec(raw);
    if (!w) continue;
    const used = percent(w.used_percent ?? w.usedPercent);
    if (used === undefined) continue;
    windows.push({
      id,
      label,
      kind,
      usedPercent: used,
      resetsAt: timestamp(w.reset_at ?? w.resetAt, now, w.reset_after_seconds ?? w.resetAfterSeconds),
    });
  }
  const plan = typeof root?.plan_type === "string" ? root.plan_type : undefined;
  return windows.length ? [{ id: "codex", label: plan ? `ChatGPT ${plan}` : "ChatGPT subscription", windows }] : [];
}

/** pi-quota-status extension cache (~/.pi/agent/pi-quota-status/state.json), used as an offline fallback. */
export function parseQuotaStatusCache(value: unknown): Map<string, { fetchedAt: number; groups: QuotaGroup[] }> {
  const out = new Map<string, { fetchedAt: number; groups: QuotaGroup[] }>();
  const obs = rec(rec(value)?.observations);
  if (!obs) return out;
  for (const entry of Object.values(obs)) {
    const o = rec(entry);
    const provider = typeof o?.provider === "string" ? o.provider : undefined;
    const dims = Array.isArray(o?.dimensions) ? o!.dimensions : [];
    const observedAt = num(o?.observedAt) ?? 0;
    if (!provider || !dims.length) continue;
    const prev = out.get(provider);
    if (prev && prev.fetchedAt >= observedAt) continue;
    const windows: QuotaWindow[] = [];
    for (const d of dims) {
      const dim = rec(d);
      const limit = num(dim?.limit) ?? 100;
      const remaining = num(dim?.remaining);
      if (!dim || remaining === undefined || limit <= 0) continue;
      const name = String(dim.name ?? "window");
      const kind: QuotaWindow["kind"] = name === "5h" ? "5h" : name.startsWith("weekly") ? "weekly" : "other";
      windows.push({
        id: name,
        label: kind === "5h" ? "5-hour" : name === "weekly" ? "Weekly" : name.replace(/_/g, " · "),
        kind,
        usedPercent: clamp(100 - (remaining / limit) * 100),
        resetsAt: num(dim.resetAt),
      });
    }
    if (windows.length) out.set(provider, { fetchedAt: observedAt, groups: [{ id: provider, label: "Subscription", windows: sortWindows(windows) }] });
  }
  return out;
}

const KIND_ORDER: Record<QuotaWindow["kind"], number> = { "5h": 0, weekly: 1, other: 2 };
export function sortWindows(windows: QuotaWindow[]): QuotaWindow[] {
  return [...windows].sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
}
