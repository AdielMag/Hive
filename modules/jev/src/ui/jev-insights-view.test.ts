import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InsightsBody, ScanSection, TrendChart, type InsightsBodyProps } from "./JevInsights.tsx";
import { summarizeImpact, type JevEvent, type JevInsights, type SessionScanSummary, type UsageRecord } from "../shared.ts";

const NOW = new Date(2026, 5, 15, 12, 0, 0).getTime();
const HOUR = 3600_000;
const DAY = 24 * HOUR;
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

const scan: SessionScanSummary = {
  generatedAt: NOW,
  windowDays: 30,
  scannedSessions: 12,
  reread: { filesSent: 20, reread: 5, rate: 0.25 },
  withJev: { sessions: 4, turns: 80, avgInputTokensPerTurn: 41_000, compactions: 2, compactionsPerSession: 0.5 },
  withoutJev: { sessions: 8, turns: 120, avgInputTokensPerTurn: 52_000, compactions: 8, compactionsPerSession: 1 },
  caveat: "The groups differ in more than Jev.",
};

const render = (props: Partial<InsightsBodyProps> & { data: JevInsights | null }): string =>
  renderToStaticMarkup(createElement(InsightsBody, { range: 30, ...props }));

const emptyData = (scanValue: SessionScanSummary | null = null): JevInsights => ({ impact: summarizeImpact([], [], settings, NOW), scan: scanValue });

const populated = (): JevInsights => {
  const usage = [
    rec({ savedTokensEst: 100_000, questions: { noul: 2, choice: 0, score: 0 }, confidence: [0.95, 0.6], sessionId: "abcdef1234567890", toolCallId: "tc1", cwd: "/work/app", ts: NOW - HOUR }),
    rec({ savedTokensEst: 50_000, inputTokens: 2000, ts: NOW - 2 * DAY, sessionId: "feedbeefcafe0000" }),
    rec({ feature: "compact", ms: 900, ts: NOW - 3 * HOUR }),
    rec({ ok: false, errorKind: "timeout", inputTokens: 0, ms: 5000, ts: NOW - 4 * HOUR }),
    rec({ ok: false, errorKind: "cap", inputTokens: 0, ms: 0, ts: NOW - 5 * HOUR }),
  ];
  const events = [
    ev({ kind: "advice", entryId: "e1", tier: "recommend", usagePct: 70 }),
    ev({ kind: "shown", entryId: "e1" }),
    ev({ kind: "compact", entryId: "e1", usagePct: 72 }),
    ev({ kind: "manualCompact", entryId: "e2", usagePct: 90 }),
  ] as JevEvent[];
  return { impact: summarizeImpact(usage, events, settings, NOW), scan };
};

describe("InsightsBody", () => {
  it("shows a loading state before the first fetch", () => {
    const html = render({ data: null });
    expect(html).toContain("Loading insights");
    expect(html).not.toContain("jev-headlines");
  });

  it("shows an empty state (and the scan loading state) with no data", () => {
    const html = render({ data: emptyData() });
    expect(html).toContain("No Jev activity yet");
    expect(html).toContain("Scanning session files");
    expect(html).not.toContain("jev-headlines");
    expect(html).not.toContain("NaN");
  });

  it("surfaces an error message", () => {
    expect(render({ data: null, error: "boom" })).toContain("boom");
  });

  it("renders headline cards labelled as estimates", () => {
    const html = render({ data: populated() });
    expect(html).toContain("jev-headlines");
    expect(html).toContain("Net savings");
    expect(html).toContain("est.");
    // 150k tokens at $10/MTok = $1.50 saved, minus about $0.004 of Jev cost.
    expect(html).toContain("$1.50");
    expect(html).toContain("150.0k tokens saved");
    expect(html).toContain("Hint acceptance");
    expect(html).toContain("100%");
    expect(html).toContain("Low confidence");
    expect(html).toContain("Errors");
    expect(html).not.toContain("NaN");
    expect(html).not.toContain("undefined");
  });

  it("renders trend, feature split, funnel, health and decisiveness sections", () => {
    const html = render({ data: populated() });
    expect(html).toContain("jev-chart__svg");
    expect(html).toContain("aria-pressed=\"true\"");
    expect(html).toContain("ask_jev tool");
    expect(html).toContain("Compaction hints");
    expect(html).toContain("Missed (compacted with no hint)");
    expect(html).toContain("Avg context at compaction, with hint");
    expect(html).toContain("Silent calls");
    expect(html).toContain("p95");
    expect(html).toContain("Timeout");
    expect(html).toContain("Daily cap");
    expect(html).toContain("Decisive = confidence");
  });

  it("renders the session scan with the correlation caveat and the recent calls table", () => {
    const html = render({ data: populated(), sessionTitle: (id) => (id.startsWith("abcdef") ? "Fix the parser" : undefined), copiedId: "feedbeefcafe0000" });
    expect(html).toContain("Correlation, not causation");
    expect(html).toContain("25%");
    expect(html).toContain("With ask_jev");
    expect(html).toContain("Without ask_jev");
    expect(html).toContain("41.0k");
    expect(html).toContain("Recent calls");
    expect(html).toContain("<code>abcdef12</code>");
    expect(html).toContain("Fix the parser");
    expect(html).toContain("Copy session id abcdef1234567890");
    expect(html).toContain("refused");
  });

  it("limits the trend to the selected range", () => {
    const d = populated();
    const bars = (range: 7 | 30): number => (render({ data: d, range }).match(/jev-chart__bar"/g) ?? []).length;
    expect(bars(30)).toBe(30);
    expect(bars(7)).toBe(7);
  });

  it("shows the scan placeholder while the scan is still null with populated usage", () => {
    const d = { ...populated(), scan: null };
    expect(render({ data: d })).toContain("jev-scan__loading");
  });
});

describe("pieces", () => {
  it("TrendChart has an inline empty state for all-zero series", () => {
    const html = renderToStaticMarkup(createElement(TrendChart, { days: emptyData().impact.daily }));
    expect(html).toContain("No calls with savings or cost");
  });

  it("ScanSection handles zero scanned sessions", () => {
    const html = renderToStaticMarkup(createElement(ScanSection, { scan: { ...scan, scannedSessions: 0 } }));
    expect(html).toContain("No session files found");
  });
});
