import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createEventLog, parseEventLog, parseUsageLog } from "./main.ts";
import { normalizePath, parseSessionScan, summarizeScan } from "./session-scan.ts";
import {
  dedupeEvents,
  DAILY_SERIES_DAYS,
  normalizeSettings,
  parseJevEvent,
  percentile,
  summarizeImpact,
  toView,
  type JevAdvice,
  type JevEvent,
  type UsageRecord,
} from "./shared.ts";
import { jevStore } from "./ui/jev-store.ts";

const NOW = new Date(2026, 5, 15, 12, 0, 0).getTime();
const HOUR = 3600_000;
const settings = { pricePerMTokUsd: 1, mainModelPricePerMTokUsd: 10, maxCallsPerDay: 10 };

const rec = (over: Partial<UsageRecord> = {}): UsageRecord => ({
  ts: NOW - HOUR,
  feature: "ask_jev",
  model: "jev-latest",
  inputTokens: 1000,
  outputTokens: 0,
  ms: 400,
  ok: true,
  ...over,
});
const ev = (over: Partial<JevEvent>): JevEvent => ({ ts: NOW, kind: "advice", key: "s1", entryId: "e1", ...over });

describe("summarizeImpact", () => {
  it("values saved tokens at the main-model price minus Jev cost", () => {
    const s = summarizeImpact(
      [rec({ savedTokensEst: 100_000 }), rec({ savedTokensEst: 50_000, inputTokens: 2000 }), rec({ ok: false, savedTokensEst: 999_999 })],
      [],
      settings,
      NOW,
    );
    expect(s.net.savedTokensEst).toBe(150_000);
    expect(s.net.callsWithSavings).toBe(2);
    expect(s.net.savingsUsd).toBeCloseTo(1.5);
    expect(s.net.jevCostUsd).toBeCloseTo(0.004);
    expect(s.net.netUsd).toBeCloseTo(1.496);
  });

  it("falls back to default prices and excludes refused calls from totals but not from error counts", () => {
    const s = summarizeImpact(
      [rec({ savedTokensEst: 1_000_000 }), rec({ ok: false, errorKind: "cap", inputTokens: 0 }), rec({ ok: false, errorKind: "timeout", inputTokens: 0 })],
      [],
      { pricePerMTokUsd: null, mainModelPricePerMTokUsd: null, maxCallsPerDay: 0 },
      NOW,
    );
    expect(s.net.mainModelPricePerMTokUsd).toBe(3);
    expect(s.net.jevPricePerMTokUsd).toBe(0.042);
    expect(s.calls).toBe(2);
    expect(s.failedCalls).toBe(1);
    expect(s.errorRate).toBe(0.5);
    expect(s.errorsByKind).toEqual({ cap: 1, timeout: 1 });
    expect(s.cap.remainingToday).toBeNull();
    expect(s.recent.find((r) => r.errorKind === "cap")?.refused).toBe(true);
  });

  it("computes decisiveness overall and per type (mixed-type calls only count overall)", () => {
    const s = summarizeImpact(
      [
        rec({ questions: { noul: 2, choice: 0, score: 0 }, confidence: [0.95, 0.6] }),
        rec({ questions: { noul: 0, choice: 1, score: 0 }, confidence: [0.8] }),
        rec({ questions: { noul: 1, choice: 1, score: 0 }, confidence: [0.9, 0.5] }),
        rec({}),
      ],
      [],
      settings,
      NOW,
    );
    expect(s.decisiveness.answers).toBe(5);
    expect(s.decisiveness.share).toBeCloseTo(3 / 5);
    expect(s.decisiveness.byType.noul).toEqual({ share: 0.5, answers: 2 });
    expect(s.decisiveness.byType.choice).toEqual({ share: 1, answers: 1 });
    expect(s.decisiveness.byType.score).toEqual({ share: null, answers: 0 });
  });

  it("builds the hint funnel with precision, missed and context % with vs without a hint", () => {
    const events: JevEvent[] = [
      ev({ kind: "advice", entryId: "a", tier: "recommend" }),
      ev({ kind: "advice", entryId: "b", tier: "silent" }),
      ev({ kind: "advice", entryId: "c", tier: "notice" }),
      ev({ kind: "shown", entryId: "a" }),
      ev({ kind: "shown", entryId: "c" }),
      ev({ kind: "shown", entryId: "c" }), // duplicate
      ev({ kind: "compact", entryId: "a", usagePct: 60 }),
      ev({ kind: "ignored", entryId: "c" }),
      ev({ kind: "manualCompact", entryId: undefined, usagePct: 80 }),
      ev({ kind: "manualCompact", entryId: undefined, usagePct: 90 }),
    ];
    const s = summarizeImpact([rec({ feature: "compact" }), rec({ feature: "compact" }), rec({ feature: "compact" }), rec({ feature: "compact" })], events, settings, NOW);
    expect(s.funnel).toMatchObject({
      advice: 3,
      silentAdvice: 1,
      shown: 2,
      compacted: 1,
      dismissed: 0,
      ignored: 1,
      pending: 0,
      precision: 0.5,
      missed: 2,
      avgPctWithHint: 60,
      avgPctWithoutHint: 85,
    });
    expect(s.silent).toEqual({ compactCalls: 4, silentCalls: 2, silentShare: 0.5 });
  });

  it("reports no silent share without funnel data and no precision with nothing shown", () => {
    const s = summarizeImpact([rec({ feature: "compact" })], [], settings, NOW);
    expect(s.silent.silentShare).toBeNull();
    expect(s.funnel.precision).toBeNull();
    expect(s.funnel.avgPctWithHint).toBeNull();
  });

  it("computes latency percentiles, cap headroom and the per-feature split", () => {
    const records = Array.from({ length: 20 }, (_, i) => rec({ ms: (i + 1) * 100, feature: i % 2 ? "compact" : "ask_jev" }));
    const s = summarizeImpact(records, [], settings, NOW);
    expect(s.latency).toEqual({ p50Ms: 1000, p95Ms: 1900, samples: 20 });
    expect(s.cap).toEqual({ maxCallsPerDay: 10, usedToday: 20, remainingToday: 0 });
    expect(Object.keys(s.byFeature).sort()).toEqual(["ask_jev", "compact"]);
    expect(s.byFeature.compact!.calls).toBe(10);
    expect(percentile([], 50)).toBeNull();
  });

  it("builds a 30-day daily series ending today and keeps the 50 newest calls", () => {
    const old = rec({ ts: NOW - 40 * 24 * HOUR });
    const day3 = rec({ ts: NOW - 3 * 24 * HOUR, savedTokensEst: 1_000_000 });
    const many = Array.from({ length: 60 }, (_, i) => rec({ ts: NOW - i * 60_000 }));
    const s = summarizeImpact([old, day3, ...many], [], settings, NOW);
    expect(s.daily).toHaveLength(DAILY_SERIES_DAYS);
    expect(s.daily.at(-1)!.calls).toBe(60);
    expect(s.daily.at(-4)!.calls).toBe(1);
    expect(s.daily.at(-4)!.savingsUsd).toBeCloseTo(10);
    expect(s.daily.reduce((n, d) => n + d.calls, 0)).toBe(61); // the 40-day-old call is outside the window
    expect(s.recent).toHaveLength(50);
    expect(s.recent[0]!.ts).toBeGreaterThanOrEqual(s.recent[49]!.ts);
  });

  it("carries session links on recent calls", () => {
    const s = summarizeImpact([rec({ sessionId: "sid", toolCallId: "tc", cwd: "/p", savedTokensEst: 5 }), rec({ ts: NOW - 2 * HOUR })], [], settings, NOW);
    expect(s.recent[0]).toMatchObject({ feature: "ask_jev", ok: true, ms: 400, tokens: 1000, savedTokensEst: 5, sessionId: "sid", toolCallId: "tc", cwd: "/p", refused: false });
    expect(s.recent[1]).not.toHaveProperty("sessionId");
  });

  it("handles an empty log", () => {
    const s = summarizeImpact([], [], settings, NOW);
    expect(s.calls).toBe(0);
    expect(s.errorRate).toBeNull();
    expect(s.latency.p50Ms).toBeNull();
    expect(s.net.netUsd).toBe(0);
    expect(s.recent).toEqual([]);
  });
});

