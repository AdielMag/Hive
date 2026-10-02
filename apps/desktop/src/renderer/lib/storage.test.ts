import { describe, expect, it, beforeEach } from "vitest";
import { getStoredItem, getLegacyStorageKey, setStoredItem } from "./storage.ts";

function createStorageMock() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, String(value)); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
  };
}

describe("renderer storage migration", () => {
  beforeEach(() => {
    (globalThis as any).localStorage = createStorageMock();
  });

  it("derives legacy keys correctly", () => {
    expect(getLegacyStorageKey("hive.layout.v1")).toBe("pi-studio.layout.v1");
    expect(getLegacyStorageKey("hive.appearance.v2")).toBe("pi-studio.appearance.v2");
    expect(getLegacyStorageKey("hive:tools-panel:collapsed")).toBe("pi-studio:tools-panel:collapsed");
    expect(getLegacyStorageKey("custom.key")).toBe("custom.key");
  });

  it("returns current value when new key is already set", () => {
    localStorage.setItem("hive.layout.v1", '{"left":"files"}');
    localStorage.setItem("pi-studio.layout.v1", '{"left":"projects"}');

    expect(getStoredItem("hive.layout.v1")).toBe('{"left":"files"}');
  });

  it("migrates and returns legacy value when new key is missing", () => {
    localStorage.setItem("pi-studio.appearance.v2", '{"theme":"dark"}');

    const value = getStoredItem("hive.appearance.v2");
    expect(value).toBe('{"theme":"dark"}');
    // Ensure it was copied to the new key
    expect(localStorage.getItem("hive.appearance.v2")).toBe('{"theme":"dark"}');
  });

  it("supports explicit legacy key fallback", () => {
    localStorage.setItem("old-custom-key", "val123");

    const value = getStoredItem("new-custom-key", "old-custom-key");
    expect(value).toBe("val123");
    expect(localStorage.getItem("new-custom-key")).toBe("val123");
  });

  it("returns null when neither key is present", () => {
    expect(getStoredItem("hive.nonexistent")).toBeNull();
  });

  it("sets values via setStoredItem", () => {
    setStoredItem("hive.test", "123");
    expect(localStorage.getItem("hive.test")).toBe("123");
  });
});
