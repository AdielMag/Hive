import { describe, expect, it, vi } from "vitest";
import { parseUsageLog, testKey } from "./main.ts";
import {
  applyPatch,
  DEFAULT_SETTINGS,
  isJevAdvice,
  normalizeSettings,
  summarizeUsage,
  toView,
  type JevAdvice,
  type UsageRecord,
} from "./shared.ts";
import { CACHE_TTL_MS, decideTier } from "./tiering.ts";

describe("settings", () => {
  it("normalizes junk to defaults and clamps ranges", () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    const s = normalizeSettings({ apiKey: "  k ", compact: { floorPct: 500, enabled: "no" }, maxCallsPerDay: -4, pricePerMTokUsd: "x", model: " " });
    expect(s.apiKey).toBe("k");
    expect(s.compact).toEqual({ enabled: true, floorPct: 95 });
    expect(s.maxCallsPerDay).toBe(0);
    expect(s.pricePerMTokUsd).toBeNull();
    expect(s.model).toBe("jev-latest");
  });

  it("never exposes the key in the view", () => {
    const v = toView({ ...DEFAULT_SETTINGS, apiKey: "secret-abcd" });
    expect(JSON.stringify(v)).not.toContain("secret");
    expect(v).toMatchObject({ hasKey: true, keyHint: "…abcd" });
    expect(toView(DEFAULT_SETTINGS)).toMatchObject({ hasKey: false, keyHint: "" });
  });

  it("patches deeply, keeps the key when omitted, clears it with an empty string", () => {
    const base = { ...DEFAULT_SETTINGS, apiKey: "k1" };
    expect(applyPatch(base, { compact: { floorPct: 60 } })).toMatchObject({ apiKey: "k1", compact: { enabled: true, floorPct: 60 } });
    expect(applyPatch(base, { apiKey: "" }).apiKey).toBe("");
    expect(applyPatch(base, { apiKey: "k2" }).apiKey).toBe("k2");
  });

  it("records consent only as a positive timestamp and lets the user revoke it", () => {
    expect(normalizeSettings({ consentAt: "yes" }).consentAt).toBeNull();
    expect(normalizeSettings({ consentAt: 0 }).consentAt).toBeNull();
    const accepted = applyPatch(DEFAULT_SETTINGS, { consentAt: 1_700_000_000_000 });
    expect(accepted.consentAt).toBe(1_700_000_000_000);
    expect(toView(accepted).consentAt).toBe(1_700_000_000_000);
    expect(applyPatch(accepted, { apiKey: "k" }).consentAt).toBe(1_700_000_000_000);
    expect(applyPatch(accepted, { consentAt: null }).consentAt).toBeNull();
  });

  it("re-anchors the credit estimate only when the credit figure changes", () => {
    const a = applyPatch(DEFAULT_SETTINGS, { creditUsd: 10 });
    expect(a.creditSince).toBeGreaterThan(0);
    const b = applyPatch({ ...a, creditSince: 123 }, { pricePerMTokUsd: 1 });
    expect(b.creditSince).toBe(123);
  });
});

describe("usage", () => {
  const now = new Date(2026, 9, 4, 15, 0).getTime();
  const rec = (over: Partial<UsageRecord>): UsageRecord => ({ ts: now, feature: "compact", model: "m", inputTokens: 1_000_000, outputTokens: 5, ms: 300, ok: true, ...over });

  it("buckets by day, week and total and prices input tokens only", () => {
    const records = [
      rec({}),
      rec({ ts: now - 2 * 24 * 3600_000, feature: "ask_jev", inputTokens: 500_000 }),
      rec({ ts: now - 30 * 24 * 3600_000 }),
      rec({ ok: false, inputTokens: 0, error: "HTTP 500" }),
    ];
    const s = summarizeUsage(records, { pricePerMTokUsd: 2, creditUsd: null, creditSince: null }, now);
    expect(s.today).toMatchObject({ calls: 2, failed: 1, inputTokens: 1_000_000, costUsd: 2 });
    expect(s.last7d.calls).toBe(3);
    expect(s.total).toMatchObject({ calls: 4, inputTokens: 2_500_000, costUsd: 5 });
    expect(s.byFeature.ask_jev!.calls).toBe(1);
    expect(s.lastError?.message).toBe("HTTP 500");
    expect(s.remainingUsd).toBeNull();
  });

  it("falls back to the list price and estimates remaining credit from the anchor", () => {
    const d = summarizeUsage([rec({})], { pricePerMTokUsd: null, creditUsd: 10, creditSince: null }, now);
    expect(d.pricePerMTokUsd).toBe(0.042);
    expect(d.total.costUsd).toBeCloseTo(0.042);
    const s = summarizeUsage(
      [rec({ ts: now - 1000 }), rec({ ts: now - 10 * 24 * 3600_000, inputTokens: 9_000_000 })],
      { pricePerMTokUsd: 1, creditUsd: 10, creditSince: now - 3600_000 },
      now,
    );
    expect(s.remainingUsd).toBe(9);
    expect(s.spentSinceCreditUsd).toBe(1);
    expect(s.remainingTokens).toBe(9_000_000);
    expect(s.avgDailyUsd).toBeCloseTo(1 / 7);
    expect(s.daysLeft).toBeCloseTo(63);
    expect(summarizeUsage([rec({ inputTokens: 99_000_000 })], { pricePerMTokUsd: 1, creditUsd: 5, creditSince: 0 }, now).remainingUsd).toBe(0);
  });

  it("parses the log and skips torn lines", () => {
    const text = `${JSON.stringify(rec({}))}\n{"ts":\n${JSON.stringify(rec({ ok: false, error: "x" }))}\n`;
    const out = parseUsageLog(text);
    expect(out).toHaveLength(2);
    expect(out[1]).toMatchObject({ ok: false, error: "x" });
  });
});

