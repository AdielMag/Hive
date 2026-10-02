/** Command palette open/closed state, query and recently-run commands. */
import { create } from "zustand";
import { getStoredItem, setStoredItem } from "../../lib/storage.ts";

const KEY = "hive.palette.recents.v1";
const MAX_RECENTS = 20;

function loadRecents(): string[] {
  try {
    const raw = JSON.parse(getStoredItem(KEY) ?? "[]") as unknown;
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string").slice(0, MAX_RECENTS) : [];
  } catch {
    return [];
  }
}

interface PaletteState {
  open: boolean;
  query: string;
  recents: string[];
  /** Opens the palette; `prefix` seeds the query (">" = actions only). */
  openPalette(prefix?: string): void;
  close(): void;
  toggle(prefix?: string): void;
  setQuery(q: string): void;
  pushRecent(id: string): void;
}

export const usePalette = create<PaletteState>((set, get) => ({
  open: false,
  query: "",
  recents: loadRecents(),
  openPalette: (prefix = "") => set({ open: true, query: prefix }),
  close: () => set({ open: false, query: "" }),
  toggle: (prefix = "") => (get().open && get().query === prefix ? get().close() : get().openPalette(prefix)),
  setQuery: (query) => set({ query }),
  pushRecent: (id) => {
    const recents = [id, ...get().recents.filter((r) => r !== id)].slice(0, MAX_RECENTS);
    set({ recents });
    setStoredItem(KEY, JSON.stringify(recents));
  },
}));
