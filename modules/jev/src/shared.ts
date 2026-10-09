/**
 * Contract shared by the jev module's halves: main (`mod:jev:<method>`), renderer, and the Pi extension
 * (`agent/extensions/jev.ts`). The extension is installed as a single file into Pi's agent dir and cannot
 * import this file, so it mirrors the shapes marked "mirrored" below.
 */
import type { CompactTier } from "./tiering.ts";

export const MODULE_ID = "jev";

/** Jev-owned workbench tab (Insights dashboard). One instance: opening it again focuses the existing tab. */
export const INSIGHTS_TAB_KIND = "jev-insights";
export const INSIGHTS_TAB_ID = "jev-insights";

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
  /** Renderer → main: append one JevEvent (hint funnel). Duplicates (same key + entryId + kind) are dropped. */
  logEvent: "logEvent",
  /** Renderer → main: JevInsights ({ impact, scan }). `scan` is null until the first session scan finishes (it is cached). */
  getInsights: "getInsights",
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
  /** Price per 1M input tokens in USD. Null = use the published list price (JEV_PRICE_PER_MTOK_USD). */
  pricePerMTokUsd: number | null;
  /** Price per 1M input tokens of the main (agent) model in USD, used to value saved context. Null = MAIN_MODEL_PRICE_PER_MTOK_USD. */
  mainModelPricePerMTokUsd: number | null;
  /** USD the user deposited; remaining is estimated from usage since `creditSince` (the API exposes no balance). */
  creditUsd: number | null;
  /** Epoch ms the user accepted the privacy notice (conversation text goes to api.typesafe.ai). Null keeps Jev inert. */
  consentAt: number | null;
  /** Epoch ms the credit figure was entered (spend before it is ignored). */
  creditSince: number | null;
}

/** List price of jev-1.13.0 (docs.typesafe.ai/models): $0.042 per 1M input tokens ($42 per 1B); output is free. */
export const JEV_PRICE_PER_MTOK_USD = 0.042;

/** Default main-model input price for savings estimates (a typical Sonnet-class list price: $3 per 1M input tokens). */
export const MAIN_MODEL_PRICE_PER_MTOK_USD = 3;

export const DEFAULT_SETTINGS: JevSettings = {
  apiKey: "",
  model: DEFAULT_MODEL,
  compact: { enabled: true, floorPct: 40 },
  askJev: { enabled: true },
  maxCallsPerDay: 500,
  pricePerMTokUsd: null,
  mainModelPricePerMTokUsd: null,
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
    mainModelPricePerMTokUsd: optNum(r.mainModelPricePerMTokUsd),
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

/** Why a call failed (mirrored). cap/gather/invalid/disabled/aborted never reached the API. */
export type JevErrorKind = "cap" | "auth" | "timeout" | "gather" | "api" | "disabled" | "invalid" | "aborted";
export const LOCAL_ERROR_KINDS: readonly JevErrorKind[] = ["cap", "gather", "invalid", "disabled", "aborted"];

/** True when the record describes an attempt that reached the API (mirrored). */
export function reachedApi(r: Pick<UsageRecord, "errorKind">): boolean {
  return !r.errorKind || !LOCAL_ERROR_KINDS.includes(r.errorKind);
}

export type JevQuestionType = "noul" | "choice" | "score";

/** Sizes of what went into an ask_jev call (mirrored; no content). */
export interface UsageSources {
  stateChars: number;
  files: Array<{ path: string; bytes: number }>;
  commandBytes?: number;
}

/**
 * One Jev call (mirrored in the extension). Fields after `error` were added later and are optional, so older
 * records still parse. Records with a local `errorKind` (see LOCAL_ERROR_KINDS) never reached the API.
 */
export interface UsageRecord {
  ts: number;
  feature: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  ms: number;
  ok: boolean;
  error?: string;
  errorKind?: JevErrorKind;
  /** Pi session id (ask_jev only). */
  sessionId?: string;
  toolCallId?: string;
  cwd?: string;
  /** Question count per type (ask_jev only). */
  questions?: Record<JevQuestionType, number>;
  sources?: UsageSources;
  /** (file + command bytes) / 4: context the main agent never had to read. */
  savedTokensEst?: number;
  /** Per answer: max(p, 1-p) for yes/no, the API confidence for choice/score. */
  confidence?: number[];
}

const ERROR_KINDS: readonly JevErrorKind[] = ["cap", "auth", "timeout", "gather", "api", "disabled", "invalid", "aborted"];
const finiteNum = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const optStr = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);

