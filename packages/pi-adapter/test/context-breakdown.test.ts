import { describe, expect, it } from "vitest";
import { applyEvent, applyEntries, createTranscript, estimateContextBreakdown } from "../src/transcript.ts";
import type { PiStreamEvent } from "@hive/protocol";
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

describe("estimateContextBreakdown – finer split", () => {
  const sumKids = (nodes: Array<{ tokens: number; children?: unknown[] }>): number => nodes.reduce((a, n) => a + n.tokens, 0);
  const check = (nodes: Array<{ tokens: number; children?: Array<{ tokens: number }> }>) => {
    for (const n of nodes) if (n.children) expect(sumKids(n.children)).toBe(n.tokens);
  };

  it("leaves categories unchanged and adds no children when there is nothing to split", () => {
    const r = estimateContextBreakdown(createTranscript(), 11_000);
    expect(r.categories).toHaveLength(1);
    expect(r.categories[0]!.children).toBeUndefined();
  });

  it("splits the system bucket into skills, tools, context files and a remainder that sums exactly", () => {
    const parts = {
      skills: [
        { name: "big-skill", description: "d".repeat(800), filePath: "/s/big/SKILL.md" },
        { name: "small", description: "x", filePath: "/s/small/SKILL.md" },
      ],
      tools: [
        { name: "read", description: "Read files", active: true },
        { name: "off", description: "inactive", active: false },
      ],
      contextFiles: [{ label: "AGENTS.md", path: "/h/AGENTS.md", chars: 4000 }],
    };
    const r = estimateContextBreakdown(createTranscript(), 11_000, parts);
    const sys = r.categories.find((c) => c.key === "system")!;
    expect(sys.tokens).toBe(11_000);
    const kids = sys.children!;
    expect(sumKids(kids)).toBe(11_000);
    check(kids);
    const labels = kids.map((k) => k.label);
    expect(labels).toEqual(expect.arrayContaining(["Skills", "Tool definitions", "Context files", "Base prompt & other"]));
    const skills = kids.find((k) => k.label === "Skills")!;
    expect(skills.count).toBe(2);
    expect(skills.children![0]!.label).toBe("big-skill"); // largest first
    const tools = kids.find((k) => k.label === "Tool definitions")!;
    expect(tools.children!.map((t) => t.label)).toEqual(["read"]); // inactive tools aren't sent
    expect(kids.find((k) => k.label === "Context files")!.tokens).toBe(1000);
    expect(r.categories.reduce((a, c) => a + c.tokens, 0)).toBe(11_000);
  });

  it("scales known parts down when they exceed the system residual", () => {
    const parts = { contextFiles: [{ label: "AGENTS.md", chars: 400_000 }] };
    const r = estimateContextBreakdown(createTranscript(), 1000, parts);
    const sys = r.categories.find((c) => c.key === "system")!;
    expect(sys.tokens).toBe(1000);
    expect(sumKids(sys.children!)).toBe(1000);
    expect(sys.children!.some((k) => k.label === "Base prompt & other")).toBe(false);
  });

  it("includes the known parts in the total when Pi gives no exact number", () => {
    const r = estimateContextBreakdown(createTranscript(), null, { contextFiles: [{ label: "A", chars: 400 }] });
    expect(r.isExact).toBe(false);
    expect(r.totalTokens).toBe(100);
    expect(r.estimatedMessageTokens).toBe(0);
    expect(r.categories[0]!.key).toBe("system");
  });

  it("splits tools into calls vs results and users into text vs images", () => {
    let s = createTranscript();
    s = applyEvent(s, end({ role: "user", content: [{ type: "text", text: "x".repeat(400) }, { type: "image", data: "", mimeType: "image/png" }] }));
    s = applyEvent(s, end({ role: "assistant", content: [{ type: "toolCall", id: "c1", name: "read", arguments: { path: "a.ts" } }] }));
    s = applyEvent(s, end({ role: "toolResult", toolCallId: "c1", toolName: "read", content: [{ type: "text", text: "r".repeat(4000) }] }));
    const r = estimateContextBreakdown(s, 5000);
    const tool = r.categories.find((c) => c.key === "tool:read")!;
    expect(tool.count).toBe(2);
    expect(tool.children!.map((c) => c.label)).toEqual(["Results (output)", "Calls (arguments)"]);
    check(tool.children!);
    const user = r.categories.find((c) => c.key === "user")!;
    expect(user.count).toBe(1);
    expect(user.children!.map((c) => c.label)).toEqual(["Images / attachments", "Text"]);
    expect(sumKids(user.children!)).toBe(user.tokens);
  });
});

describe("estimateContextBreakdown – invariants", () => {
  it("keeps children summing exactly to the parent even when many tiny nodes round up", () => {
    const skills = Array.from({ length: 10 }, (_, i) => ({ name: `s${i}`, description: "d", filePath: "/p" }));
    const r = estimateContextBreakdown(createTranscript(), 5, { skills });
    const sys = r.categories.find((c) => c.key === "system")!;
    const skillGroup = sys.children!.find((k) => k.label === "Skills")!;
    expect(sys.children!.reduce((a, k) => a + k.tokens, 0)).toBe(5);
    expect(skillGroup.children!.reduce((a, k) => a + k.tokens, 0)).toBe(skillGroup.tokens);
  });

  it("uses unique keys for same-named skills and keeps bash token/count totals", () => {
    const r = estimateContextBreakdown(createTranscript(), 10_000, {
      skills: [
        { name: "dup", description: "a", filePath: "/p/1" },
        { name: "dup", description: "b", filePath: "/p/2" },
      ],
    });
    const group = r.categories.find((c) => c.key === "system")!.children!.find((k) => k.label === "Skills")!;
    expect(new Set(group.children!.map((k) => k.key)).size).toBe(2);

    let s = createTranscript();
    s = applyEvent(s, end({ role: "bashExecution", command: "", output: "o".repeat(5) }));
    s = applyEvent(s, end({ role: "bashExecution", command: "abcde", output: "12345" }));
    const bash = estimateContextBreakdown(s).categories.find((c) => c.key === "tool:bash")!;
    expect(bash.count).toBe(2);
    expect(bash.tokens).toBe(2 + 3); // ceil(5/4) + ceil(10/4), same as before the split
  });
});