describe("old and new record shapes", () => {
  it("parses old usage lines and new ones with the same function", () => {
    const text = [
      JSON.stringify({ ts: 1, feature: "compact", model: "m", inputTokens: 5, outputTokens: 0, ms: 9, ok: true }),
      JSON.stringify({ ts: 2, feature: "ask_jev", model: "m", inputTokens: 5, outputTokens: 0, ms: 9, ok: true, sessionId: "s", savedTokensEst: 10, confidence: [0.9], questions: { noul: 1 } }),
      "{torn",
    ].join("\n");
    const recs = parseUsageLog(text);
    expect(recs).toHaveLength(2);
    expect(recs[0]).not.toHaveProperty("savedTokensEst");
    expect(recs[1]!.questions).toEqual({ noul: 1, choice: 0, score: 0 });
    expect(summarizeImpact(recs, [], settings, 100).calls).toBe(2);
  });

  it("parses events and rejects junk", () => {
    expect(parseJevEvent({ ts: 1, kind: "shown", key: "k", entryId: "e", tier: "request", usagePct: 70 })).toEqual({ ts: 1, kind: "shown", key: "k", entryId: "e", tier: "request", usagePct: 70 });
    expect(parseJevEvent({ ts: 1, kind: "nope", key: "k" })).toBeNull();
    expect(parseJevEvent({ kind: "shown", key: "k" })).toBeNull();
    expect(parseJevEvent({ ts: 1, kind: "advice", key: "k", signals: { atBoundary: 1 } })!.signals).toEqual({ switchedGears: 0, atBoundary: 1, midOperation: 0, needsHistory: 0 });
  });
});