/** Coerces one parsed usage.jsonl line into a record (null when it isn't one). Old records parse unchanged. */
export function parseUsageRecord(raw: unknown): UsageRecord | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.ts !== "number" || typeof r.feature !== "string") return null;
  const out: UsageRecord = {
    ts: r.ts,
    feature: r.feature,
    model: String(r.model ?? ""),
    inputTokens: Number(r.inputTokens) || 0,
    outputTokens: Number(r.outputTokens) || 0,
    ms: Number(r.ms) || 0,
    ok: r.ok !== false,
    error: typeof r.error === "string" ? r.error : undefined,
  };
  if (ERROR_KINDS.includes(r.errorKind as JevErrorKind)) out.errorKind = r.errorKind as JevErrorKind;
  const sessionId = optStr(r.sessionId);
  if (sessionId) out.sessionId = sessionId;
  const toolCallId = optStr(r.toolCallId);
  if (toolCallId) out.toolCallId = toolCallId;
  const cwd = optStr(r.cwd);
  if (cwd) out.cwd = cwd;
  const q = rec(r.questions);
  if (typeof r.questions === "object" && r.questions !== null) {
    out.questions = { noul: finiteNum(q.noul) ?? 0, choice: finiteNum(q.choice) ?? 0, score: finiteNum(q.score) ?? 0 };
  }
  if (typeof r.sources === "object" && r.sources !== null) {
    const s = rec(r.sources);
    out.sources = {
      stateChars: finiteNum(s.stateChars) ?? 0,
      files: Array.isArray(s.files)
        ? s.files.map(rec).filter((f) => typeof f.path === "string").map((f) => ({ path: f.path as string, bytes: finiteNum(f.bytes) ?? 0 }))
        : [],
      ...(finiteNum(s.commandBytes) !== undefined ? { commandBytes: finiteNum(s.commandBytes) } : {}),
    };
  }
  const saved = finiteNum(r.savedTokensEst);
  if (saved !== undefined) out.savedTokensEst = saved;
  if (Array.isArray(r.confidence)) out.confidence = r.confidence.filter((c): c is number => finiteNum(c) !== undefined);
  return out;
}

/** A file sent by ask_jev (mirrored): bytes sent plus a preview of at most 4 KB. */
export interface AskSourceFile {
  path: string;
  bytes: number;
  preview: string;
  truncated: boolean;
}

export interface AskSourceCommand {
  command: string;
  bytes: number;
  preview: string;
  truncated: boolean;
}

/** What went into an ask_jev call, as stored in the tool result `details` (mirrored). */
export interface AskSources {
  stateChars: number;
  files: AskSourceFile[];
  command?: AskSourceCommand;
}

/** API answer shapes (mirrored). */
export type JevAnswer =
  | { type: "noul"; noul: number }
  | { type: "choice"; choice: string; confidence: number; probabilities: Record<string, number> }
  | { type: "score"; score: number; confidence: number; legend: Record<string, unknown>; probabilities: Record<string, number> };

/** One item of a batch ask_jev call (mirrored): the single-call fields plus its own id and error. */
export interface AskJevBatchItem {
  id: string;
  answers?: Record<string, JevAnswer>;
  inputTokens: number;
  outputTokens: number;
  ms: number;
  sources?: AskSources;
  savedTokensEst?: number;
  confidence?: Record<string, number>;
  /** Set when this item failed. */
  error?: string;
  errorKind?: JevErrorKind;
}

/**
 * `details` of an ask_jev tool result (mirrored). Calls made before this shape existed carry only
 * answers/inputTokens/outputTokens/ms, so every newer field is optional.
 */
