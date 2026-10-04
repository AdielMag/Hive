import { create } from "zustand";
import { LibraryMethods } from "../shared.ts";
import { libraryHost } from "./library-host.ts";
import type {
  LibraryDeleteResult,
  LibraryEntry,
  LibraryFieldValue,
  LibraryKind,
  LibraryScope,
  LibrarySnapshot,
} from "@hive/protocol";

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
  /** Show definitions shadowed by a higher-priority copy (hidden by default to cut duplicates). */
  showOverridden: boolean;
  viewMode: "sections" | "raw";
  savingField: string | null;
  deletingId: string | null;
  feedback: { key: string; type: "success" | "error"; message: string } | null;

  load: (cwd?: string, preserveSelection?: boolean) => Promise<void>;
  selectEntry: (id: string | null) => void;
  setSearchQuery: (q: string) => void;
  setFilterKind: (k: FilterKind) => void;
  setFilterScope: (s: FilterScope) => void;
  setShowOverridden: (v: boolean) => void;
  setViewMode: (mode: "sections" | "raw") => void;
  updateField: (entry: LibraryEntry, key: string, value: LibraryFieldValue, cwd?: string) => Promise<boolean>;
  deleteEntry: (entry: LibraryEntry, cwd?: string) => Promise<boolean>;
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
  showOverridden: false,
  viewMode: "sections",
  savingField: null,
  deletingId: null,
  feedback: null,

  load: async (cwd, preserveSelection = true) => {
    set({ loading: true, error: null });
    try {
      const snap = await libraryHost().ipc.invoke<LibrarySnapshot>(LibraryMethods.list, { cwd });
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
  setShowOverridden: (v) => set({ showOverridden: v }),
  setViewMode: (mode) => set({ viewMode: mode }),

  clearFeedback: () => {
    if (feedbackTimer) clearTimeout(feedbackTimer);
    set({ feedback: null });
  },

  updateField: async (entry, key, value, cwd) => {
    if (entry.readOnly || !entry.path) return false;
    set({ savingField: key });

    try {
      const res = await libraryHost().ipc.invoke<any>(LibraryMethods.setField, {
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

  deleteEntry: async (entry, cwd) => {
    if (entry.readOnly || !entry.path) return false;
    set({ deletingId: entry.id });

    try {
      const res = await libraryHost().ipc.invoke<LibraryDeleteResult>(LibraryMethods.delete, {
        cwd,
        path: entry.path,
      });

      if (!res.ok) {
        set({
          deletingId: null,
          feedback: { key: "delete", type: "error", message: res.error },
        });
        libraryHost().toast({ message: res.error, kind: "error" });
        return false;
      }

      // Close open editor tabs matching this file or its directory
      try {
        const tabs = libraryHost().tabs.list();
        const norm = (p: string) => p.replace(/\\/g, "/").toLowerCase();
        const entryNorm = norm(entry.path);
        const skillDirNorm = entry.path.endsWith("SKILL.md")
          ? norm(entry.path.slice(0, -("SKILL.md".length + 1)))
          : null;

        for (const tab of tabs) {
          if (!tab.filePath) continue;
          const tabNorm = norm(tab.filePath);
          if (tabNorm === entryNorm || (skillDirNorm && tabNorm.startsWith(skillDirNorm + "/"))) {
            libraryHost().tabs.close(tab.id);
          }
        }
      } catch {
        // Tab closing is non-critical
      }

      libraryHost().toast({
        message: `Deleted ${entry.kind} "${entry.displayName || entry.name}"`,
        kind: "success",
      });

      // Reload snapshot — preserveSelection=false will pick the next active item
      await get().load(cwd, false);

      set({ deletingId: null });
      return true;
    } catch (err: any) {
      const msg = err.message || String(err);
      set({
        deletingId: null,
        feedback: { key: "delete", type: "error", message: msg },
      });
      libraryHost().toast({ message: msg, kind: "error" });
      return false;
    }
  },
}));
