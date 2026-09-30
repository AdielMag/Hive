import { create } from "zustand";
import {
  type Bootstrap,
  type Model,
  type ProjectEntry,
  type RpcExtensionUIRequest,
  type RpcExtensionUIResponse,
  type SessionCatalogItem,
  type SessionStats,
  type SessionStatusUpdate,
  type StudioApi,
  type TabItem,
} from "@pi-studio/protocol";
import {
  applyEntries,
  applyEvent,
  createTranscript,
  type TranscriptState,
} from "@pi-studio/pi-adapter";

declare global {
  interface Window {
    studio: StudioApi;
  }
}

export interface ExtensionWidgetState {
  lines: string[];
  placement: "aboveEditor" | "belowEditor";
}

export interface SessionStoreState {
  bootstrap: Bootstrap | null;
  projects: ProjectEntry[];
  allSessions: SessionCatalogItem[];
  tabs: TabItem[];
  activeTabId: string | null;

  // Active session details
  activeKey: string | null;
  activeProject: ProjectEntry | null;
  status: SessionStatusUpdate | null;
  transcript: TranscriptState;
  models: Array<Model<any>>;
  selectedModel: Model<any> | null;
  thinkingLevels: string[];
  selectedThinkingLevel: string;
  stats: SessionStats | null;
  extensionWidgets: Record<string, ExtensionWidgetState>;
  extensionStatus: Record<string, string>;
  pendingUiDialog: RpcExtensionUIRequest | null;
  promptText: string;
  isInitializing: boolean;
  error: string | null;

  // Actions
  init: () => Promise<void>;
  refreshCatalog: () => Promise<void>;
  addProject: (dirPath: string, name?: string, color?: string) => Promise<ProjectEntry>;
  updateProject: (id: string, updates: Partial<ProjectEntry>) => Promise<void>;
  removeProject: (id: string) => Promise<void>;
  openSessionTab: (sessionPath: string, projectId: string, title?: string) => Promise<void>;
  newSessionTab: (projectId: string) => Promise<void>;
  switchTab: (tabId: string) => Promise<void>;
  closeTab: (tabId: string) => Promise<void>;
  setPromptText: (text: string) => void;
  sendPrompt: (streamingBehavior?: "steer" | "followUp") => Promise<void>;
  abort: () => Promise<void>;
  setModel: (provider: string, modelId: string) => Promise<void>;
  setThinkingLevel: (level: string) => Promise<void>;
  respondDialog: (response: RpcExtensionUIResponse) => Promise<void>;
  deleteSessionFile: (sessionPath: string) => Promise<void>;
}