export interface AskJevDetails {
  answers?: Record<string, JevAnswer>;
  inputTokens?: number;
  outputTokens?: number;
  ms?: number;
  model?: string;
  questions?: Record<string, JevQuestionType>;
  sources?: AskSources;
  savedTokensEst?: number;
  confidence?: Record<string, number>;
  /** Batch calls (`items`): one entry per item, in order. The single-call fields above are then aggregates (answers/sources/confidence absent). */
  batch?: AskJevBatchItem[];
  /** Set on failures. */
  error?: string;
  errorKind?: JevErrorKind;
}

export interface UsageBucket {
  calls: number;
  failed: number;
  inputTokens: number;
  outputTokens: number;
  /** Estimated USD (input tokens x price). */
  costUsd: number;
}

export interface UsageSummary {
  today: UsageBucket;
  last7d: UsageBucket;
  total: UsageBucket;
  byFeature: Record<string, UsageBucket>;
  /** Price per 1M input tokens actually used for the estimates. */
  pricePerMTokUsd: number;
  /** Estimated credit left (creditUsd − spend since creditSince), or null without a deposit. */
  remainingUsd: number | null;
  /** Estimated spend since the deposit was entered, or null without a deposit. */
  spentSinceCreditUsd: number | null;
  /** Input tokens the remaining credit still buys, or null without a deposit. */
  remainingTokens: number | null;
  /** Average local-day spend over the last 7 days (days with no calls count), or null if none. */
  avgDailyUsd: number | null;
  /** remainingUsd / avgDailyUsd, or null when either is missing/zero. */
  daysLeft: number | null;
  lastError: { ts: number; message: string } | null;
}

const emptyBucket = (): UsageBucket => ({ calls: 0, failed: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 });

function add(b: UsageBucket, r: UsageRecord): void {
  b.calls += 1;
  if (!r.ok) b.failed += 1;
  b.inputTokens += r.inputTokens;
  b.outputTokens += r.outputTokens;
}

