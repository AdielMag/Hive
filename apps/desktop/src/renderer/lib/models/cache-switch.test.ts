import { describe, expect, it } from "vitest";
import { createTranscript, type TranscriptState } from "@hive/pi-adapter";
import { estimateSwitchSavings, isRecent, isWorthCompacting, lastResponse, RECENT_RESPONSE_MS, SUMMARY_TOKENS_ESTIMATE } from "./cache-switch.ts";

const usage = (input: number, cacheRead = 0, cacheWrite = 0) => ({ input, output: 100, cacheRead, cacheWrite, totalTokens: input + cacheRead + cacheWrite + 100 });

function transcriptOf(entries: Array<Record<string, unknown>>): TranscriptState {
  const t = createTranscript();
  const byId: Record<string, any> = {};
  let parentId: string | null = null;
  entries.forEach((e, i) => {
    const id = `e${i}`;
    byId[id] = { id, parentId, timestamp: new Date(0).toISOString(), ...e };
    parentId = id;
  });
  return { ...t, byId, order: Object.keys(byId), leafId: parentId };
}

const user = (ts: number) => ({ type: "message", message: { role: "user", content: "hi", timestamp: ts } });
const asst = (ts: number, model: string, u = usage(1000), extra: Record<string, unknown> = {}) => ({
  type: "message",
  message: { role: "assistant", content: [], provider: "anthropic", model, timestamp: ts, usage: u, stopReason: "stop", ...extra },
});

describe("lastResponse", () => {
  it("returns the newest assistant response and the first response's prompt size as baseline", () => {
    const t = transcriptOf([user(1), asst(2, "opus", usage(10, 0, 9000)), user(3), asst(4, "sonnet", usage(5, 50_000, 2000))]);
    expect(lastResponse(t)).toEqual({ key: "anthropic/sonnet@4", provider: "anthropic", model: "sonnet", at: 4, baselineTokens: 9010 });
  });

  it("only counts as mid-session when the last response is recent", () => {
    const last = lastResponse(transcriptOf([user(1), asst(1_000, "opus")]))!;
    expect(isRecent(last, 1_000 + RECENT_RESPONSE_MS - 1)).toBe(true);
    expect(isRecent(last, 1_000 + RECENT_RESPONSE_MS)).toBe(false);
  });

  it("ignores aborted/errored responses", () => {
    const t = transcriptOf([user(1), asst(2, "opus"), user(3), asst(4, "sonnet", usage(1), { stopReason: "error" })]);
    expect(lastResponse(t)?.model).toBe("opus");
  });

  it("is null after a compaction", () => {
    const t = transcriptOf([user(1), asst(2, "opus"), { type: "compaction", summary: "s", firstKeptEntryId: "e0", tokensBefore: 1 }]);
    expect(lastResponse(t)).toBeNull();
  });

  it("includes live (not yet synced) messages", () => {
    const t = { ...transcriptOf([user(1), asst(2, "opus")]), live: [{ role: "assistant", provider: "openai", model: "gpt", timestamp: 9, stopReason: "stop" }] };
    expect(lastResponse(t)?.key).toBe("openai/gpt@9");
  });
});

describe("estimateSwitchSavings", () => {
  it("keeps baseline + recent tail + summary", () => {
    const a = estimateSwitchSavings({ contextTokens: 150_000, baselineTokens: 10_000, keepRecentTokens: 20_000 });
    expect(a.afterCompactTokens).toBe(10_000 + 20_000 + SUMMARY_TOKENS_ESTIMATE);
    expect(a.savedTokens).toBe(150_000 - 32_000);
    expect(isWorthCompacting(a)).toBe(true);
  });

  it("saves nothing when the conversation fits in the kept tail", () => {
    const a = estimateSwitchSavings({ contextTokens: 25_000, baselineTokens: 10_000, keepRecentTokens: 20_000 });
    expect(a.savedTokens).toBe(0);
    expect(isWorthCompacting(a)).toBe(false);
  });

  it("clamps a baseline larger than the context", () => {
    const a = estimateSwitchSavings({ contextTokens: 5_000, baselineTokens: 9_000, keepRecentTokens: 1_000 });
    expect(a).toEqual({ contextTokens: 5_000, afterCompactTokens: 5_000, savedTokens: 0 });
  });
});
