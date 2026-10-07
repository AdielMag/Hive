import { describe, expect, it, beforeEach, vi } from "vitest";
import { soundEngine } from "../audio/sound-engine.ts";

function createStorageMock() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
}

describe("sound-store", () => {
  beforeEach(() => {
    (globalThis as unknown as { localStorage: ReturnType<typeof createStorageMock> }).localStorage = createStorageMock();
    vi.spyOn(soundEngine, "play").mockImplementation(() => {});
    vi.spyOn(soundEngine, "configure").mockImplementation(() => {});
  });

  it("loads with default sound settings", async () => {
    const { useSoundStore } = await import("./sound-store.ts");
    const state = useSoundStore.getState();
    expect(state.enabled).toBe(true);
    expect(state.volume).toBe(0.6);
    expect(state.theme).toBe("modern");
    expect(state.categories.agent).toBe(true);
    expect(state.categories.plan).toBe(true);
    expect(state.categories.terminal).toBe(true);
    expect(state.categories.toast).toBe(true);
    expect(state.categories.ui).toBe(true);
  });

  it("toggles mute properly", async () => {
    const { useSoundStore } = await import("./sound-store.ts");
    useSoundStore.getState().setEnabled(true);
    expect(useSoundStore.getState().enabled).toBe(true);
    expect(soundEngine.configure).toHaveBeenCalledWith(0.6, false);

    useSoundStore.getState().toggleMute();
    expect(useSoundStore.getState().enabled).toBe(false);
    expect(soundEngine.configure).toHaveBeenCalledWith(0.6, true);

    useSoundStore.getState().toggleMute();
    expect(useSoundStore.getState().enabled).toBe(true);
    expect(soundEngine.configure).toHaveBeenCalledWith(0.6, false);
  });

  it("clamps and sets volume correctly", async () => {
    const { useSoundStore } = await import("./sound-store.ts");
    useSoundStore.getState().setVolume(0.8);
    expect(useSoundStore.getState().volume).toBe(0.8);

    useSoundStore.getState().setVolume(1.5);
    expect(useSoundStore.getState().volume).toBe(1.0);

    useSoundStore.getState().setVolume(-0.2);
    expect(useSoundStore.getState().volume).toBe(0.0);
  });

  it("updates sound theme", async () => {
    const { useSoundStore } = await import("./sound-store.ts");
    useSoundStore.getState().setTheme("retro");
    expect(useSoundStore.getState().theme).toBe("retro");

    useSoundStore.getState().setTheme("modern");
    expect(useSoundStore.getState().theme).toBe("modern");
  });

  it("updates per-category toggles", async () => {
    const { useSoundStore } = await import("./sound-store.ts");
    useSoundStore.getState().setCategory("ui", false);
    expect(useSoundStore.getState().categories.ui).toBe(false);

    useSoundStore.getState().setCategory("ui", true);
    expect(useSoundStore.getState().categories.ui).toBe(true);
  });

  it("plays sound when enabled and category is active", async () => {
    const { useSoundStore } = await import("./sound-store.ts");
    useSoundStore.getState().setEnabled(true);
    useSoundStore.getState().setCategory("agent", true);

    useSoundStore.getState().play("agent_settled");
    expect(soundEngine.play).toHaveBeenCalledWith("agent_settled", "modern", false);
  });

  it("does not play sound when category is disabled", async () => {
    const { useSoundStore } = await import("./sound-store.ts");
    vi.clearAllMocks();
    useSoundStore.getState().setEnabled(true);
    useSoundStore.getState().setCategory("ui", false);

    useSoundStore.getState().play("tab_switch");
    expect(soundEngine.play).not.toHaveBeenCalled();
  });

  it("plays disabled category when force is true (e.g. settings preview)", async () => {
    const { useSoundStore } = await import("./sound-store.ts");
    vi.clearAllMocks();
    useSoundStore.getState().setEnabled(false);

    useSoundStore.getState().play("prompt_send", true);
    expect(soundEngine.play).toHaveBeenCalledWith("prompt_send", "modern", true);
  });
});