describe("testKey", () => {
  it("lists models and surfaces balance-like headers", async () => {
    const res = new Response(JSON.stringify({ models: [{ name: "jev-latest" }] }), {
      headers: { "x-credit-remaining": "4.20", "cf-ray": "abc", "content-type": "application/json" },
    });
    const r = await testKey("k", vi.fn(async () => res) as any);
    expect(r).toEqual({ ok: true, models: ["jev-latest"], balanceHeaders: { "x-credit-remaining": "4.20" } });
  });

  it("reports rejected keys, missing keys and network errors", async () => {
    const denied = vi.fn(async () => new Response(JSON.stringify({ detail: { message: "Invalid API key" } }), { status: 401 }));
    expect(await testKey("k", denied as any)).toEqual({ ok: false, error: "Key rejected: Invalid API key" });
    expect(await testKey("")).toMatchObject({ ok: false });
    expect(await testKey("k", (async () => { throw new Error("offline"); }) as any)).toEqual({ ok: false, error: "offline" });
  });
});

describe("tiering", () => {
  const advice = (over: Omit<Partial<JevAdvice>, "signals"> & { signals?: Partial<JevAdvice["signals"]> } = {}): JevAdvice => ({
    kind: "jev_advice",
    entryId: "e1",
    at: 0,
    usagePct: 60,
    tokens: 120_000,
    contextWindow: 200_000,
    ...over,
    signals: { switchedGears: 0.1, atBoundary: 0.9, midOperation: 0.1, needsHistory: 0.3, ...over.signals },
  });
  const tier = (a: JevAdvice, idleMs = 0, floorPct = 40) => decideTier({ advice: a, idleMs, floorPct }).tier;

  it("is silent below the floor, with tiny contexts, or mid-operation", () => {
    expect(tier(advice({ usagePct: 30 }))).toBe("silent");
    expect(tier(advice({ tokens: 5_000 }))).toBe("silent");
    expect(tier(advice({ signals: { midOperation: 0.9 } }))).toBe("silent");
  });

  it("escalates at a boundary as usage and a cold cache add up", () => {
    expect(tier(advice({ usagePct: 42, signals: { needsHistory: 1.5 } }))).toBe("notice");
    expect(tier(advice({ usagePct: 50 }))).toBe("recommend");
    expect(tier(advice({ usagePct: 60 }), CACHE_TTL_MS)).toBe("request");
  });

  it("only ever nudges without a task boundary", () => {
    const noBoundary = advice({ usagePct: 90, signals: { atBoundary: 0.2, switchedGears: 0.1 } });
    expect(tier(noBoundary)).toBe("notice");
    expect(tier(advice({ usagePct: 42, signals: { atBoundary: 0.2, needsHistory: 1.5 } }))).toBe("silent");
  });

  it("treats a switch of tasks as a boundary and explains itself", () => {
    const r = decideTier({ advice: advice({ signals: { atBoundary: 0.1, switchedGears: 0.95 } }), idleMs: CACHE_TTL_MS, floorPct: 40 });
    expect(r.reasons).toEqual(["you moved on to a new task", "prompt cache expired, so compacting is cheap now", "next step needs little of the earlier chat"]);
  });
});

describe("isJevAdvice", () => {
  it("accepts well-formed records only", () => {
    const good = { kind: "jev_advice", entryId: "e", at: 1, usagePct: 1, tokens: 1, contextWindow: 1, signals: { switchedGears: 0, atBoundary: 0, midOperation: 0, needsHistory: 0 } };
    expect(isJevAdvice(good)).toBe(true);
    expect(isJevAdvice({ ...good, kind: "form" })).toBe(false);
    expect(isJevAdvice({ ...good, signals: { switchedGears: 0 } })).toBe(false);
    expect(isJevAdvice(null)).toBe(false);
  });
});
