import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  parseAnthropicUsage,
  parseAntigravityQuota,
  parseCodexUsage,
  parseQuotaStatusCache,
} from "./parsers.ts";
import { parseCredentialsOutput, SENTINEL } from "./credentials.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
import { QuotaService } from "./index.ts";
import { UnsupportedError } from "./fetchers.ts";
import type { PiInstallInfo } from "@hive/protocol";

const NOW = Date.parse("2026-10-01T10:00:00Z");

describe("quota parsers", () => {
  it("parses Anthropic oauth usage (utilization is a percent)", () => {
    const groups = parseAnthropicUsage(
      {
        five_hour: { utilization: 8.0, resets_at: "2026-10-01T13:59:59.840499+00:00" },
        seven_day: { utilization: 29.0, resets_at: "2026-10-04T06:59:59.840519+00:00" },
        seven_day_opus: null,
      },
      NOW,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]!.windows.map((w) => [w.kind, w.usedPercent])).toEqual([
      ["5h", 8],
      ["weekly", 29],
    ]);
    expect(groups[0]!.windows[0]!.resetsAt).toBe(Date.parse("2026-10-01T13:59:59.840Z"));
  });

  it("parses Antigravity groups with remaining fractions and sorts 5h first", () => {
    const groups = parseAntigravityQuota({
      groups: [
        {
          displayName: "Gemini Models",
          buckets: [
            { bucketId: "gemini-weekly", window: "weekly", resetTime: "2026-10-01T18:57:42Z", remainingFraction: 0.5542625 },
            { bucketId: "gemini-5h", window: "5h", resetTime: "2026-10-01T10:35:21Z", remainingFraction: 0.85 },
          ],
        },
        { displayName: "Claude and GPT models", buckets: [{ bucketId: "3p-5h", window: "5h", remainingFraction: 1 }] },
      ],
    });
    expect(groups.map((g) => g.label)).toEqual(["Gemini Models", "Claude and GPT models"]);
    expect(groups[0]!.windows[0]!.kind).toBe("5h");
    expect(groups[0]!.windows[0]!.usedPercent).toBeCloseTo(15);
    expect(groups[0]!.windows[1]!.usedPercent).toBeCloseTo(44.57, 1);
    expect(groups[1]!.windows[0]!.usedPercent).toBe(0);
  });

  it("parses Codex windows with reset_after_seconds", () => {
    const groups = parseCodexUsage(
      {
        plan_type: "plus",
        rate_limit: {
          primary_window: { used_percent: 42, reset_after_seconds: 3600 },
          secondary_window: { used_percent: 10, reset_at: 1790900000 },
        },
      },
      NOW,
    );
    expect(groups[0]!.label).toBe("ChatGPT plus");
    expect(groups[0]!.windows[0]!.resetsAt).toBe(NOW + 3_600_000);
    expect(groups[0]!.windows[1]!.resetsAt).toBe(1790900000 * 1000);
  });

  it("reads the newest pi-quota-status observation per provider", () => {
    const map = parseQuotaStatusCache({
      observations: {
        "anthropic/a": { provider: "anthropic", observedAt: 1, dimensions: [{ name: "5h", limit: 100, remaining: 10 }] },
        "anthropic/b": { provider: "anthropic", observedAt: 2, dimensions: [{ name: "5h", limit: 100, remaining: 64, resetAt: 5 }] },
      },
    });
    expect(map.get("anthropic")!.groups[0]!.windows[0]).toMatchObject({ usedPercent: 36, resetsAt: 5 });
  });

  it("returns empty for garbage", () => {
    expect(parseAnthropicUsage(null)).toEqual([]);
    expect(parseAntigravityQuota({ groups: "x" })).toEqual([]);
    expect(parseCodexUsage(42)).toEqual([]);
  });
});

describe("credential helper output", () => {
  it("ignores noise before the sentinel line", () => {
    const out = "warn: something\n@@HIVE_CREDENTIALS@@" + JSON.stringify({ ok: true, credentials: [{ providerId: "x", type: "oauth", apiKey: "k" }] });
    expect(parseCredentialsOutput(out)).toEqual([{ providerId: "x", type: "oauth", apiKey: "k" }]);
  });
  it("throws on failure payloads", () => {
    expect(() => parseCredentialsOutput('@@HIVE_CREDENTIALS@@{"ok":false,"error":"boom"}')).toThrow("boom");
  });
  it("still accepts the legacy Pi Studio sentinel", () => {
    const out = '@@PI_STUDIO_CREDENTIALS@@{"ok":true,"credentials":[]}';
    expect(parseCredentialsOutput(out)).toEqual([]);
  });
  it("matches the sentinel emitted by the bundled helper", () => {
    const helper = readFileSync(resolve(__dirname, "../../../../resources/helpers/pi-credentials.mjs"), "utf8");
    expect(helper).toContain(`"${SENTINEL}"`);
  });
});

describe("QuotaService", () => {
  const pi = { nodePath: "node", packageRoot: "/pi" } as PiInstallInfo;
  const window = { id: "5h", label: "5-hour", kind: "5h" as const, usedPercent: 50 };

  it("combines live, cached-fallback, unsupported and error providers", async () => {
    const svc = new QuotaService(pi, {
      resolveCredentials: async () => [
        { providerId: "anthropic", type: "oauth", apiKey: "sk-ant-oat-1" },
        { providerId: "antigravity", type: "oauth", apiKey: "t" },
        { providerId: "openai-codex", type: "oauth", apiKey: "t" },
        { providerId: "openrouter", type: "api_key", apiKey: "k" },
      ],
      fetchers: {
        anthropic: async () => [{ id: "c", label: "Claude", windows: [window] }],
        antigravity: async () => {
          throw new Error("offline");
        },
        "openai-codex": async () => {
          throw new UnsupportedError("api key");
        },
      },
      readAccounts: () => ({ antigravity: "me@x.dev" }),
      readCache: () => new Map([["antigravity", { fetchedAt: 7, groups: [{ id: "g", label: "Gemini", windows: [window] }] }]]),
      now: () => NOW,
    });
    const snap = await svc.getSnapshot();
    const byId = Object.fromEntries(snap.providers.map((p) => [p.providerId, p]));
    expect(byId.anthropic).toMatchObject({ status: "ok", source: "live" });
    expect(byId.antigravity).toMatchObject({ status: "ok", source: "cache", account: "me@x.dev", fetchedAt: 7, error: "offline" });
    expect(byId["openai-codex"]!.status).toBe("unsupported");
    expect(byId.openrouter!.status).toBe("unsupported");
    // ok providers first
    expect(snap.providers.slice(0, 2).every((p) => p.status === "ok")).toBe(true);
  });

  it("caches snapshots until forced", async () => {
    let calls = 0;
    const svc = new QuotaService(pi, {
      resolveCredentials: async () => {
        calls++;
        return [];
      },
      readAccounts: () => ({}),
      readCache: () => new Map(),
      now: () => NOW,
    });
    await svc.getSnapshot();
    await svc.getSnapshot();
    expect(calls).toBe(1);
    await svc.getSnapshot(true);
    expect(calls).toBe(2);
  });
});
