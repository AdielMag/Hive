import { describe, expect, it } from "vitest";
import { ModelsService } from "./models.ts";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
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
});
