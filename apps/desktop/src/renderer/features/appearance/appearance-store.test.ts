import { describe, expect, it, beforeEach } from "vitest";
import { DEFAULT_ARC_THEME } from "@hive/theme-engine";

function createStorageMock() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, String(value)); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
  };
}

describe("appearance-store", () => {
  beforeEach(async () => {
    (globalThis as any).localStorage = createStorageMock();
    (globalThis as any).cancelAnimationFrame = () => {};
    (globalThis as any).requestAnimationFrame = (fn: FrameRequestCallback) => {
      fn(0);
      return 1;
    };
    (globalThis as any).window = {
      cancelAnimationFrame: (globalThis as any).cancelAnimationFrame,
      requestAnimationFrame: (globalThis as any).requestAnimationFrame,
      matchMedia: () => ({ matches: true, addEventListener: () => {} }),
    };
    (globalThis as any).document = {
      documentElement: {
        style: {
          setProperty: () => {},
        },
        dataset: {},
      },
    };
  });

  it("defaults to DEFAULT_ARC_THEME (honey color matching icon)", async () => {
    const { useAppearance } = await import("./appearance-store.ts");
    useAppearance.getState().reset();
    const currentTheme = useAppearance.getState().theme;
    expect(currentTheme).toEqual(DEFAULT_ARC_THEME);
    expect(currentTheme.colors[0]!.hue).toBe(65);
    expect(currentTheme.colors[0]!.sat).toBe(0.65);
  });

  it("resets to DEFAULT_ARC_THEME when reset is called", async () => {
    const { useAppearance } = await import("./appearance-store.ts");
    useAppearance.getState().setTheme({ colors: [{ hue: 200, sat: 0.7 }] });
    expect(useAppearance.getState().theme.colors[0]!.hue).toBe(200);

    useAppearance.getState().reset();
    expect(useAppearance.getState().theme).toEqual(DEFAULT_ARC_THEME);
  });
});
