import { describe, expect, it } from "vitest";
import { SessionUsageParser, lastNDays, localDay, parseUsageLine, projectLabel, summarizeUsage } from "../src/usage.ts";
import type { UsageBucket } from "@hive/protocol";

const assistant = (ts: number, model: string, cost: number, provider = "anthropic") =>
  JSON.stringify({
    type: "message",
    id: "x",
    timestamp: new Date(ts).toISOString(),
    message: {
      role: "assistant",
      content: [{ type: "text", text: 'mentions "usage" and "role":"assistant" inside text' }],
      provider,
      model,
      usage: { input: 10, output: 20, cacheRead: 100, cacheWrite: 5, cost: { total: cost } },
      timestamp: ts,
    },
  });

describe("usage parsing", () => {
  it("skips unrelated lines without parsing", () => {
    expect(parseUsageLine('{"type":"model_change"}')).toBeNull();
    expect(parseUsageLine("not json but has \"usage\" and \"role\":\"assistant\"")).toBeNull();
  });

  it("reads the session header cwd and assistant usage", () => {
    expect(parseUsageLine('{"type":"session","version":3,"cwd":"C:\\\\code\\\\blog"}')).toEqual({ cwd: "C:\\code\\blog" });
    const t = parseUsageLine(assistant(1790845639856, "claude-opus-5-5", 0.05));
    expect(t).toMatchObject({ provider: "anthropic", model: "claude-opus-5-5", input: 10, output: 20, cacheRead: 100, cost: 0.05 });
  });

  it("does not count user messages", () => {
    const user = JSON.stringify({ type: "message", message: { role: "user", content: "usage" } });
    expect(parseUsageLine(user)).toBeNull();
  });

  it("aggregates a session into day buckets", () => {
    const p = new SessionUsageParser();
    const day1 = new Date(2026, 8, 30, 10).getTime();
    const day2 = new Date(2026, 9, 1, 10).getTime();
    p.push('{"type":"session","cwd":"/work/blog"}');
    p.push(assistant(day1, "m1", 1));
    p.push(assistant(day1 + 1000, "m1", 2));
    p.push(assistant(day2, "m2", 4));
    const res = p.result();
    expect(res).toHaveLength(2);
    expect(res[0]!.hour).toBe(10);
    expect(res.find((b) => b.model === "m1")).toMatchObject({ turns: 2, cost: 3, cwd: "/work/blog", day: localDay(day1) });
    expect([...p.days].sort()).toEqual([localDay(day1), localDay(day2)]);
  });
});

describe("summarizeUsage", () => {
  const now = new Date(2026, 9, 1, 15).getTime();
  const days = lastNDays(7, now);
  const b = (day: string, model: string, cost: number, cwd = "/a/proj"): UsageBucket => ({
    day,
    hour: 9,
    provider: "anthropic",
    model,
    cwd,
    turns: 1,
    input: 100,
    output: 50,
    cacheRead: 300,
    cacheWrite: 0,
    cost,
  });

  it("builds a contiguous day range ending today", () => {
    expect(days).toHaveLength(7);
    expect(days[6]).toBe(localDay(now));
  });

  it("groups by model/provider/project and ignores out-of-range days", () => {
    const s = summarizeUsage(
      [b(days[6]!, "opus", 2), b(days[5]!, "sonnet", 1, "/x/other"), b("2020-01-01", "opus", 999)],
      days,
      [[days[5]!, days[6]!], ["2020-01-01"]],
    );
    expect(s.totals.cost).toBe(3);
    expect(s.byModel.map((r) => r.key)).toEqual(["anthropic/opus", "anthropic/sonnet"]);
    expect(s.byProject.map((r) => r.key)).toEqual(["proj", "other"]);
    expect(s.sessions).toBe(1);
    expect(s.activeDays).toBe(2);
    expect(s.cacheHitRate).toBeCloseTo(0.75);
    expect(s.days).toHaveLength(7);
    expect(s.hours[9]!.cost).toBe(3);
  });

  it("labels projects by folder name", () => {
    expect(projectLabel("C:\\Users\\me\\blog")).toBe("blog");
    expect(projectLabel("")).toBe("Unknown");
  });
});
