import { formatChord, type Platform } from "./keybinding.ts";
import { effectiveKeys } from "./bindings.ts";
import { COMMANDS_BY_ID } from "./registry.ts";
import { useKeybindingStore } from "./keybindings-store.ts";

function detectPlatform(): Platform {
  if (typeof document !== "undefined" && document.documentElement?.dataset?.platform) {
    return document.documentElement.dataset.platform;
  }
  if (typeof navigator !== "undefined") {
    return navigator.platform.toLowerCase().includes("mac") ? "darwin" : "win32";
  }
  return undefined;
}

/** Non-reactive string for menus or tooltips. */
export function getShortcutLabel(id: string, platform?: Platform): string | undefined {
  const cmd = COMMANDS_BY_ID.get(id);
  if (!cmd) return undefined;
  const chords = effectiveKeys(cmd, useKeybindingStore.getState().overrides);
  const primary = chords[0];
  if (!primary) return undefined;
  return formatChord(primary, platform ?? detectPlatform());
}

/** Reactive formatted shortcut label for a command id (e.g. \"Ctrl+Shift+E\" or \"⌘⇧E\"). */
export function useShortcut(id: string): string | undefined {
  const overrides = useKeybindingStore((s) => s.overrides);
  const cmd = COMMANDS_BY_ID.get(id);
  if (!cmd) return undefined;
  const chords = effectiveKeys(cmd, overrides);
  const primary = chords[0];
  if (!primary) return undefined;
  return formatChord(primary, detectPlatform());
}
