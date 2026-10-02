import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ModelsService, compactionTokensFor, normalizeCompaction } from "./models.ts";

const STORE = {
  anthropic: {
    models: [
      { id: "big", provider: "anthropic", contextWindow: 1_000_000 },
      { id: "small", provider: "anthropic", contextWindow: 200_000 },
    ],
  },
};

describe("percentage-based compaction", () => {
  let piDir: string;
  let studioDir: string;
  const settingsFile = () => join(piDir, "settings.json");
  const readSettings = () => JSON.parse(readFileSync(settingsFile(), "utf8"));

  beforeEach(() => {
    piDir = mkdtempSync(join(tmpdir(), "pi-compaction-"));
    studioDir = mkdtempSync(join(tmpdir(), "studio-compaction-"));
    writeFileSync(join(piDir, "models-store.json"), JSON.stringify(STORE));
  });
  afterEach(() => {
    rmSync(piDir, { recursive: true, force: true });
    rmSync(studioDir, { recursive: true, force: true });
  });

  it("converts percentages to Pi token values for a window", () => {
    expect(compactionTokensFor(1_000_000, { enabled: true, triggerPercent: 40, keepRecentPercent: 2 })).toEqual({
      reserveTokens: 600_000,
      keepRecentTokens: 20_000,
    });
  });

  it("clamps out-of-range input and keeps recent history below the trigger", () => {
    expect(normalizeCompaction({ enabled: true, triggerPercent: 150, keepRecentPercent: 99 })).toEqual({
      enabled: true,
      triggerPercent: 98,
      keepRecentPercent: 93,
    });
    expect(normalizeCompaction({ enabled: false, triggerPercent: 1, keepRecentPercent: 0 }).triggerPercent).toBe(10);
  });

  it("writes per-model overrides from each model's own window, preserving other settings", () => {
    writeFileSync(
      settingsFile(),
      JSON.stringify({
        theme: "dark",
        compaction: { modelOverrides: { "anthropic/big": { reserveTokens: 1, custom: true }, "other/x": { reserveTokens: 5 } } },
      }),
    );
    const service = new ModelsService(piDir, studioDir);
    const res = service.saveCompactionSettings({ enabled: true, triggerPercent: 80, keepRecentPercent: 5 });
    expect(res).toEqual({ success: true, modelsUpdated: 2 });

    const s = readSettings();
    expect(s.theme).toBe("dark");
    expect(s.compaction.enabled).toBe(true);
    expect(s.compaction.modelOverrides["anthropic/big"]).toEqual({ reserveTokens: 200_000, keepRecentTokens: 50_000, custom: true });
    expect(s.compaction.modelOverrides["anthropic/small"]).toEqual({ reserveTokens: 40_000, keepRecentTokens: 10_000 });
    expect(s.compaction.modelOverrides["other/x"]).toEqual({ reserveTokens: 5 }); // unknown window: untouched
    expect(s.compaction.reserveTokens).toBe(40_000); // fallback for unknown windows (200K reference)

    expect(service.getCompactionSettings()).toEqual({ enabled: true, triggerPercent: 80, keepRecentPercent: 5 });
  });

  it("derives initial percentages from the default model's existing overrides", () => {
    writeFileSync(
      settingsFile(),
      JSON.stringify({
        defaultProvider: "anthropic",
        defaultModel: "big",
        compaction: { enabled: true, modelOverrides: { "anthropic/big": { reserveTokens: 600_000 } } },
      }),
    );
    expect(new ModelsService(piDir, studioDir).getCompactionSettings()).toEqual({ enabled: true, triggerPercent: 40, keepRecentPercent: 2 });
  });

  it("refuses to overwrite a corrupt settings.json", () => {
    writeFileSync(settingsFile(), "{ not json");
    expect(() => new ModelsService(piDir, studioDir).saveCompactionSettings({ enabled: true, triggerPercent: 50, keepRecentPercent: 5 })).toThrow();
    expect(readFileSync(settingsFile(), "utf8")).toBe("{ not json");
  });

  it("re-applies saved percentages to models added later, and is a no-op before any save", () => {
    const service = new ModelsService(piDir, studioDir);
    expect(service.reapplyCompaction()).toBe(0);
    service.saveCompactionSettings({ enabled: true, triggerPercent: 50, keepRecentPercent: 10 });

    writeFileSync(
      join(piDir, "models-store.json"),
      JSON.stringify({ anthropic: { models: [...STORE.anthropic.models, { id: "new", provider: "anthropic", contextWindow: 400_000 }] } }),
    );
    expect(service.reapplyCompaction()).toBe(3);
    expect(readSettings().compaction.modelOverrides["anthropic/new"]).toEqual({ reserveTokens: 200_000, keepRecentTokens: 40_000 });
  });
});
