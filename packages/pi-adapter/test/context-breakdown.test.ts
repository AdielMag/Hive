import { describe, expect, it } from "vitest";
import { applyEvent, applyEntries, createTranscript, estimateContextBreakdown } from "../src/transcript.ts";
import type { PiStreamEvent } from "@pi-studio/protocol";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";

const end = (message: Record<string, unknown>) =>
  ({ type: "message_end", message: { timestamp: Math.random(), ...message } }) as unknown as PiStreamEvent;

describe("estimateContextBreakdown", () => {
  it("attributes the whole total to system prompt & tools when the transcript is empty", () => {
    const r = estimateContextBreakdown(createTranscript(), 11_000);
    expect(r.categories).toHaveLength(1);
    expect(r.categories[0]).toMatchObject({ key: "system", tokens: 11_000 });
    expect(r.categories[0]!.percentage).toBeCloseTo(100);
  });

  it("counts live (not yet persisted) messages and sums exactly to the total", () => {
    let s = createTranscript();
    s = applyEvent(s, end({ role: "user", content: "x".repeat(400) }));
    s = applyEvent(
      s,
      end({
        role: "assistant",
        content: [
          { type: "thinking", thinking: "t".repeat(800) },
          { type: "text", text: "a".repeat(200) },
          { type: "toolCall", id: "c1", name: "read", arguments: { path: "src/index.ts" } },
        ],
      }),
    );
    s = applyEvent(s, end({ role: "toolResult", toolCallId: "c1", toolName: "read", content: [{ type: "text", text: "r".repeat(4000) }] }));

    const r = estimateContextBreakdown(s, 11_000);
    const keys = r.categories.map((c) => c.key);
    expect(keys).toEqual(expect.arrayContaining(["system", "user", "assistant", "thinking", "tool:read"]));
    expect(r.categories.reduce((a, c) => a + c.tokens, 0)).toBe(11_000);
    expect(r.categories.find((c) => c.key === "user")!.tokens).toBe(100);
    const readItem = r.topItems.find((t) => t.label === "read");
    expect(readItem?.detail).toBe("src/index.ts");
  });

  it("scales messages down when they exceed the reported total", () => {
    let s = createTranscript();
    s = applyEvent(s, end({ role: "user", content: "x".repeat(8000) })); // ~2000 tokens
    const r = estimateContextBreakdown(s, 1000);
    expect(r.categories.find((c) => c.key === "system")).toBeUndefined();
    expect(r.categories.reduce((a, c) => a + c.tokens, 0)).toBe(1000);
  });

  it("falls back to the raw estimate without a total", () => {
    let s = createTranscript();
    s = applyEvent(s, end({ role: "user", content: "x".repeat(40) }));
    const r = estimateContextBreakdown(s);
    expect(r.isExact).toBe(false);
    expect(r.totalTokens).toBe(10);
  });

  it("ignores entries before the latest compaction's kept point", () => {
    const entries = [
      { type: "message", id: "1", parentId: null, timestamp: "", message: { role: "user", content: "old".repeat(1000) } },
      { type: "message", id: "2", parentId: "1", timestamp: "", message: { role: "user", content: "keep" } },
      { type: "compaction", id: "3", parentId: "2", timestamp: "", summary: "s".repeat(40), firstKeptEntryId: "2", tokensBefore: 5000 },
    ] as unknown as SessionEntry[];
    const s = applyEntries(createTranscript(), entries, "3", "replace");
    const r = estimateContextBreakdown(s);
    expect(r.categories.find((c) => c.key === "user")!.tokens).toBe(1);
    expect(r.categories.find((c) => c.key === "summary")!.tokens).toBe(10);
  });
});
