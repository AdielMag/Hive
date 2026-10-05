/**
 * Contract shared by the jev module's halves: main (`mod:jev:<method>`), renderer, and the Pi extension
 * (`agent/extensions/jev.ts`). The extension is installed as a single file into Pi's agent dir and cannot
 * import this file, so it mirrors the shapes marked "mirrored" below.
 */
export const MODULE_ID = "jev";

/** TypeSafe API root. `POST /v1/systemone` answers questions, `GET /v1/models` lists models. */
export const JEV_API_URL = "https://api.typesafe.ai";
export const DEFAULT_MODEL = "jev-latest";

/** Env vars main sets on its own process so every Pi session it spawns inherits them. */
export const JEV_ENV = {
  /** Path of config.json (settings incl. the API key). */
  config: "HIVE_JEV_CONFIG",
  /** Path of usage.jsonl (one record per Jev call, appended by the extension). */
  usage: "HIVE_JEV_USAGE",
} as const;

export const JevMethods = {
  getSettings: "getSettings",
  saveSettings: "saveSettings",
  testKey: "testKey",
  getUsage: "getUsage",
  clearUsage: "clearUsage",
} as const;

/** Bridge records on `pi.events` topics studio:to-gui / studio:from-gui (mirrored in the extension). */
export const JEV_ADVICE_KIND = "jev_advice";
export const JEV_COMPACT_KIND = "jev_compact";

export interface JevSettings {
  /** TypeSafe API key (never sent to the renderer; see JevSettingsView). */
  apiKey: string;
  model: string;
  compact: {
    enabled: boolean;
    /** Skip Jev entirely below this share of the context window (saves calls). 0-95. */
    floorPct: number;
  };
  askJev: { enabled: boolean };
  /** Hard cap on Jev calls per local day, across all sessions. 0 = unlimited. */
  maxCallsPerDay: number;
  /** User-entered price per 1M input tokens in USD (the API exposes no pricing or balance). */
  pricePerMTokUsd: number | null;
  /** User-entered credit they have loaded, in USD; remaining is estimated from usage since `creditSince`. */
  creditUsd: number | null;
  /** Epoch ms the user accepted the privacy notice (conversation text goes to api.typesafe.ai). Null keeps Jev inert. */
  consentAt: number | null;
  /** Epoch ms the credit figure was entered (spend before it is ignored). */
  creditSince: number | null;
}

export const DEFAULT_SETTINGS: JevSettings = {
  apiKey: "",
  model: DEFAULT_MODEL,
  compact: { enabled: true, floorPct: 40 },
  askJev: { enabled: true },
  maxCallsPerDay: 500,
  pricePerMTokUsd: null,
  creditUsd: null,
  consentAt: null,
  creditSince: null,
};

const num = (v: unknown, fallback: number, min: number, max: number): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
const optNum = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);
const rec = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {});

/** Coerces untrusted JSON into valid settings (missing/invalid fields fall back to defaults). */
export function normalizeSettings(raw: unknown): JevSettings {
  const r = rec(raw);
  const compact = rec(r.compact);
  const askJev = rec(r.askJev);
  return {
    apiKey: typeof r.apiKey === "string" ? r.apiKey.trim() : "",
    model: typeof r.model === "string" && r.model.trim() ? r.model.trim() : DEFAULT_SETTINGS.model,
    compact: {
      enabled: typeof compact.enabled === "boolean" ? compact.enabled : DEFAULT_SETTINGS.compact.enabled,
      floorPct: Math.round(num(compact.floorPct, DEFAULT_SETTINGS.compact.floorPct, 0, 95)),
    },
    askJev: { enabled: typeof askJev.enabled === "boolean" ? askJev.enabled : DEFAULT_SETTINGS.askJev.enabled },
    maxCallsPerDay: Math.round(num(r.maxCallsPerDay, DEFAULT_SETTINGS.maxCallsPerDay, 0, 1_000_000)),
    pricePerMTokUsd: optNum(r.pricePerMTokUsd),
    creditUsd: optNum(r.creditUsd),
    consentAt: typeof r.consentAt === "number" && r.consentAt > 0 ? r.consentAt : null,
    creditSince: optNum(r.creditSince),
  };
}

/** What the renderer sees: everything but the key itself. */
export interface JevSettingsView extends Omit<JevSettings, "apiKey"> {
  hasKey: boolean;
  /** e.g. "…a1b2" so the user can tell which key is stored. */
  keyHint: string;
}

export function toView(s: JevSettings): JevSettingsView {
  const { apiKey, ...rest } = s;
  return { ...rest, hasKey: apiKey.length > 0, keyHint: apiKey ? `…${apiKey.slice(-4)}` : "" };
}

/** Renderer → main patch. `apiKey: ""` removes the key; `undefined` keeps it. */
export type JevSettingsPatch = Partial<Omit<JevSettings, "compact" | "askJev">> & {
  compact?: Partial<JevSettings["compact"]>;
  askJev?: Partial<JevSettings["askJev"]>;
};

