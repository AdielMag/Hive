import { describe, expect, it } from "vitest";
import { filterDisabledProviders, isProviderDisabled, withProviderDisabled } from "./provider-filter.ts";

const models = [
  { provider: "zai", id: "glm-5" },
  { provider: "openrouter", id: "x/y" },
  { provider: "anthropic", id: "claude" },
];

describe("provider-filter", () => {
  it("returns everything when nothing is disabled", () => {
    expect(filterDisabledProviders(models, [])).toEqual(models);
  });

  it("hides every model of a disabled provider", () => {
    expect(filterDisabledProviders(models, ["zai", "openrouter"])).toEqual([{ provider: "anthropic", id: "claude" }]);
  });

  it("ignores providers it has never heard of", () => {
    expect(filterDisabledProviders(models, ["nope"])).toEqual(models);
  });

  it("keeps models with no provider", () => {
    expect(isProviderDisabled(undefined, ["zai"])).toBe(false);
    expect(filterDisabledProviders<{ id: string; provider?: string }>([{ id: "a" }], ["zai"])).toEqual([{ id: "a" }]);
  });

  it("toggles one provider without duplicates", () => {
    expect(withProviderDisabled([], "zai", true)).toEqual(["zai"]);
    expect(withProviderDisabled(["zai"], "zai", true)).toEqual(["zai"]);
    expect(withProviderDisabled(["zai", "openrouter"], "zai", false)).toEqual(["openrouter"]);
  });
});