const costOf = (inputTokens: number, price: number): number => (inputTokens / 1_000_000) * price;

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
  const price = settings.pricePerMTokUsd ?? JEV_PRICE_PER_MTOK_USD;
  const out: UsageSummary = {
    today: emptyBucket(),
    last7d: emptyBucket(),
    total: emptyBucket(),
    byFeature: {},
    pricePerMTokUsd: price,
    remainingUsd: null,
    spentSinceCreditUsd: null,
    remainingTokens: null,
    avgDailyUsd: null,
    daysLeft: null,
    lastError: null,
  };
  let sinceCredit = 0;
  for (const r of records) {
    // Local refusals (bad input, unreadable files, daily cap) cost nothing and aren't Jev failures.
    if (!reachedApi(r)) continue;
    add(out.total, r);
    if (r.ts >= weekStart) add(out.last7d, r);
    if (r.ts >= dayStart) add(out.today, r);
    add((out.byFeature[r.feature] ??= emptyBucket()), r);
    if (settings.creditSince !== null && r.ts >= settings.creditSince) sinceCredit += r.inputTokens;
    if (!r.ok && r.error && (!out.lastError || r.ts >= out.lastError.ts)) out.lastError = { ts: r.ts, message: r.error };
  }
  for (const b of [out.today, out.last7d, out.total, ...Object.values(out.byFeature)]) {
    b.costUsd = costOf(b.inputTokens, price);
  }
  if (out.last7d.calls > 0) out.avgDailyUsd = out.last7d.costUsd / 7;
  if (settings.creditUsd !== null) {
    const spent = costOf(sinceCredit, price);
    out.spentSinceCreditUsd = spent;
    out.remainingUsd = Math.max(0, settings.creditUsd - spent);
    out.remainingTokens = price > 0 ? Math.floor((out.remainingUsd / price) * 1_000_000) : null;
    if (out.avgDailyUsd && out.avgDailyUsd > 0) out.daysLeft = out.remainingUsd / out.avgDailyUsd;
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

// ---------------------------------------------------------------------------------------------------------------
// Compaction-hint funnel events (events.jsonl)
// ---------------------------------------------------------------------------------------------------------------

/**
 * advice: a `jev_advice` arrived (tier = tier at that moment, may be "silent").
 * shown: the hint bar was visible with a non-silent tier.
 * compact / dismiss: the user clicked the hint's button (or compacted while it was showing).
 * ignored: a shown hint was superseded (next turn or next advice) with no action.
 * manualCompact: a compaction finished with no hint showing (user /compact, or Pi's own threshold compaction; see `reason`).
 */
export type JevEventKind = "advice" | "shown" | "compact" | "dismiss" | "ignored" | "manualCompact";
export const JEV_EVENT_KINDS: readonly JevEventKind[] = ["advice", "shown", "compact", "dismiss", "ignored", "manualCompact"];

export interface JevEvent {
  ts: number;
  kind: JevEventKind;
  /** Live session key of the tab (not the Pi session id). */
  key: string;
  /** Advice entry id the event refers to. Absent on manualCompact. */
  entryId?: string;
  tier?: CompactTier;
  /** Context window usage (%) when the advice was computed or the compaction happened. */
  usagePct?: number;
  signals?: JevAdvice["signals"];
  /** Pi's compaction reason ("manual" | "threshold" | "overflow") on manualCompact. */
  reason?: string;
  tokensBefore?: number;
}

const COMPACT_TIERS: readonly CompactTier[] = ["silent", "notice", "recommend", "request"];

/** Coerces one parsed events.jsonl line (null when it isn't an event). */
export function parseJevEvent(raw: unknown): JevEvent | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.ts !== "number" || typeof r.key !== "string" || !JEV_EVENT_KINDS.includes(r.kind as JevEventKind)) return null;
  const out: JevEvent = { ts: r.ts, kind: r.kind as JevEventKind, key: r.key };
  const entryId = optStr(r.entryId);
  if (entryId) out.entryId = entryId;
  if (COMPACT_TIERS.includes(r.tier as CompactTier)) out.tier = r.tier as CompactTier;
  const pct = finiteNum(r.usagePct);
  if (pct !== undefined) out.usagePct = pct;
  if (typeof r.signals === "object" && r.signals !== null) {
    const s = rec(r.signals);
    out.signals = {
      switchedGears: finiteNum(s.switchedGears) ?? 0,
      atBoundary: finiteNum(s.atBoundary) ?? 0,
      midOperation: finiteNum(s.midOperation) ?? 0,
      needsHistory: finiteNum(s.needsHistory) ?? 0,
    };
  }
  const reason = optStr(r.reason);
  if (reason) out.reason = reason;
  const tb = finiteNum(r.tokensBefore);
  if (tb !== undefined) out.tokensBefore = tb;
  return out;
}

/** Identity used to drop repeats: one event per key + entryId + kind. Events without an entryId are never duplicates. */
export function eventDedupeKey(e: Pick<JevEvent, "key" | "entryId" | "kind">): string | null {
  return e.entryId ? `${e.key}\u0000${e.entryId}\u0000${e.kind}` : null;
}

