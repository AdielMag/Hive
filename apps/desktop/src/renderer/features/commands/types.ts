export interface Command {
  /** Stable id, also the key under which user overrides are stored. Never rename once shipped. */
  id: string;
  title: string;
  category: string;
  /** Extra space-separated search terms. */
  keywords?: string;
  /** Default chords in canonical or alias form (e.g. "Mod+Shift+E"). */
  defaultKeys?: string[];
  /** Still fire while an xterm terminal has focus even without Shift/Alt (legacy shortcuts). */
  allowInTerminal?: boolean;
  /** When false the command is hidden from the palette and its shortcut is a no-op. */
  when?: () => boolean;
  run: (args?: unknown) => void | Promise<void>;
}
