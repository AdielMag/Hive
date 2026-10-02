import { useEffect } from "react";
import { create } from "zustand";
import type { McpServerInfo, SessionRegistry } from "@hive/protocol";
import { useSessionStore } from "./session-store.ts";

interface AiRegistryState {
  byKey: Record<string, SessionRegistry>;
  mcp: McpServerInfo[] | null;
  loadingMcp: boolean;
  init: () => void;
  load: (key: string) => Promise<void>;
  refreshMcp: () => Promise<void>;
}

let initStarted = false;

export const useAiRegistryStore = create<AiRegistryState>((set, get) => ({
  byKey: {},
  mcp: null,
  loadingMcp: false,

  init: () => {
    if (initStarted) return;
    initStarted = true;

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

    // Initial fetch of MCP catalog
    void get().refreshMcp();
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

  refreshMcp: async () => {
    if (get().loadingMcp) return;
    set({ loadingMcp: true });
    try {
      if (window.studio?.getMcpCatalog) {
        const mcp = await window.studio.getMcpCatalog();
        set({ mcp, loadingMcp: false });
      } else {
        set({ loadingMcp: false });
      }
    } catch (err) {
      console.warn("[ai-registry-store] Failed to refresh MCP catalog:", err);
      set({ loadingMcp: false });
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