describe("main-model price setting", () => {
  it("defaults to null, validates and reaches the view", () => {
    expect(normalizeSettings({}).mainModelPricePerMTokUsd).toBeNull();
    expect(normalizeSettings({ mainModelPricePerMTokUsd: 15 }).mainModelPricePerMTokUsd).toBe(15);
    expect(normalizeSettings({ mainModelPricePerMTokUsd: -1 }).mainModelPricePerMTokUsd).toBeNull();
    expect(toView(normalizeSettings({ mainModelPricePerMTokUsd: 15 })).mainModelPricePerMTokUsd).toBe(15);
  });
});

describe("events.jsonl", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "jev-events-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("dedupes per key + entryId + kind, across restarts, and keeps entry-less events", () => {
    const path = join(dir, "events.jsonl");
    const log = createEventLog(path);
    expect(log.append(ev({ kind: "shown" }))).toBe(true);
    expect(log.append(ev({ kind: "shown" }))).toBe(false);
    expect(log.append(ev({ kind: "compact" }))).toBe(true);
    expect(log.append(ev({ kind: "shown", key: "s2" }))).toBe(true);
    expect(log.append(ev({ kind: "manualCompact", entryId: undefined }))).toBe(true);
    expect(log.append(ev({ kind: "manualCompact", entryId: undefined }))).toBe(true);
    expect(log.append({ nonsense: true })).toBe(false);
    expect(parseEventLog(readFileSync(path, "utf8"))).toHaveLength(5);
    expect(createEventLog(path).append(ev({ kind: "compact" }))).toBe(false);
    expect(dedupeEvents(createEventLog(path).read())).toHaveLength(5);
  });

  it("trims to the newest half past the size cap", () => {
    const path = join(dir, "events.jsonl");
    const log = createEventLog(path, 600);
    for (let i = 0; i < 20; i++) log.append(ev({ kind: "advice", entryId: `e${i}`, usagePct: i }));
    const kept = parseEventLog(readFileSync(path, "utf8"));
    expect(kept.length).toBeLessThan(20);
    expect(kept.at(-1)!.entryId).toBe("e19");
  });
});