/** Keeps the first event per key + entryId + kind (input order). */
export function dedupeEvents(events: readonly JevEvent[]): JevEvent[] {
  const seen = new Set<string>();
  const out: JevEvent[] = [];
  for (const e of events) {
    const k = eventDedupeKey(e);
    if (k) {
      if (seen.has(k)) continue;
      seen.add(k);
    }
    out.push(e);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Impact summary (Insights view)
// ---------------------------------------------------------------------------------------------------------------

export const RECENT_CALLS = 50;
export const DAILY_SERIES_DAYS = 30;
/** An answer counts as decisive at or above this confidence. */
export const DECISIVE_CONFIDENCE = 0.8;

export interface ImpactNetSavings {
  /** Sum of savedTokensEst over successful calls. */
  savedTokensEst: number;
  /** Calls that carried a non-zero saving. */
  callsWithSavings: number;
  /** savedTokensEst valued at the main-model input price. */
  savingsUsd: number;
  /** Everything Jev cost (all API-reaching calls). */
  jevCostUsd: number;
  /** savingsUsd - jevCostUsd (can be negative). */
  netUsd: number;
  mainModelPricePerMTokUsd: number;
  jevPricePerMTokUsd: number;
}

export interface ImpactDecisiveness {
  /** Share (0-1) of answers with confidence >= DECISIVE_CONFIDENCE; null with no answers. */
  share: number | null;
  answers: number;
  /** Per question type. Answers from calls mixing several types are only in the overall figure. */
  byType: Record<JevQuestionType, { share: number | null; answers: number }>;
}

export interface ImpactFunnel {
  advice: number;
  /** advice events whose tier was "silent". */
  silentAdvice: number;
  shown: number;
  compacted: number;
  dismissed: number;
  ignored: number;
  /** shown - compacted - dismissed - ignored (hint still on screen or unresolved). */
  pending: number;
  /** compacted / shown, null when nothing was shown. */
  precision: number | null;
  /** Compactions with no hint showing (manualCompact events). */
  missed: number;
  /** Mean context % at compaction when a hint was acted on / when there was none. */
  avgPctWithHint: number | null;
  avgPctWithoutHint: number | null;
}

export interface ImpactSilent {
  /** Compact-feature calls that reached the API. */
  compactCalls: number;
  /** compactCalls - shown hints (clamped); 0 without funnel data. */
  silentCalls: number;
  /** silentCalls / compactCalls; null when there is no funnel data or no compact calls. */
  silentShare: number | null;
}

export interface ImpactLatency {
  p50Ms: number | null;
  p95Ms: number | null;
  samples: number;
}

export interface ImpactCap {
  /** 0 = unlimited. */
  maxCallsPerDay: number;
  usedToday: number;
  /** null when unlimited. */
  remainingToday: number | null;
}

export interface ImpactFeature {
  calls: number;
  failed: number;
  costUsd: number;
  inputTokens: number;
  savedTokensEst: number;
  savingsUsd: number;
  p50Ms: number | null;
}

export interface ImpactDay {
  /** Local day, YYYY-MM-DD. */
  day: string;
  /** Local midnight, epoch ms. */
  ts: number;
  calls: number;
  costUsd: number;
  savedTokens: number;
  savingsUsd: number;
}

export interface ImpactRecentCall {
  ts: number;
  feature: string;
  ok: boolean;
  errorKind?: JevErrorKind;
  /** True when the call was refused locally (cap, bad input...) and never reached the API. */
  refused: boolean;
  ms: number;
  /** Input tokens. */
  tokens: number;
  savedTokensEst?: number;
  sessionId?: string;
  toolCallId?: string;
  cwd?: string;
}

export interface ImpactSummary {
  generatedAt: number;
  /** API-reaching calls in the log. */
  calls: number;
  failedCalls: number;
  /** failedCalls / calls, null with no calls. */
  errorRate: number | null;
  net: ImpactNetSavings;
  decisiveness: ImpactDecisiveness;
  funnel: ImpactFunnel;
  silent: ImpactSilent;
  latency: ImpactLatency;
  /** Count per errorKind, refused calls included. */
  errorsByKind: Partial<Record<JevErrorKind, number>>;
  cap: ImpactCap;
  byFeature: Record<string, ImpactFeature>;
  /** Oldest first, exactly DAILY_SERIES_DAYS entries ending today. */
  daily: ImpactDay[];
  /** Newest first, at most RECENT_CALLS. */
  recent: ImpactRecentCall[];
}

const mean = (xs: readonly number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Nearest-rank percentile of an unsorted list (null when empty). */
export function percentile(values: readonly number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))]!;
}

const dayLabel = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const QUESTION_TYPES: readonly JevQuestionType[] = ["noul", "choice", "score"];