export const useSessionStore = create<SessionStoreState>((set, get) => ({
  bootstrap: null,
  projects: [],
  allSessions: [],
  tabs: [],
  activeTabId: null,

  activeKey: null,
  activeProject: null,
  status: null,
  transcript: createTranscript(),
  models: [],
  selectedModel: null,
  thinkingLevels: [],
  selectedThinkingLevel: "medium",
  stats: null,
  extensionWidgets: {},
  extensionStatus: {},
  pendingUiDialog: null,
  promptText: "",
  isInitializing: true,
  error: null,

  init: async () => {
    try {
      const bootstrap = await window.studio.bootstrap();
      set({ bootstrap, isInitializing: false });

      // Listen for session streaming events
      window.studio.onSessionEvents((batch) => {
        if (batch.key !== get().activeKey) return;
        let t = get().transcript;
        for (const ev of batch.events) {
          t = applyEvent(t, ev);
        }
        set({ transcript: t });
        // Refresh session stats on settled
        if (batch.events.some((e) => e.type === "agent_settled")) {
          void (async () => {
            const key = get().activeKey;
            if (!key) return;
            const res = await window.studio.rpc(key, { type: "get_session_stats" });
            if (res.ok) set({ stats: res.data as SessionStats });
            // Also refresh catalog so message count & timestamp update
            void get().refreshCatalog();
          })();
        }
      });

      // Listen for status updates
      window.studio.onSessionStatus((status) => {
        if (status.key === get().activeKey) {
          set({ status });
        }
      });

      // Listen for extension UI requests
      window.studio.onUiRequest(({ key, request }) => {
        if (key !== get().activeKey) return;
        if (request.method === "setStatus") {
          const statusKey = request.statusKey;
          set((s) => ({
            extensionStatus: request.statusText
              ? { ...s.extensionStatus, [statusKey]: request.statusText }
              : Object.fromEntries(Object.entries(s.extensionStatus).filter(([k]) => k !== statusKey)),
          }));
          return;
        }
        if (request.method === "setWidget") {
          const widgetKey = request.widgetKey;
          set((s) => ({
            extensionWidgets: request.widgetLines
              ? {
                  ...s.extensionWidgets,
                  [widgetKey]: {
                    lines: request.widgetLines,
                    placement: request.widgetPlacement ?? "aboveEditor",
                  },
                }
              : Object.fromEntries(Object.entries(s.extensionWidgets).filter(([k]) => k !== widgetKey)),
          }));
          return;
        }
        if (request.method === "set_editor_text") {
          set({ promptText: request.text });
          return;
        }

        if (["select", "confirm", "input", "editor"].includes(request.method)) {
          set({ pendingUiDialog: request });
        }
      });

      // Initial projects and catalog load
      await get().refreshCatalog();

      // Only auto-open if an explicit project was passed via env PI_STUDIO_PROJECT
      if (get().projects.length === 0 && bootstrap.initialProjectPath) {
        const p = await get().addProject(bootstrap.initialProjectPath);
        await get().newSessionTab(p.id);
      } else if (get().projects.length > 0 && get().tabs.length === 0) {
        const firstPrj = get().projects[0]!;
        await get().newSessionTab(firstPrj.id);
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err), isInitializing: false });
    }
  },

  refreshCatalog: async () => {
    try {
      const [projects, allSessions] = await Promise.all([
        window.studio.getProjects(),
        window.studio.listAllSessions(),
      ]);
      set({ projects, allSessions });
    } catch (err) {
      console.error("refreshCatalog failed", err);
    }
  },

  addProject: async (dirPath: string, name?: string, color?: string) => {
    const project = await window.studio.addProject(dirPath, name, color);
    await get().refreshCatalog();
    return project;
  },

  updateProject: async (id: string, updates: Partial<ProjectEntry>) => {
    await window.studio.updateProject(id, updates);
    await get().refreshCatalog();
  },

  removeProject: async (id: string) => {
    await window.studio.removeProject(id);
    await get().refreshCatalog();
  },

  openSessionTab: async (sessionPath: string, projectId: string, title?: string) => {
    const { tabs, projects } = get();
    const existing = tabs.find((t) => t.sessionPath === sessionPath);
    if (existing) {
      await get().switchTab(existing.id);
      return;
    }

    const project = projects.find((p) => p.id === projectId) ?? null;
    const tabId = `tab_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newTab: TabItem = {
      id: tabId,
      sessionPath,
      projectId,
      title: title || sessionPath.split(/[/\\]/).pop()?.replace(/\.jsonl$/, "") || "Session",
      pinned: false,
      isCold: true,
    };

    set({
      tabs: [...tabs, newTab],
      activeTabId: tabId,
      activeProject: project,
      activeKey: null,
      transcript: createTranscript(),
      extensionWidgets: {},
      extensionStatus: {},
      pendingUiDialog: null,
      stats: null,
    });

    // Cold read: parse entries from disk without spawning process
    try {
      const { entries, leafId } = await window.studio.readSessionFile(sessionPath);
      set((s) => ({
        transcript: applyEntries(s.transcript, entries, leafId, "replace"),
      }));
    } catch (err) {
      console.error("Failed to read cold session", err);
    }
  },

  newSessionTab: async (projectId: string) => {
    const { tabs, projects } = get();
    const project = projects.find((p) => p.id === projectId) ?? null;
    if (!project) return;

    const tabId = `tab_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newTab: TabItem = {
      id: tabId,
      projectId,
      title: "New Session",
      pinned: false,
      isCold: true,
    };

    set({
      tabs: [...tabs, newTab],
      activeTabId: tabId,
      activeProject: project,
      activeKey: null,
      transcript: createTranscript(),
      extensionWidgets: {},
      extensionStatus: {},
      pendingUiDialog: null,
      stats: null,
    });
  },

  switchTab: async (tabId: string) => {
    const tab = get().tabs.find((t) => t.id === tabId);
    if (!tab) return;
    const project = get().projects.find((p) => p.id === tab.projectId) ?? null;

    set({
      activeTabId: tabId,
      activeProject: project,
      activeKey: tab.activeKey ?? null,
      transcript: createTranscript(),
      extensionWidgets: {},
      extensionStatus: {},
      pendingUiDialog: null,
      stats: null,
    });

    if (tab.sessionPath) {
      try {
        const { entries, leafId } = await window.studio.readSessionFile(tab.sessionPath);
        set((s) => ({
          transcript: applyEntries(s.transcript, entries, leafId, "replace"),
        }));
      } catch (err) {
        console.error("Failed to read session file", err);
      }
    }
  },

  closeTab: async (tabId: string) => {
    const { tabs, activeTabId } = get();
    const tab = tabs.find((t) => t.id === tabId);
    if (tab?.activeKey) {
      await window.studio.stopSession(tab.activeKey);
    }
    const remaining = tabs.filter((t) => t.id !== tabId);
    set({ tabs: remaining });

    if (activeTabId === tabId && remaining.length > 0) {
      const nextTab = remaining[remaining.length - 1]!;
      await get().switchTab(nextTab.id);
    } else if (remaining.length === 0) {
      set({ activeTabId: null, activeProject: null, activeKey: null, transcript: createTranscript() });
    }
  },

  setPromptText: (text: string) => set({ promptText: text }),

  sendPrompt: async (streamingBehavior) => {
    let { activeKey, promptText, transcript, activeProject, activeTabId, tabs } = get();
    if (!promptText.trim()) return;

    // Promote cold tab to live process if needed
    if (!activeKey) {
      if (!activeProject) return;
      const activeTab = tabs.find((t) => t.id === activeTabId);
      const res = await window.studio.startSession({
        projectPath: activeProject.path,
        sessionPath: activeTab?.sessionPath,
      });
      activeKey = res.key;

      // Update tab state
      set((s) => ({
        activeKey: res.key,
        tabs: s.tabs.map((t) => (t.id === activeTabId ? { ...t, activeKey: res.key, isCold: false } : t)),
      }));

      // Fetch models, state, thinking levels
      const stateRes = await window.studio.rpc(activeKey, { type: "get_state" });
      if (stateRes.ok) {
        const state = stateRes.data as { model?: Model<any>; thinkingLevel?: string };
        if (state.model) set({ selectedModel: state.model });
        if (state.thinkingLevel) set({ selectedThinkingLevel: state.thinkingLevel });
      }

      const modelsRes = await window.studio.rpc(activeKey, { type: "get_available_models" });
      if (modelsRes.ok) {
        const models = (modelsRes.data as { models: Array<Model<any>> }).models;
        set({ models });
        if (!get().selectedModel && models.length > 0) set({ selectedModel: models[0] ?? null });
      }

      const levelsRes = await window.studio.rpc(activeKey, { type: "get_available_thinking_levels" });
      if (levelsRes.ok) {
        set({ thinkingLevels: (levelsRes.data as { levels: string[] }).levels });
      }
    }

    const message = promptText;
    set({ promptText: "" });

    if (transcript.running && streamingBehavior === "steer") {
      await window.studio.rpc(activeKey, { type: "steer", message });
    } else if (transcript.running && streamingBehavior === "followUp") {
      await window.studio.rpc(activeKey, { type: "follow_up", message });
    } else {
      await window.studio.rpc(activeKey, {
        type: "prompt",
        message,
        ...(transcript.running ? { streamingBehavior: "steer" } : {}),
      });
    }
  },

  abort: async () => {
    const { activeKey } = get();
    if (!activeKey) return;
    const res = await window.studio.rpc(activeKey, { type: "clear_queue" });
    if (res.ok) {
      const q = res.data as { steering?: string[]; followUp?: string[] };
      const restored = [...(q.steering ?? []), ...(q.followUp ?? [])].join("\n");
      if (restored) set({ promptText: restored });
    }
    await window.studio.rpc(activeKey, { type: "abort" });
  },

  setModel: async (provider: string, modelId: string) => {
    const { activeKey } = get();
    if (!activeKey) return;
    const res = await window.studio.rpc(activeKey, { type: "set_model", provider, modelId });
    if (res.ok) {
      set({ selectedModel: res.data as Model<any> });
      const levelsRes = await window.studio.rpc(activeKey, { type: "get_available_thinking_levels" });
      if (levelsRes.ok) {
        set({ thinkingLevels: (levelsRes.data as { levels: string[] }).levels });
      }
    }
  },

  setThinkingLevel: async (level: string) => {
    const { activeKey } = get();
    if (!activeKey) return;
    const res = await window.studio.rpc(activeKey, { type: "set_thinking_level", level: level as any });
    if (res.ok) {
      set({ selectedThinkingLevel: level });
    }
  },

  respondDialog: async (response: RpcExtensionUIResponse) => {
    const { activeKey } = get();
    if (!activeKey) return;
    await window.studio.respondUi(activeKey, response);
    set({ pendingUiDialog: null });
  },

  deleteSessionFile: async (sessionPath: string) => {
    await window.studio.deleteSessionFile(sessionPath);
    await get().refreshCatalog();
  },
}));