describe("jevStore hint funnel", () => {
  const advice = (entryId: string, usagePct = 70): JevAdvice => ({
    kind: "jev_advice",
    entryId,
    at: Date.now(),
    usagePct,
    tokens: usagePct * 1000,
    contextWindow: 100_000,
    signals: { switchedGears: 0, atBoundary: 1, midOperation: 0, needsHistory: 0 },
  });
  let out: JevEvent[];
  const kinds = () => out.map((e) => `${e.kind}:${e.entryId ?? "-"}`);

  beforeEach(() => {
    jevStore.reset();
    out = [];
    jevStore.setEventSink((e) => out.push(e));
  });
  afterEach(() => jevStore.setEventSink(null));

  it("logs advice with its tier, shown once, and compact on click", () => {
    jevStore.setAdvice("s1", advice("e1"));
    jevStore.setAdvice("s1", advice("e1")); // same entry again: no new advice event
    jevStore.markShown("s1", "recommend");
    jevStore.markShown("s1", "recommend");
    jevStore.requestCompact("s1");
    jevStore.compactionEnded("s1", { result: { tokensBefore: 70_000 } }); // our own compaction: already logged
    jevStore.clearAdvice("s1");
    expect(kinds()).toEqual(["advice:e1", "shown:e1", "compact:e1"]);
    expect(out[0]).toMatchObject({ key: "s1", usagePct: 70, tier: "request" });
    expect(out[0]!.signals).toBeDefined();
    expect(out[2]!.usagePct).toBe(70);
  });

  it("logs dismiss and no ignored afterwards", () => {
    jevStore.setAdvice("s1", advice("e1"));
    jevStore.markShown("s1", "notice");
    jevStore.dismiss("s1");
    jevStore.dismiss("s1");
    jevStore.setAdvice("s1", advice("e2"));
    expect(kinds()).toEqual(["advice:e1", "shown:e1", "dismiss:e1", "advice:e2"]);
  });

  it("logs ignored when a shown hint is superseded by new advice or the next turn, never for unshown ones", () => {
    jevStore.setAdvice("s1", advice("e1"));
    jevStore.markShown("s1", "notice");
    jevStore.setAdvice("s1", advice("e2")); // supersedes shown e1
    jevStore.markShown("s1", "recommend");
    jevStore.clearAdvice("s1"); // agent_start: e2 ignored
    jevStore.setAdvice("s1", advice("e3")); // never shown
    jevStore.clearAdvice("s1");
    expect(kinds()).toEqual(["advice:e1", "shown:e1", "ignored:e1", "advice:e2", "shown:e2", "ignored:e2", "advice:e3"]);
  });

  it("ignores silent tier for shown and logs ignored on reset (session end)", () => {
    jevStore.setAdvice("s1", advice("e1"));
    jevStore.markShown("s1", "silent");
    jevStore.markShown("s1", "request");
    jevStore.reset();
    expect(kinds()).toEqual(["advice:e1", "shown:e1", "ignored:e1"]);
  });

  it("logs manualCompact with context % when no hint is showing, and skips aborted/failed ones", () => {
    jevStore.setAdvice("s1", advice("e1", 50)); // advice exists but was never shown
    jevStore.compactionEnded("s1", { aborted: true });
    jevStore.compactionEnded("s1", { errorMessage: "boom" });
    jevStore.compactionEnded("s1", { reason: "manual", result: { tokensBefore: 90_000 } });
    const manual = out.find((e) => e.kind === "manualCompact")!;
    expect(out.filter((e) => e.kind === "manualCompact")).toHaveLength(1);
    expect(manual).toMatchObject({ key: "s1", usagePct: 90, tokensBefore: 90_000, reason: "manual" });
    expect(manual.entryId).toBeUndefined();
  });

  it("counts a compaction while a hint is showing as acting on it", () => {
    jevStore.setAdvice("s1", advice("e1", 65));
    jevStore.markShown("s1", "request");
    jevStore.compactionEnded("s1", { result: { tokensBefore: 65_000 } });
    jevStore.clearAdvice("s1");
    expect(kinds()).toEqual(["advice:e1", "shown:e1", "compact:e1"]);
  });

  it("feeds summarizeImpact end to end", () => {
    jevStore.setAdvice("s1", advice("e1", 60));
    jevStore.markShown("s1", "recommend");
    jevStore.requestCompact("s1");
    jevStore.clearAdvice("s1");
    jevStore.setAdvice("s1", advice("e2", 70));
    jevStore.markShown("s1", "notice");
    jevStore.clearAdvice("s1");
    jevStore.compactionEnded("s2", { result: { tokensBefore: 85_000 } });
    const s = summarizeImpact([], out, settings, NOW);
    expect(s.funnel).toMatchObject({ advice: 2, shown: 2, compacted: 1, ignored: 1, precision: 0.5, missed: 1, avgPctWithHint: 60 });
  });
});