/** Pure aggregation of usage.jsonl + events.jsonl into everything the Insights view shows. */
export function summarizeImpact(
  usage: readonly UsageRecord[],
  events: readonly JevEvent[],
  settings: Pick<JevSettings, "pricePerMTokUsd" | "mainModelPricePerMTokUsd" | "maxCallsPerDay">,
  now = Date.now(),
): ImpactSummary {
  const jevPrice = settings.pricePerMTokUsd ?? JEV_PRICE_PER_MTOK_USD;
  const mainPrice = settings.mainModelPricePerMTokUsd ?? MAIN_MODEL_PRICE_PER_MTOK_USD;
  const dayStart = startOfLocalDay(now);

  // Daily series skeleton: DAILY_SERIES_DAYS local days ending today.
  const daily: ImpactDay[] = [];
  const byDay = new Map<string, ImpactDay>();
  for (let i = DAILY_SERIES_DAYS - 1; i >= 0; i--) {
    const d = new Date(dayStart);
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    const entry: ImpactDay = { day: dayLabel(d), ts: d.getTime(), calls: 0, costUsd: 0, savedTokens: 0, savingsUsd: 0 };
    daily.push(entry);
    byDay.set(entry.day, entry);
  }

  let calls = 0;
  let failedCalls = 0;
  let inputTokens = 0;
  let savedTokens = 0;
  let callsWithSavings = 0;
  let usedToday = 0;
  let compactCalls = 0;
  const latencies: number[] = [];
  const errorsByKind: Partial<Record<JevErrorKind, number>> = {};
  const byFeature: Record<string, ImpactFeature> = {};
  const featureLatencies: Record<string, number[]> = {};
  const conf = { all: [] as number[], noul: [] as number[], choice: [] as number[], score: [] as number[] };

  for (const r of usage) {
    if (r.errorKind) errorsByKind[r.errorKind] = (errorsByKind[r.errorKind] ?? 0) + 1;
    if (!reachedApi(r)) continue;
    calls += 1;
    if (!r.ok) failedCalls += 1;
    inputTokens += r.inputTokens;
    if (r.ts >= dayStart) usedToday += 1;
    if (r.feature === "compact") compactCalls += 1;
    const saved = r.ok && r.savedTokensEst && r.savedTokensEst > 0 ? r.savedTokensEst : 0;
    if (saved) {
      savedTokens += saved;
      callsWithSavings += 1;
    }
    const cost = costOf(r.inputTokens, jevPrice);
    const savingsUsd = costOf(saved, mainPrice);
    if (r.ok) {
      latencies.push(r.ms);
      (featureLatencies[r.feature] ??= []).push(r.ms);
    }
    const f = (byFeature[r.feature] ??= { calls: 0, failed: 0, costUsd: 0, inputTokens: 0, savedTokensEst: 0, savingsUsd: 0, p50Ms: null });
    f.calls += 1;
    if (!r.ok) f.failed += 1;
    f.costUsd += cost;
    f.inputTokens += r.inputTokens;
    f.savedTokensEst += saved;
    f.savingsUsd += savingsUsd;
    const day = byDay.get(dayLabel(new Date(r.ts)));
    if (day) {
      day.calls += 1;
      day.costUsd += cost;
      day.savedTokens += saved;
      day.savingsUsd += savingsUsd;
    }
    if (r.ok && r.confidence?.length) {
      conf.all.push(...r.confidence);
      const present = QUESTION_TYPES.filter((t) => (r.questions?.[t] ?? 0) > 0);
      if (present.length === 1) conf[present[0]!].push(...r.confidence);
    }
  }
  for (const [name, f] of Object.entries(byFeature)) f.p50Ms = percentile(featureLatencies[name] ?? [], 50);

  const savingsUsd = costOf(savedTokens, mainPrice);
  const jevCostUsd = costOf(inputTokens, jevPrice);
  const share = (xs: readonly number[]): number | null => (xs.length ? xs.filter((c) => c >= DECISIVE_CONFIDENCE).length / xs.length : null);

  // Funnel (deduped so a retried IPC can't double-count).
  const ev = dedupeEvents(events);
  const count = (k: JevEventKind) => ev.filter((e) => e.kind === k).length;
  const shown = count("shown");
  const compacted = count("compact");
  const dismissed = count("dismiss");
  const ignored = count("ignored");
  const pcts = (k: JevEventKind) => ev.filter((e) => e.kind === k && e.usagePct !== undefined).map((e) => e.usagePct!);
  const advice = count("advice");
  const funnel: ImpactFunnel = {
    advice,
    silentAdvice: ev.filter((e) => e.kind === "advice" && e.tier === "silent").length,
    shown,
    compacted,
    dismissed,
    ignored,
    pending: Math.max(0, shown - compacted - dismissed - ignored),
    precision: shown > 0 ? compacted / shown : null,
    missed: count("manualCompact"),
    avgPctWithHint: mean(pcts("compact")),
    avgPctWithoutHint: mean(pcts("manualCompact")),
  };
  const silentCalls = advice > 0 ? Math.max(0, compactCalls - shown) : 0;

  const recent: ImpactRecentCall[] = [...usage]
    .sort((a, b) => b.ts - a.ts)
    .slice(0, RECENT_CALLS)
    .map((r) => ({
      ts: r.ts,
      feature: r.feature,
      ok: r.ok,
      ...(r.errorKind ? { errorKind: r.errorKind } : {}),
      refused: !reachedApi(r),
      ms: r.ms,
      tokens: r.inputTokens,
      ...(r.savedTokensEst !== undefined ? { savedTokensEst: r.savedTokensEst } : {}),
      ...(r.sessionId ? { sessionId: r.sessionId } : {}),
      ...(r.toolCallId ? { toolCallId: r.toolCallId } : {}),
      ...(r.cwd ? { cwd: r.cwd } : {}),
    }));

  return {
    generatedAt: now,
    calls,
    failedCalls,
    errorRate: calls > 0 ? failedCalls / calls : null,
    net: {
      savedTokensEst: savedTokens,
      callsWithSavings,
      savingsUsd,
      jevCostUsd,
      netUsd: savingsUsd - jevCostUsd,
      mainModelPricePerMTokUsd: mainPrice,
      jevPricePerMTokUsd: jevPrice,
    },
    decisiveness: {
      share: share(conf.all),
      answers: conf.all.length,
      byType: {
        noul: { share: share(conf.noul), answers: conf.noul.length },
        choice: { share: share(conf.choice), answers: conf.choice.length },
        score: { share: share(conf.score), answers: conf.score.length },
      },
    },
    funnel,
    silent: { compactCalls, silentCalls, silentShare: advice > 0 && compactCalls > 0 ? silentCalls / compactCalls : null },
    latency: { p50Ms: percentile(latencies, 50), p95Ms: percentile(latencies, 95), samples: latencies.length },
    errorsByKind,
    cap: {
      maxCallsPerDay: settings.maxCallsPerDay,
      usedToday,
      remainingToday: settings.maxCallsPerDay > 0 ? Math.max(0, settings.maxCallsPerDay - usedToday) : null,
    },
    byFeature,
    daily,
    recent,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Session scan (phase 2): computed from Pi session files, see session-scan.ts
// ---------------------------------------------------------------------------------------------------------------

/** What one session file contributes to the scan (cached per file by mtime + size). */
export interface SessionScanEntry {
  /** The session called ask_jev at least once. */
  usedJev: boolean;
  /** Files passed to ask_jev (counted per call). */
  filesSent: number;
  /** Of those, files the agent then `read` within the next 5 tool calls. */
  reread: number;
  /** Assistant turns that reported token usage. */
  turns: number;
  /** Sum over those turns of input + cacheRead + cacheWrite tokens (what the main model was fed). */
  inputTokens: number;
  compactions: number;
}

export interface SessionGroupStats {
  sessions: number;
  turns: number;
  /** Mean main-model input tokens per assistant turn, null without turns. */
  avgInputTokensPerTurn: number | null;
  compactions: number;
  /** Null without sessions. */
  compactionsPerSession: number | null;
}

export interface SessionScanSummary {
  generatedAt: number;
  /** Only files modified within this many days are scanned. */
  windowDays: number;
  scannedSessions: number;
  /** rate = reread / filesSent, null when no files were sent. */
  reread: { filesSent: number; reread: number; rate: number | null };
  withJev: SessionGroupStats;
  withoutJev: SessionGroupStats;
  /** "Correlation, not causation": the groups differ in more than Jev. */
  caveat: string;
}

/** Return of IPC `getInsights`. */
export interface JevInsights {
  impact: ImpactSummary;
  /** Null until the first scan completes (the IPC does not wait for a cold scan). */
  scan: SessionScanSummary | null;
}
