import { useEffect } from "react";
import { create } from "zustand";
import type { SessionRegistry } from "@hive/protocol";
import { useSessionStore } from "./session-store.ts";

interface AiRegistryState {
  byKey: Record<string, SessionRegistry>;
  init: () => void;
  load: (key: string) => Promise<void>;
}

let initStarted = false;

export const useAiRegistryStore = create<AiRegistryState>((set, get) => ({
  byKey: {},

  init: () => {
    if (initStarted) return;
    initStarted = true;

    // Drop registries of sessions whose tab was closed (only keys we once saw on a tab, so early registries survive).
    let seenKeys = new Set<string>();
    useSessionStore.subscribe((state) => {
      const current = new Set<string>();
      for (const t of state.tabs) if (t.activeKey) current.add(t.activeKey);
      const gone = [...seenKeys].filter((k) => !current.has(k));
      seenKeys = current;
      if (gone.length === 0) return;
      set((s) => {
        if (!gone.some((k) => k in s.byKey)) return {};
        const byKey = { ...s.byKey };
        for (const k of gone) delete byKey[k];
        return { byKey };
      });
    });

    // Listen for live bridge records from active sessions
    if (typeof window !== "undefined" && window.studio?.onBridgeMessage) {
      window.studio.onBridgeMessage((event) => {
        const msg = event.message;
        if (msg && msg.type === "registry") {
          const reg: SessionRegistry = {
            sessionId: msg.sessionId,
            cwd: msg.cwd,
            homeDir: msg.homeDir,
            tools: msg.tools,
            skills: msg.skills,
            receivedAt: Date.now(),
          };
          set((state) => ({
            byKey: { ...state.byKey, [event.key]: reg },
          }));
        }
      });
    }
  },

  load: async (key: string) => {
    if (!key || get().byKey[key]) return;
    try {
      if (window.studio?.getSessionRegistry) {
        const reg = await window.studio.getSessionRegistry(key);
        if (reg) {
          set((state) => ({
            byKey: { ...state.byKey, [key]: reg },
          }));
        }
      }
    } catch (err) {
      console.warn("[ai-registry-store] Failed to load session registry:", err);
    }
  },
}));

/**
 * Hook to access the AI registry for the currently active tab/session.
 */
export function useActiveRegistry(): SessionRegistry | null {
  const activeKey = useSessionStore((s) => s.activeKey);
  // The transcript needs the registry (skills, homeDir) even if the Tools panel was never opened.
  useEffect(() => {
    const store = useAiRegistryStore.getState();
    store.init();
    if (activeKey) void store.load(activeKey);
  }, [activeKey]);
  return useAiRegistryStore((s) => (activeKey ? s.byKey[activeKey] ?? null : null));
}