export function applyPatch(current: JevSettings, patch: JevSettingsPatch): JevSettings {
  const merged = {
    ...current,
    ...patch,
    compact: { ...current.compact, ...patch.compact },
    askJev: { ...current.askJev, ...patch.askJev },
  };
  // Re-anchor the credit estimate whenever the user types a new credit figure.
  if (patch.creditUsd !== undefined && patch.creditUsd !== current.creditUsd) merged.creditSince = Date.now();
  return normalizeSettings(merged);
}

export interface TestKeyResult {
  ok: boolean;
  /** Human-readable reason when not ok. */
  error?: string;
  models?: string[];
  /** Response headers that look like balance/credit/quota info (the API documents none; shown if present). */
  balanceHeaders?: Record<string, string>;
}

/** One Jev call (mirrored in the extension). */
export interface UsageRecord {
  ts: number;
  feature: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  ms: number;
  ok: boolean;
  error?: string;
}

export interface UsageBucket {
  calls: number;
  failed: number;
  inputTokens: number;
  outputTokens: number;
  /** Estimated USD, or null when no price is configured. */
  costUsd: number | null;
}

export interface UsageSummary {
  today: UsageBucket;
  last7d: UsageBucket;
  total: UsageBucket;
  byFeature: Record<string, UsageBucket>;
  /** Estimated credit left (creditUsd − spend since creditSince), or null without both inputs. */
  remainingUsd: number | null;
  lastError: { ts: number; message: string } | null;
}

const emptyBucket = (): UsageBucket => ({ calls: 0, failed: 0, inputTokens: 0, outputTokens: 0, costUsd: null });

function add(b: UsageBucket, r: UsageRecord): void {
  b.calls += 1;
  if (!r.ok) b.failed += 1;
  b.inputTokens += r.inputTokens;
  b.outputTokens += r.outputTokens;
}

const costOf = (inputTokens: number, price: number | null): number | null =>
  price === null ? null : (inputTokens / 1_000_000) * price;

export function startOfLocalDay(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Aggregates the usage log. Output tokens are free per the API docs, so only input tokens are priced. */
export function summarizeUsage(
  records: readonly UsageRecord[],
  settings: Pick<JevSettings, "pricePerMTokUsd" | "creditUsd" | "creditSince">,
  now = Date.now(),
): UsageSummary {
  const dayStart = startOfLocalDay(now);
  const weekStart = now - 7 * 24 * 3600_000;
  const out: UsageSummary = {
    today: emptyBucket(),
    last7d: emptyBucket(),
    total: emptyBucket(),
    byFeature: {},
    remainingUsd: null,
    lastError: null,
  };
  let sinceCredit = 0;
  for (const r of records) {
    add(out.total, r);
    if (r.ts >= weekStart) add(out.last7d, r);
    if (r.ts >= dayStart) add(out.today, r);
    add((out.byFeature[r.feature] ??= emptyBucket()), r);
    if (settings.creditSince !== null && r.ts >= settings.creditSince) sinceCredit += r.inputTokens;
    if (!r.ok && r.error && (!out.lastError || r.ts >= out.lastError.ts)) out.lastError = { ts: r.ts, message: r.error };
  }
  for (const b of [out.today, out.last7d, out.total, ...Object.values(out.byFeature)]) {
    b.costUsd = costOf(b.inputTokens, settings.pricePerMTokUsd);
  }
  if (settings.creditUsd !== null && settings.pricePerMTokUsd !== null) {
    const spent = costOf(sinceCredit, settings.pricePerMTokUsd) ?? 0;
    out.remainingUsd = Math.max(0, settings.creditUsd - spent);
  }
  return out;
}

/** `jev_advice` bridge record (extension → renderer): the raw Jev signals for the last finished turn. */
export interface JevAdvice {
  kind: typeof JEV_ADVICE_KIND;
  /** Session entry id the advice was computed for. */
  entryId: string;
  /** Epoch ms the advice was computed (idle time is measured from here). */
  at: number;
  usagePct: number;
  tokens: number;
  contextWindow: number;
  signals: {
    /** P(user started a different task). */
    switchedGears: number;
    /** P(last turn finished a unit of work). */
    atBoundary: number;
    /** P(a multi-step operation is half done). */
    midOperation: number;
    /** Expected 0-2: how much earlier conversation the next step needs. */
    needsHistory: number;
  };
}

export function isJevAdvice(v: unknown): v is JevAdvice {
  if (typeof v !== "object" || v === null) return false;
  const a = v as Record<string, unknown>;
  const s = a.signals as Record<string, unknown> | undefined;
  return (
    a.kind === JEV_ADVICE_KIND &&
    typeof a.entryId === "string" &&
    typeof a.at === "number" &&
    typeof a.usagePct === "number" &&
    typeof a.tokens === "number" &&
    typeof a.contextWindow === "number" &&
    !!s &&
    ["switchedGears", "atBoundary", "midOperation", "needsHistory"].every((k) => typeof s[k] === "number")
  );
}
