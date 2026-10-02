/** Pure resolution of effective key bindings from command defaults + user overrides. */
import { normalizeChord, validateGlobalChord } from "./keybinding.ts";

/** commandId → chords. An empty array means "explicitly unbound". */
export type Overrides = Record<string, string[]>;

export interface BindableCommand {
  id: string;
  defaultKeys?: string[];
}

/** Drops unknown ids and invalid/reserved chords; canonicalises and de-duplicates. Never throws. */
export function sanitizeOverrides(raw: unknown, knownIds: ReadonlySet<string>): Overrides {
  const out: Overrides = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!knownIds.has(id) || !Array.isArray(value)) continue;
    const chords: string[] = [];
    for (const v of value) {
      if (typeof v !== "string") continue;
      const c = normalizeChord(v);
      if (c && !validateGlobalChord(c) && !chords.includes(c)) chords.push(c);
    }
    out[id] = chords;
  }
  return out;
}

export function effectiveKeys(cmd: BindableCommand, overrides: Overrides): string[] {
  const o = overrides[cmd.id];
  if (o !== undefined) return o;
  return (cmd.defaultKeys ?? []).map((k) => normalizeChord(k) ?? k);
}

export function isCustomised(cmd: BindableCommand, overrides: Overrides): boolean {
  return overrides[cmd.id] !== undefined;
}

/** chord → command ids bound to it. */
export function buildChordMap(commands: readonly BindableCommand[], overrides: Overrides): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const cmd of commands) {
    for (const chord of effectiveKeys(cmd, overrides)) {
      const list = map.get(chord);
      if (list) list.push(cmd.id);
      else map.set(chord, [cmd.id]);
    }
  }
  return map;
}

/** Other commands already using `chord`. */
export function findConflicts(
  commands: readonly BindableCommand[],
  overrides: Overrides,
  chord: string,
  exceptId: string,
): string[] {
  return (buildChordMap(commands, overrides).get(chord) ?? []).filter((id) => id !== exceptId);
}

/** Returns new overrides with `chords` set for `id`; drops the override when it equals the default. */
export function withBinding(commands: readonly BindableCommand[], overrides: Overrides, id: string, chords: string[]): Overrides {
  const cmd = commands.find((c) => c.id === id);
  const next = { ...overrides };
  const clean = [...new Set(chords)];
  const defaults = (cmd?.defaultKeys ?? []).map((k) => normalizeChord(k) ?? k);
  const same = clean.length === defaults.length && clean.every((c) => defaults.includes(c));
  if (same) delete next[id];
  else next[id] = clean;
  return next;
}
