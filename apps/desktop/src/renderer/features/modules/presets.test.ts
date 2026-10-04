import { describe, expect, it } from "vitest";
import type { ModuleManifest } from "@hive/module-sdk";
import { groupByTier, matchingPreset, presetIds } from "./presets.ts";

const m = (id: string, tier: ModuleManifest["tier"], requires?: string[]): ModuleManifest => ({ id, title: id, description: id, tier, requires });
const MANIFESTS = [m("base", "recommended"), m("child", "recommended", ["base"]), m("extra", "bonus", ["base"]), m("core-thing", "core")];

describe("presetIds", () => {
  it("minimal is core only", () => {
    expect(presetIds(MANIFESTS, "minimal")).toEqual(["core-thing"]);
  });

  it("recommended excludes bonus", () => {
    expect(presetIds(MANIFESTS, "recommended").sort()).toEqual(["base", "child", "core-thing"]);
  });

  it("everything includes all modules, requirements before dependents", () => {
    const ids = presetIds(MANIFESTS, "everything");
    expect([...ids].sort()).toEqual(["base", "child", "core-thing", "extra"]);
    expect(ids.indexOf("base")).toBeLessThan(ids.indexOf("extra"));
  });

  it("pulls in a bonus requirement of a recommended module", () => {
    const withBonusDep = [m("lib", "bonus"), m("app", "recommended", ["lib"])];
    expect(presetIds(withBonusDep, "recommended").sort()).toEqual(["app", "lib"]);
  });
});

describe("matchingPreset", () => {
  it("recognises each preset regardless of order", () => {
    expect(matchingPreset(MANIFESTS, ["core-thing"])).toBe("minimal");
    expect(matchingPreset(MANIFESTS, ["child", "core-thing", "base"])).toBe("recommended");
    expect(matchingPreset(MANIFESTS, ["extra", "base", "child", "core-thing"])).toBe("everything");
  });

  it("returns null for a custom selection", () => {
    expect(matchingPreset(MANIFESTS, ["base", "extra"])).toBeNull();
  });
});

describe("groupByTier", () => {
  it("orders core, recommended, bonus and skips empty tiers", () => {
    expect(groupByTier(MANIFESTS).map((g) => g.tier)).toEqual(["core", "recommended", "bonus"]);
    expect(groupByTier([m("a", "bonus")]).map((g) => g.tier)).toEqual(["bonus"]);
  });
});
