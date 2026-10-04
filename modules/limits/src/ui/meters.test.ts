import { describe, expect, it } from "vitest";
import type { ProviderQuota, QuotaGroup } from "@hive/protocol";
import { buildMeters } from "./meters.ts";

const grp = (id: string, label: string, used5: number, usedWk: number): QuotaGroup => ({
  id,
  label,
  windows: [
    { id: "5h", label: "5-hour", kind: "5h", usedPercent: used5 },
    { id: "wk", label: "Weekly", kind: "weekly", usedPercent: usedWk },
  ],
});
const agy: ProviderQuota = {
  providerId: "antigravity",
  name: "Google Antigravity",
  fetchedAt: 0,
  status: "ok",
  source: "live",
  groups: [grp("gemini-models", "Gemini Models", 100, 63), grp("claude-and-gpt-models", "Claude and GPT models", 5, 10)],
};

describe("buildMeters", () => {
  it("splits antigravity into Gemini and Claude·GPT pools", () => {
    const m = buildMeters([agy]);
    expect(m.map((x) => x.pool)).toEqual(["Gemini", "Claude·GPT"]);
    expect(m[0]!.w5?.usedPercent).toBe(100);
    expect(m[1]!.w5?.usedPercent).toBe(5);
    expect(m[1]!.active).toBeUndefined();
  });

  it("flags the pool matching the active model", () => {
    const claude = buildMeters([agy], { provider: "antigravity", id: "claude-opus-4-6-thinking" });
    expect(claude.map((x) => x.active)).toEqual([false, true]);
    const gpt = buildMeters([agy], { provider: "google-antigravity", id: "gpt-oss-120b-medium" });
    expect(gpt.map((x) => x.active)).toEqual([false, true]);
    const gem = buildMeters([agy], { provider: "antigravity", id: "gemini-3-pro" });
    expect(gem.map((x) => x.active)).toEqual([true, false]);
  });

  it("leaves active undefined when the model is on another provider", () => {
    const m = buildMeters([agy], { provider: "anthropic", id: "claude-sonnet-5" });
    expect(m.map((x) => x.active)).toEqual([undefined, undefined]);
  });

  it("keeps one worst-of meter for other providers and skips non-ok ones", () => {
    const claude: ProviderQuota = { ...agy, providerId: "anthropic", groups: [grp("claude", "Claude subscription", 40, 20)] };
    const bad: ProviderQuota = { ...agy, providerId: "openai-codex", status: "error", groups: [] };
    const m = buildMeters([claude, bad]);
    expect(m).toHaveLength(1);
    expect(m[0]!.key).toBe("anthropic");
    expect(m[0]!.pool).toBeUndefined();
  });
});
