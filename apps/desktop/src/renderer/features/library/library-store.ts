import { create } from "zustand";
import type {
  LibraryEntry,
  LibraryFieldValue,
  LibraryKind,
  LibraryScope,
  LibrarySnapshot,
} from "@pi-studio/protocol";

export type FilterKind = "all" | LibraryKind;
export type FilterScope = "all" | LibraryScope;

export interface LibraryState {
  snapshot: LibrarySnapshot | null;
  loading: boolean;
  error: string | null;
  selectedId: string | null;
  searchQuery: string;
  filterKind: FilterKind;
  filterScope: FilterScope;
  viewMode: "sections" | "raw";
  savingField: string | null;
  feedback: { key: string; type: "success" | "error"; message: string } | null;

  load: (cwd?: string, preserveSelection?: boolean) => Promise<void>;
  selectEntry: (id: string | null) => void;
  setSearchQuery: (q: string) => void;
  setFilterKind: (k: FilterKind) => void;
  setFilterScope: (s: FilterScope) => void;
  setViewMode: (mode: "sections" | "raw") => void;
  updateField: (entry: LibraryEntry, key: string, value: LibraryFieldValue, cwd?: string) => Promise<boolean>;
  clearFeedback: () => void;
}

let feedbackTimer: ReturnType<typeof setTimeout> | null = null;

export const useLibraryStore = create<LibraryState>((set, get) => ({
  snapshot: null,
  loading: false,
  error: null,
  selectedId: null,
  searchQuery: "",
  filterKind: "all",
  filterScope: "all",
  viewMode: "sections",
  savingField: null,
  feedback: null,

  load: async (cwd, preserveSelection = true) => {
    set({ loading: true, error: null });
    try {
      const snap = await window.studio.listLibrary(cwd);
      const curSelected = get().selectedId;
      let nextSelected: string | null = null;
      if (preserveSelection && curSelected && snap.entries.some((e) => e.id === curSelected)) {
        nextSelected = curSelected;
      } else if (snap.entries.length > 0) {
        // Default to first non-shadowed entry
        const firstActive = snap.entries.find((e) => !e.shadowed) ?? snap.entries[0];
        nextSelected = firstActive ? firstActive.id : null;
      }
      set({ snapshot: snap, loading: false, selectedId: nextSelected });
    } catch (err: any) {
      set({ error: err.message || String(err), loading: false });
    }
  },

  selectEntry: (id) => {
    set({ selectedId: id, viewMode: "sections" });
  },

  setSearchQuery: (q) => set({ searchQuery: q }),
  setFilterKind: (k) => set({ filterKind: k }),
  setFilterScope: (s) => set({ filterScope: s }),
  setViewMode: (mode) => set({ viewMode: mode }),

  clearFeedback: () => {
    if (feedbackTimer) clearTimeout(feedbackTimer);
    set({ feedback: null });
  },

  updateField: async (entry, key, value, cwd) => {
    if (entry.readOnly || !entry.path) return false;
    set({ savingField: key });

    try {
      const res = await window.studio.setLibraryField({
        cwd,
        path: entry.path,
        key,
        value,
        expectedMtimeMs: entry.mtimeMs,
      });

      if (!res.ok) {
        if (res.code === "conflict") {
          // Changed on disk - reload snapshot
          await get().load(cwd, true);
          set({
            savingField: null,
            feedback: { key, type: "error", message: "File was changed on disk. Library was reloaded." },
          });
        } else {
          set({
            savingField: null,
            feedback: { key, type: "error", message: res.error },
          });
        }
        return false;
      }

      // Success: update snapshot in place
      const updatedEntry = res.entry;
      set((s) => {
        if (!s.snapshot) return s;
        return {
          snapshot: {
            ...s.snapshot,
            entries: s.snapshot.entries.map((e) => (e.id === updatedEntry.id ? updatedEntry : e)),
          },
          savingField: null,
          feedback: { key, type: "success", message: `Updated ${key}` },
        };
      });

      if (feedbackTimer) clearTimeout(feedbackTimer);
      feedbackTimer = setTimeout(() => {
        set({ feedback: null });
      }, 3000);

      return true;
    } catch (err: any) {
      set({
        savingField: null,
        feedback: { key, type: "error", message: err.message || String(err) },
      });
      return false;
    }
  },
}));
