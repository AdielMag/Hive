/**
 * App-wide keyboard shortcut dispatcher. Replaces the legacy hard-coded `useGlobalShortcuts` hook with
 * a data-driven dispatcher wired to `COMMANDS` and user overrides in `useKeybindingStore`.
 */
import { useEffect } from "react";
import { chordFromEvent, chordHasShiftOrAlt } from "./keybinding.ts";
import { effectiveKeys } from "./bindings.ts";
import { COMMANDS_BY_ID, COMMANDS } from "./registry.ts";
import { useKeybindingStore } from "./keybindings-store.ts";

export { openProjectFolder } from "./registry.ts";

/** Chords the terminal itself owns (copy / paste / find); app shortcuts must never steal them while it has focus. */
const TERMINAL_OWNED = new Set(["Mod+Shift+C", "Mod+Shift+V", "Mod+Shift+F", "Mod+Shift+`"]);

export function useKeybindings(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 1. If user is currently recording a new shortcut in Settings, stand down.
      if (useKeybindingStore.getState().recording) return;

      // 2. Parse event into canonical chord (e.g. "Mod+Shift+E", "Mod+K", "F5").
      const chord = chordFromEvent(e);
      if (!chord) return;

      // 3. Resolve active keybindings map: chord -> command id
      const overrides = useKeybindingStore.getState().overrides;
      let matchedId: string | null = null;
      for (const cmd of COMMANDS) {
        const keys = effectiveKeys(cmd, overrides);
        if (keys.includes(chord)) {
          matchedId = cmd.id;
          break;
        }
      }
      if (!matchedId) return;

      const cmd = COMMANDS_BY_ID.get(matchedId);
      if (!cmd) return;

      // 4. Terminal safety: if focus is inside an xterm element, only allow commands with Shift/Alt
      // or those explicitly flagged `allowInTerminal`.
      const target = e.target as HTMLElement | null;
      const inTerminal = target && (target.closest(".xterm") !== null || target.classList.contains("xterm-helper-textarea"));
      if (inTerminal && (TERMINAL_OWNED.has(chord) || (!cmd.allowInTerminal && !chordHasShiftOrAlt(chord)))) {
        return;
      }

      // 5. Check if command condition holds (e.g. activeTabId exists for Close Tab).
      if (cmd.when && !cmd.when()) {
        return;
      }

      // 6. Execute!
      e.preventDefault();
      e.stopPropagation();
      try {
        void cmd.run();
      } catch (err) {
        console.error(`Failed to run command ${cmd.id}:`, err);
      }
    };

    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
}
