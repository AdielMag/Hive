/** User key-binding overrides (only differences from defaults are stored). Persisted in localStorage. */
import { create } from "zustand";
import { getStoredItem, setStoredItem } from "../../lib/storage.ts";
import { sanitizeOverrides, withBinding, type Overrides } from "./bindings.ts";
import { COMMANDS, COMMAND_IDS } from "./registry.ts";
import { staticCommandIds } from "../../modules/manifests.ts";

const KEY = "hive.keybindings.v1";

function load(): Overrides {
  try {
    const raw = JSON.parse(getStoredItem(KEY) ?? "null") as { overrides?: unknown } | null;
    // Module commands aren't registered yet at load time; keep overrides for ids their manifests declare.
    return sanitizeOverrides(raw?.overrides, new Set([...COMMAND_IDS, ...staticCommandIds()]));
  } catch {
    return {};
  }
}

function save(overrides: Overrides): void {
  setStoredItem(KEY, JSON.stringify({ version: 1, overrides }));
}

export interface KeybindingsState {
  overrides: Overrides;
  /** True while the Settings recorder is capturing keys; the global dispatcher stands down. */
  recording: boolean;
  setRecording(on: boolean): void;
  /** Replace all chords of a command. `[]` unbinds it. */
  setBinding(id: string, chords: string[]): void;
  /** Atomically set chords for `id` and strip `chords` from `stealFrom` commands. */
  assign(id: string, chords: string[], stealFrom: string[]): void;
  resetBinding(id: string): void;
  resetAll(): void;
}

export const useKeybindingStore = create<KeybindingsState>((set, get) => {
  const commit = (overrides: Overrides) => {
    set({ overrides });
    save(overrides);
  };
  return {
    overrides: load(),
    recording: false,
    setRecording: (recording) => set({ recording }),
    setBinding: (id, chords) => commit(withBinding(COMMANDS, get().overrides, id, chords)),
    assign: (id, chords, stealFrom) => {
      let next = get().overrides;
      for (const other of stealFrom) {
        const cmd = COMMANDS.find((c) => c.id === other);
        if (!cmd) continue;
        const current = next[other] ?? (cmd.defaultKeys ?? []).map((k) => k);
        const remaining = current.filter((c) => !chords.includes(c));
        next = withBinding(COMMANDS, next, other, remaining);
      }
      commit(withBinding(COMMANDS, next, id, chords));
    },
    resetBinding: (id) => {
      const next = { ...get().overrides };
      delete next[id];
      commit(next);
    },
    resetAll: () => commit({}),
  };
});
