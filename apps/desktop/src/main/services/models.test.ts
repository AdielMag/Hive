import { describe, expect, it } from "vitest";
import { ModelsService } from "./models.ts";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("ModelsService", () => {
  it("loads fallback models if no models-store or settings exist", () => {
    const tmp = mkdtempSync(join(tmpdir(), "pi-models-test-"));
    try {
      const service = new ModelsService(tmp);
      const catalog = service.getModelsCatalog();
      expect(catalog.models.length).toBeGreaterThan(0);
      expect(catalog.enabledModels).toEqual([]);
      expect(catalog.models.some((m) => m.provider === "antigravity")).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("reads models from models-store.json and enabledModels from settings.json", () => {
    const tmp = mkdtempSync(join(tmpdir(), "pi-models-test-"));
    try {
      const settingsPath = join(tmp, "settings.json");
      const modelsStorePath = join(tmp, "models-store.json");

      writeFileSync(
        settingsPath,
        JSON.stringify({
          enabledModels: ["antigravity/gemini-custom-1"],
        }),
      );

      writeFileSync(
        modelsStorePath,
        JSON.stringify({
          antigravity: {
            models: [
              {
                id: "gemini-custom-1",
                name: "Custom Gemini",
                provider: "antigravity",
                reasoning: true,
                thinkingLevelMap: { off: null, low: "low", medium: "medium", high: "high" },
                contextWindow: 500000,
              },
            ],
          },
        }),
      );

      const service = new ModelsService(tmp);
      const catalog = service.getModelsCatalog();
      expect(catalog.enabledModels).toEqual(["antigravity/gemini-custom-1"]);
      expect(catalog.models.length).toBe(1);
      expect(catalog.models[0]?.id).toBe("gemini-custom-1");
      expect(catalog.models[0]?.reasoning).toBe(true);
      expect(catalog.models[0]?.thinkingLevelMap).toEqual({ off: null, low: "low", medium: "medium", high: "high" });
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("saves enabledModels atomically to settings.json while preserving existing settings", () => {
    const tmp = mkdtempSync(join(tmpdir(), "pi-models-test-"));
    try {
      const settingsPath = join(tmp, "settings.json");
      writeFileSync(
        settingsPath,
        JSON.stringify({
          theme: "dark",
          packages: ["pkg-a"],
          enabledModels: ["old-model"],
        }),
      );

      const service = new ModelsService(tmp);
      const res = service.saveEnabledModels(["anthropic/claude-3-opus", "antigravity/gemini-3.7-flash"]);
      expect(res.success).toBe(true);

      const updated = JSON.parse(readFileSync(settingsPath, "utf8"));
      expect(updated.theme).toBe("dark");
      expect(updated.packages).toEqual(["pkg-a"]);
      expect(updated.enabledModels).toEqual(["anthropic/claude-3-opus", "antigravity/gemini-3.7-flash"]);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  describe("disabled providers", () => {
    it("defaults to none and round-trips through saveDisabledProviders", () => {
      const tmp = mkdtempSync(join(tmpdir(), "pi-models-test-"));
      try {
        const service = new ModelsService(tmp);
        expect(service.getModelsCatalog().disabledProviders).toEqual([]);
        expect(service.saveDisabledProviders(["zai", "openrouter", "zai", ""]).success).toBe(true);
        expect(service.getModelsCatalog().disabledProviders).toEqual(["zai", "openrouter"]);
        // a fresh instance (app restart) sees the same list
        expect(new ModelsService(tmp).getDisabledProviders()).toEqual(["zai", "openrouter"]);
        service.saveDisabledProviders([]);
        expect(service.getModelsCatalog().disabledProviders).toEqual([]);
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });

    it("does not touch settings.json enabledModels", () => {
      const tmp = mkdtempSync(join(tmpdir(), "pi-models-test-"));
      try {
        writeFileSync(join(tmp, "settings.json"), JSON.stringify({ enabledModels: ["zai/glm-5"] }));
        const service = new ModelsService(tmp);
        service.saveDisabledProviders(["zai"]);
        const catalog = service.getModelsCatalog();
        expect(catalog.enabledModels).toEqual(["zai/glm-5"]);
        expect(catalog.disabledProviders).toEqual(["zai"]);
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });

    it("tolerates a corrupt file", () => {
      const tmp = mkdtempSync(join(tmpdir(), "pi-models-test-"));
      try {
        writeFileSync(join(tmp, "hive-disabled-providers.json"), "{not json");
        expect(new ModelsService(tmp).getDisabledProviders()).toEqual([]);
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });
  });

  describe("auto-enabling newly discovered models", () => {
    const writeStore = (dir: string, byProvider: Record<string, string[]>) =>
      writeFileSync(
        join(dir, "models-store.json"),
        JSON.stringify(
          Object.fromEntries(Object.entries(byProvider).map(([p, ids]) => [p, { models: ids.map((id) => ({ id, provider: p })) }])),
        ),
      );
    const enabledOnDisk = (dir: string) => JSON.parse(readFileSync(join(dir, "settings.json"), "utf8")).enabledModels;

    const withTmp = (fn: (dir: string) => void) => {
      const tmp = mkdtempSync(join(tmpdir(), "pi-models-test-"));
      try {
        fn(tmp);
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    };

    it("first run only seeds the ledger, then auto-enables models that appear later", () =>
      withTmp((tmp) => {
        writeFileSync(join(tmp, "settings.json"), JSON.stringify({ theme: "dark", enabledModels: ["antigravity/gemini-3.8-flash"] }));
        writeStore(tmp, { antigravity: ["gemini-3.8-flash", "gemini-3.7-flash"] });
        const service = new ModelsService(tmp);
        expect(service.getModelsCatalog().enabledModels).toEqual(["antigravity/gemini-3.8-flash"]);

        writeStore(tmp, { antigravity: ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-4-argon"] });
        const catalog = new ModelsService(tmp).getModelsCatalog();
        expect(catalog.enabledModels).toEqual(["antigravity/gemini-3.8-flash", "antigravity/gemini-4-argon"]);
        expect(catalog.autoEnableNewModels).toBe(true);
        expect(enabledOnDisk(tmp)).toEqual(["antigravity/gemini-3.8-flash", "antigravity/gemini-4-argon"]);
        expect(JSON.parse(readFileSync(join(tmp, "settings.json"), "utf8")).theme).toBe("dark");
      }));

    it("never re-enables a model the user unticked", () =>
      withTmp((tmp) => {
        writeFileSync(join(tmp, "settings.json"), JSON.stringify({ enabledModels: ["antigravity/a"] }));
        writeStore(tmp, { antigravity: ["a"] });
        const service = new ModelsService(tmp);
        service.getModelsCatalog();
        writeStore(tmp, { antigravity: ["a", "b"] });
        expect(service.getModelsCatalog().enabledModels).toEqual(["antigravity/a", "antigravity/b"]);
        service.saveEnabledModels(["antigravity/a"]);
        expect(service.getModelsCatalog().enabledModels).toEqual(["antigravity/a"]);
      }));

    it("skips openrouter, '-disabled' variants, and brand-new providers", () =>
      withTmp((tmp) => {
        writeFileSync(join(tmp, "settings.json"), JSON.stringify({ enabledModels: ["antigravity/a"] }));
        writeStore(tmp, { antigravity: ["a"], openrouter: ["google/x"] });
        const service = new ModelsService(tmp);
        service.getModelsCatalog();
        writeStore(tmp, { antigravity: ["a", "gemini-4-argon-disabled"], openrouter: ["google/x", "google/y"], zai: ["glm-9"] });
        expect(service.getModelsCatalog().enabledModels).toEqual(["antigravity/a"]);
        // zai is now known, so its next release is auto-enabled
        writeStore(tmp, { antigravity: ["a"], zai: ["glm-9", "glm-10"] });
        expect(service.getModelsCatalog().enabledModels).toEqual(["antigravity/a", "zai/glm-10"]);
      }));

    it("leaves an empty enabledModels (= show all) empty", () =>
      withTmp((tmp) => {
        writeStore(tmp, { antigravity: ["a"] });
        const service = new ModelsService(tmp);
        service.getModelsCatalog();
        writeStore(tmp, { antigravity: ["a", "b"] });
        expect(service.getModelsCatalog().enabledModels).toEqual([]);
        expect(existsSync(join(tmp, "settings.json"))).toBe(false);
      }));

    it("respects the switch, and turning it back on doesn't enable the backlog", () =>
      withTmp((tmp) => {
        writeFileSync(join(tmp, "settings.json"), JSON.stringify({ enabledModels: ["antigravity/a"] }));
        writeStore(tmp, { antigravity: ["a"] });
        const service = new ModelsService(tmp);
        service.getModelsCatalog();
        service.saveAutoEnableNewModels(false);
        writeStore(tmp, { antigravity: ["a", "b"] });
        expect(service.getModelsCatalog()).toMatchObject({ enabledModels: ["antigravity/a"], autoEnableNewModels: false });
        service.saveAutoEnableNewModels(true);
        expect(service.getModelsCatalog().enabledModels).toEqual(["antigravity/a"]);
      }));

    it("syncDiscoveredModels enables models a live session reports before the store has them", () =>
      withTmp((tmp) => {
        writeFileSync(join(tmp, "settings.json"), JSON.stringify({ enabledModels: ["antigravity/a"] }));
        writeStore(tmp, { antigravity: ["a"] });
        const service = new ModelsService(tmp);
        service.getModelsCatalog();
        expect(service.syncDiscoveredModels(["antigravity/a", "antigravity/gemini-5-flash"])).toEqual({
          enabledModels: ["antigravity/a", "antigravity/gemini-5-flash"],
          added: ["antigravity/gemini-5-flash"],
        });
        expect(service.syncDiscoveredModels(["antigravity/gemini-5-flash"]).added).toEqual([]);
      }));

    it("a live-session sync before the first catalog load seeds from the full store (no later flood)", () =>
      withTmp((tmp) => {
        writeFileSync(join(tmp, "settings.json"), JSON.stringify({ enabledModels: ["antigravity/a"] }));
        writeStore(tmp, { antigravity: ["a", "b", "c"] });
        const service = new ModelsService(tmp);
        expect(service.syncDiscoveredModels(["antigravity/a"]).added).toEqual([]);
        expect(service.getModelsCatalog().enabledModels).toEqual(["antigravity/a"]);
      }));

    it("an unreadable settings.json doesn't mark new models as seen", () =>
      withTmp((tmp) => {
        writeFileSync(join(tmp, "settings.json"), JSON.stringify({ enabledModels: ["antigravity/a"] }));
        writeStore(tmp, { antigravity: ["a"] });
        const service = new ModelsService(tmp);
        service.getModelsCatalog();
        writeStore(tmp, { antigravity: ["a", "b"] });
        writeFileSync(join(tmp, "settings.json"), "{half-written");
        expect(service.getModelsCatalog().enabledModels).toEqual([]);
        writeFileSync(join(tmp, "settings.json"), JSON.stringify({ enabledModels: ["antigravity/a"] }));
        expect(service.getModelsCatalog().enabledModels).toEqual(["antigravity/a", "antigravity/b"]);
      }));

    it("does not seed the ledger from hard-coded fallback models", () =>
      withTmp((tmp) => {
        new ModelsService(tmp).getModelsCatalog();
        expect(existsSync(join(tmp, "hive-seen-models.json"))).toBe(false);
      }));
  });
});
