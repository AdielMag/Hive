/**
 * Sound preferences and playback store.
 * Persists user volume, theme, and category toggles to localStorage.
 */
import { create } from "zustand";
import { getStoredItem, setStoredItem } from "../lib/storage.ts";
import { soundEngine } from "../audio/sound-engine.ts";
import {
  SOUND_DEFINITIONS,
  type SoundCategory,
  type SoundId,
  type SoundTheme,
} from "../audio/sound-types.ts";

const STORAGE_KEY = "hive.sound.v1";

interface PersistedSoundSettings {
  enabled: boolean;
  volume: number; // 0.0 - 1.0
  theme: SoundTheme;
  categories: Record<SoundCategory, boolean>;
}

const DEFAULT_SETTINGS: PersistedSoundSettings = {
  enabled: true,
  volume: 0.6,
  theme: "modern",
  categories: {
    agent: true,
    plan: true,
    terminal: true,
    toast: true,
    ui: true,
  },
};

function loadSettings(): PersistedSoundSettings {
  try {
    const raw = getStoredItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<PersistedSoundSettings>;
    return {
      enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : DEFAULT_SETTINGS.enabled,
      volume: typeof parsed.volume === "number" ? Math.max(0, Math.min(1, parsed.volume)) : DEFAULT_SETTINGS.volume,
      theme: parsed.theme && ["modern", "mechanical", "scifi", "retro"].includes(parsed.theme) ? parsed.theme : DEFAULT_SETTINGS.theme,
      categories: {
        agent: parsed.categories?.agent ?? DEFAULT_SETTINGS.categories.agent,
        plan: parsed.categories?.plan ?? DEFAULT_SETTINGS.categories.plan,
        terminal: parsed.categories?.terminal ?? DEFAULT_SETTINGS.categories.terminal,
        toast: parsed.categories?.toast ?? DEFAULT_SETTINGS.categories.toast,
        ui: parsed.categories?.ui ?? DEFAULT_SETTINGS.categories.ui,
      },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function persistSettings(settings: PersistedSoundSettings): void {
  try {
    setStoredItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage quota errors
  }
}

interface SoundState extends PersistedSoundSettings {
  setEnabled: (enabled: boolean) => void;
  toggleMute: () => void;
  setVolume: (volume: number) => void;
  setTheme: (theme: SoundTheme) => void;
  setCategory: (category: SoundCategory, enabled: boolean) => void;
  play: (soundId: SoundId, force?: boolean) => void;
}

const initial = loadSettings();
// Synchronize engine initial volume and mute state
soundEngine.configure(initial.volume, !initial.enabled);

export const useSoundStore = create<SoundState>((set, get) => ({
  ...initial,

  setEnabled: (enabled) => {
    set({ enabled });
    soundEngine.configure(get().volume, !enabled);
    persistSettings({
      enabled,
      volume: get().volume,
      theme: get().theme,
      categories: get().categories,
    });
  },

  toggleMute: () => {
    get().setEnabled(!get().enabled);
  },

  setVolume: (volume) => {
    const clamped = Math.max(0, Math.min(1, volume));
    set({ volume: clamped });
    soundEngine.configure(clamped, !get().enabled);
    persistSettings({
      enabled: get().enabled,
      volume: clamped,
      theme: get().theme,
      categories: get().categories,
    });
  },

  setTheme: (theme) => {
    set({ theme });
    persistSettings({
      enabled: get().enabled,
      volume: get().volume,
      theme,
      categories: get().categories,
    });
  },

  setCategory: (category, enabled) => {
    const nextCategories = { ...get().categories, [category]: enabled };
    set({ categories: nextCategories });
    persistSettings({
      enabled: get().enabled,
      volume: get().volume,
      theme: get().theme,
      categories: nextCategories,
    });
  },

  play: (soundId, force = false) => {
    const state = get();
    const meta = SOUND_DEFINITIONS[soundId];
    if (!meta) return;

    if (!force) {
      if (!state.enabled) return;
      if (!state.categories[meta.category]) return;
    }

    soundEngine.play(soundId, state.theme, force);
  },
}));

/** Global helper to trigger sound effects from any component or event */
export function playUiSound(soundId: SoundId, force = false): void {
  useSoundStore.getState().play(soundId, force);
}

// Listen to custom window events for module compatibility
if (typeof window !== "undefined") {
  window.addEventListener("hive-sound:play", ((e: CustomEvent<{ sound: string }>) => {
    const raw = e.detail?.sound;
    if (typeof raw === "string" && raw in SOUND_DEFINITIONS) {
      // External events are always subject to normal user mute & category filters (never forced)
      useSoundStore.getState().play(raw as SoundId, false);
    }
  }) as EventListener);
}