describe("session scan", () => {
  const line = (o: unknown) => JSON.stringify(o);
  const header = line({ type: "session", cwd: "C:\\proj" });
  const assistant = (calls: Array<{ name: string; arguments: Record<string, unknown> }>, usage = { input: 10, cacheRead: 90, cacheWrite: 0 }) =>
    line({ type: "message", message: { role: "assistant", content: calls.map((c) => ({ type: "toolCall", id: "x", ...c })), usage } });
  const ask = (files: string[]) => ({ name: "ask_jev", arguments: { state: "s", files, questions: {} } });
  const read = (path: string) => ({ name: "read", arguments: { path } });
  const bash = { name: "bash", arguments: { command: "ls" } };

  it("normalizes the path shapes seen in sessions", () => {
    expect(normalizePath("C:\\Proj\\a.ts")).toBe("c:/proj/a.ts");
    expect(normalizePath("/c/proj/./x/../a.ts")).toBe("c:/proj/a.ts");
    expect(normalizePath("src/a.ts", "C:\\proj")).toBe("c:/proj/src/a.ts");
    expect(normalizePath("/home/u/a.ts")).toBe("/home/u/a.ts");
  });

  it("detects a re-read within 5 tool calls of sending the file to ask_jev", () => {
    const text = [
      header,
      assistant([ask(["src/a.ts", "src/b.ts"])]),
      assistant([bash, bash]),
      assistant([read("C:/proj/src/a.ts")]), // 4th tool call after ask: within window
    ].join("\n");
    const e = parseSessionScan(text);
    expect(e).toMatchObject({ usedJev: true, filesSent: 2, reread: 1 });
  });

  it("does not count reads beyond the window, before the ask, or of other files", () => {
    const text = [
      header,
      assistant([read("src/a.ts")]),
      assistant([ask(["src/a.ts"])]),
      assistant([bash, bash, bash, bash, bash]),
      assistant([read("src/a.ts")]), // 6th call after the ask
      assistant([read("src/other.ts")]),
    ].join("\n");
    expect(parseSessionScan(text)).toMatchObject({ filesSent: 1, reread: 0 });
  });

  it("counts files sent through a batch ask_jev call (items[].files)", () => {
    const batch = {
      name: "ask_jev",
      arguments: { questions: {}, items: [{ id: "a", files: ["src/a.ts", "src/b.ts"] }, { id: "c", command: "git diff" }, { id: "d", files: ["src/d.ts"] }, null, { files: "nope" }] },
    };
    const text = [header, assistant([batch]), assistant([read("C:/proj/src/b.ts"), read("C:/proj/src/d.ts"), read("C:/proj/src/zzz.ts")])].join("\n");
    expect(parseSessionScan(text)).toMatchObject({ usedJev: true, filesSent: 3, reread: 2 });
  });

  it("counts a given sent file at most once per ask and handles mixed path styles", () => {
    const text = [header, assistant([ask(["/c/proj/src/a.ts"])]), assistant([read("C:\\proj\\src\\a.ts"), read("C:/proj/src/a.ts")])].join("\n");
    expect(parseSessionScan(text).reread).toBe(1);
  });

  it("counts turns, main-model input tokens and compactions; skips torn lines", () => {
    const text = [
      header,
      assistant([bash], { input: 10, cacheRead: 90, cacheWrite: 100 }),
      assistant([], { input: 0, cacheRead: 0, cacheWrite: 0 }),
      "{broken",
      line({ type: "compaction", summary: "x" }),
      assistant([], { input: 50, cacheRead: 0, cacheWrite: 0 }),
      line({ type: "message", message: { role: "user", content: [] } }),
    ].join("\n");
    expect(parseSessionScan(text)).toEqual({ usedJev: false, filesSent: 0, reread: 0, turns: 2, inputTokens: 250, compactions: 1 });
  });

  it("summarizes sessions with vs without ask_jev", () => {
    const withJev = parseSessionScan([header, assistant([ask(["a"])], { input: 100, cacheRead: 0, cacheWrite: 0 }), line({ type: "compaction" })].join("\n"));
    const withJev2 = parseSessionScan([header, assistant([ask([])], { input: 300, cacheRead: 0, cacheWrite: 0 })].join("\n"));
    const without = parseSessionScan([header, assistant([bash], { input: 1000, cacheRead: 0, cacheWrite: 0 })].join("\n"));
    const s = summarizeScan([withJev, withJev2, without], 5);
    expect(s.scannedSessions).toBe(3);
    expect(s.withJev).toEqual({ sessions: 2, turns: 2, avgInputTokensPerTurn: 200, compactions: 1, compactionsPerSession: 0.5 });
    expect(s.withoutJev).toEqual({ sessions: 1, turns: 1, avgInputTokensPerTurn: 1000, compactions: 0, compactionsPerSession: 0 });
    expect(s.reread).toEqual({ filesSent: 1, reread: 0, rate: 0 });
    expect(summarizeScan([], 5).reread.rate).toBeNull();
  });
});
