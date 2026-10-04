import { describe, expect, it } from "vitest";
import {
  normalizeChord,
  chordFromEvent,
  formatChord,
  validateGlobalChord,
} from "./keybinding.ts";
import { fuzzyMatch } from "./fuzzy.ts";
import {
  sanitizeOverrides,
  findConflicts,
  withBinding,
} from "./bindings.ts";
import { COMMANDS, COMMANDS_BY_ID } from "./registry.ts";

describe("keybinding", () => {
  it("parses and canonicalises chords", () => {
    expect(normalizeChord("ctrl+shift+e")).toBe("Mod+Shift+E");
    expect(normalizeChord("cmd+k")).toBe("Mod+K");
    expect(normalizeChord("alt+mod+shift+p")).toBe("Mod+Alt+Shift+P");
    expect(normalizeChord("Mod++")).toBe("Mod+Plus");
    expect(normalizeChord("Mod+=")).toBe("Mod+=");
    expect(normalizeChord("f11")).toBe("F11");
    expect(normalizeChord("ctrl+tab")).toBe("Mod+Tab");
    expect(normalizeChord("escape")).toBe("Escape");
    expect(normalizeChord("")).toBeNull();
    expect(normalizeChord("ctrl")).toBeNull();
  });

  it("converts keyboard events into canonical chords", () => {
    // Plain key press should have no modifiers
    expect(chordFromEvent({ key: "a", code: "KeyA", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false })).toBe("A");

    // Ctrl+Shift+E
    expect(chordFromEvent({ key: "E", code: "KeyE", ctrlKey: true, metaKey: false, altKey: false, shiftKey: true })).toBe("Mod+Shift+E");

    // Cmd+K on macOS
    expect(chordFromEvent({ key: "k", code: "KeyK", ctrlKey: false, metaKey: true, altKey: false, shiftKey: false })).toBe("Mod+K");

    // Bare modifiers return null
    expect(chordFromEvent({ key: "Control", ctrlKey: true, metaKey: false, altKey: false, shiftKey: false })).toBeNull();
    expect(chordFromEvent({ key: "Shift", ctrlKey: false, metaKey: false, altKey: false, shiftKey: true })).toBeNull();
  });

  it("formats chords according to platform", () => {
    expect(formatChord("Mod+Shift+E", "win32")).toBe("Ctrl+Shift+E");
    expect(formatChord("Mod+Shift+E", "darwin")).toBe("⇧⌘E");
    expect(formatChord("Mod+Alt+K", "darwin")).toBe("⌥⌘K");
    expect(formatChord("Mod+K", "win32")).toBe("Ctrl+K");
    expect(formatChord("Escape", "win32")).toBe("Esc");
  });

  it("validates global chords for safety", () => {
    expect(validateGlobalChord("Mod+K")).toBeNull();
    expect(validateGlobalChord("F5")).toBeNull();
    expect(validateGlobalChord("Alt+1")).toBeNull();

    // Plain keys are rejected
    expect(validateGlobalChord("A")).toContain("Include Ctrl/Cmd or Alt");
    expect(validateGlobalChord("Shift+A")).toContain("Include Ctrl/Cmd or Alt");

    // Reserved editing keys are rejected
    expect(validateGlobalChord("Mod+C")).toContain("reserved");
    expect(validateGlobalChord("Mod+V")).toContain("reserved");
    expect(validateGlobalChord("Mod+Z")).toContain("reserved");
    expect(validateGlobalChord("Escape")).toContain("reserved");
  });
});

describe("fuzzy matcher", () => {
  it("matches contiguous substrings and scores them well", () => {
    const res = fuzzyMatch("git", "Toggle Git Panel");
    expect(res).not.toBeNull();
    expect(res!.score).toBeGreaterThan(50);
    expect(res!.ranges).toEqual([[7, 10]]);
  });

  it("matches scattered subsequences", () => {
    const res = fuzzyMatch("tgit", "Toggle Git Panel");
    expect(res).not.toBeNull();
    expect(res!.ranges.length).toBeGreaterThan(0);
  });

  it("returns null on non-matches", () => {
    expect(fuzzyMatch("xyz", "Toggle Git Panel")).toBeNull();
  });

  it("returns 0 score and empty ranges on empty query", () => {
    const res = fuzzyMatch("", "Toggle Git Panel");
    expect(res).toEqual({ score: 0, ranges: [] });
  });
});

describe("bindings logic", () => {
  const dummyCommands = [
    { id: "cmd.a", defaultKeys: ["Mod+A"] },
    { id: "cmd.b", defaultKeys: ["Mod+B"] },
  ];

  it("sanitizes overrides correctly", () => {
    const known = new Set(["cmd.a", "cmd.b"]);
    const raw = {
      "cmd.a": ["Mod+Shift+K"],
      "unknown.cmd": ["Mod+J"],
      "cmd.b": ["invalid-chord", "Mod+C"], // Mod+C is reserved
    };
    const clean = sanitizeOverrides(raw, known);
    expect(clean["cmd.a"]).toEqual(["Mod+Shift+K"]);
    expect(clean["unknown.cmd"]).toBeUndefined();
    expect(clean["cmd.b"]).toEqual([]);
  });

  it("finds conflicts", () => {
    const overrides = { "cmd.b": ["Mod+A"] }; // Conflicts with cmd.a's default
    const conflicts = findConflicts(dummyCommands, overrides, "Mod+A", "cmd.b");
    expect(conflicts).toEqual(["cmd.a"]);
  });

  it("adds and removes overrides cleanly with withBinding", () => {
    let o = withBinding(dummyCommands, {}, "cmd.a", ["Mod+Shift+A"]);
    expect(o["cmd.a"]).toEqual(["Mod+Shift+A"]);

    // Reverting to default should drop the key from overrides
    o = withBinding(dummyCommands, o, "cmd.a", ["Mod+A"]);
    expect(o["cmd.a"]).toBeUndefined();
  });
});

describe("command registry", () => {
  it("has unique IDs for every command", () => {
    const ids = COMMANDS.map((c) => c.id);
    const unique = new Set(ids);
    expect(ids.length).toBe(unique.size);
  });

  it("has non-conflicting default shortcuts", () => {
    const seen = new Map<string, string>();
    for (const cmd of COMMANDS) {
      for (const raw of cmd.defaultKeys ?? []) {
        const chord = normalizeChord(raw);
        expect(chord).not.toBeNull();
        if (seen.has(chord!)) {
          // Exception: zoom in can have Mod+= and Mod+Shift+= aliased to the same command
          expect(seen.get(chord!)).toBe(cmd.id);
        } else {
          seen.set(chord!, cmd.id);
        }
      }
    }
  });

  it("covers all legacy shortcuts from useGlobalShortcuts", () => {
    const required = [
      "session.new",
      "project.open",
      "tab.close",
      "settings.open",
      "view.projects",
      "view.files",
      "view.git",
      "view.usage",
      "zoom.in",
      "zoom.out",
      "zoom.reset",
      "tab.next",
      "tab.prev",
    ];
    for (const id of required) {
      expect(COMMANDS_BY_ID.has(id)).toBe(true);
      const cmd = COMMANDS_BY_ID.get(id)!;
      expect(cmd.defaultKeys && cmd.defaultKeys.length > 0).toBe(true);
    }
  });
});
