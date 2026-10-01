import { create } from "zustand";
import {
  type AgentMode,
  type AttachedItem,
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
  allCatalogModels: Array<Model<any>>;
  enabledModelKeys: string[];
  selectedModel: Model<any> | null;
  thinkingLevels: string[];
  selectedThinkingLevel: string;
  selectedMode: AgentMode;
  stats: SessionStats | null;
  extensionWidgets: Record<string, ExtensionWidgetState>;
  extensionStatus: Record<string, string>;
  pendingUiDialog: RpcExtensionUIRequest | null;
  promptText: string;
  attachments: AttachedItem[];
  isLoadingModels: boolean;
  isInitializing: boolean;
  error: string | null;

  // Actions
  init: () => Promise<void>;
  loadModelsCatalog: () => Promise<void>;
  saveEnabledModels: (keys: string[]) => Promise<void>;
  ensureActiveSession: (targetTabId?: string) => Promise<string | null>;
  addAttachments: (items: AttachedItem[]) => void;
  removeAttachment: (id: string) => void;
  clearAttachments: () => void;
  refreshCatalog: () => Promise<void>;
  addProject: (dirPath: string, name?: string, color?: string) => Promise<ProjectEntry>;
  updateProject: (id: string, updates: Partial<ProjectEntry>) => Promise<void>;
  removeProject: (id: string) => Promise<void>;
  openSessionTab: (sessionPath: string, projectId: string, title?: string) => Promise<void>;
  newSessionTab: (projectId: string) => Promise<void>;
  openFileTab: (filePath: string, projectId: string, title?: string) => Promise<void>;
  openDiffTab: (filePath: string, staged: boolean, projectId: string) => Promise<void>;
  /** Open (or focus) the singleton Usage analytics tab. */
  openUsageTab: () => void;
  switchTab: (tabId: string) => Promise<void>;
  closeTab: (tabId: string) => Promise<void>;
  setPromptText: (text: string) => void;
  sendPrompt: (streamingBehavior?: "steer" | "followUp") => Promise<void>;
  abort: () => Promise<void>;
  setModel: (provider: string, modelId: string) => Promise<void>;
  setThinkingLevel: (level: string) => Promise<void>;
  setMode: (mode: AgentMode) => void;
  clearError: () => void;
  respondDialog: (response: RpcExtensionUIResponse) => Promise<void>;
  deleteSessionFile: (sessionPath: string) => Promise<void>;
}

let initStarted = false;
const startingSessions = new Map<string, Promise<string | null>>();

/** Pull model / thinking / session-file state from a live session into the store. */
async function hydrateSession(key: string, tabId: string): Promise<void> {
  const set = useSessionStore.setState;
  const get = useSessionStore.getState;
  set({ isLoadingModels: true });
  try {
    const [stateRes, modelsRes, levelsRes] = await Promise.all([
      window.studio.rpc(key, { type: "get_state" }),
      window.studio.rpc(key, { type: "get_available_models" }),
      window.studio.rpc(key, { type: "get_available_thinking_levels" }),
    ]);
    if (stateRes.ok) {
      const state = stateRes.data as { model?: Model<any>; thinkingLevel?: string; sessionFile?: string };
      const tab = get().tabs.find((t) => t.id === tabId);
      const chosenModel = tab?.model ?? get().selectedModel;

      // If user had already selected a model before session hydrated, preserve it and sync to session
      if (chosenModel && state.model && (chosenModel.provider !== state.model.provider || chosenModel.id !== state.model.id)) {
        const setRes = await window.studio.rpc(key, { type: "set_model", provider: chosenModel.provider, modelId: chosenModel.id });
        if (setRes.ok) {
          set({ selectedModel: setRes.data as Model<any> });
        } else if (state.model) {
          set({ selectedModel: state.model });
        }
      } else if (state.model) {
        set({ selectedModel: state.model });
      }

      if (state.thinkingLevel) {
        set({ selectedThinkingLevel: state.thinkingLevel });
        set((s) => ({
          tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, thinkingLevel: state.thinkingLevel } : t)),
        }));
      }
      // New sessions learn their file path here, so switching tabs can reload their history.
      if (state.sessionFile) {
        set((s) => ({ tabs: s.tabs.map((t) => (t.id === tabId && !t.sessionPath ? { ...t, sessionPath: state.sessionFile } : t)) }));
      }
    }
    if (modelsRes.ok) {
      const models = (modelsRes.data as { models: Array<Model<any>> }).models;
      set((s) => {
        const existing = new Set(s.allCatalogModels.map((m) => `${m.provider}/${m.id}`));
        const additions = models.filter((m) => !existing.has(`${m.provider}/${m.id}`));
        return { models, ...(additions.length ? { allCatalogModels: [...s.allCatalogModels, ...additions] } : {}) };
      });
      if (!get().selectedModel && models.length > 0) {
        const enabled = get().enabledModelKeys;
        const match = enabled.length
          ? models.find((m) => enabled.includes(`${m.provider}/${m.id}`) || (!m.id.includes("/") && enabled.includes(m.id)))
          : null;
        set({ selectedModel: match ?? models[0] ?? null });
      }
    }
    if (levelsRes.ok) set({ thinkingLevels: (levelsRes.data as { levels: string[] }).levels });
  } catch (err) {
    console.error("Failed to query session state", err);
  } finally {
    set({ isLoadingModels: false });
  }
}
export const USAGE_TAB_ID = "studio:usage";

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
  allCatalogModels: [],
  enabledModelKeys: [],
  selectedModel: null,
  thinkingLevels: [],
  selectedThinkingLevel: "medium",
  selectedMode: "auto-edit",
  stats: null,
  extensionWidgets: {},
  extensionStatus: {},
  pendingUiDialog: null,
  promptText: "",
  attachments: [],
  isLoadingModels: false,
  isInitializing: true,
  error: null,
  clearError: () => set({ error: null }),

  init: async () => {
    // React StrictMode mounts effects twice in dev; registering IPC listeners twice would apply every
    // streamed event twice (duplicated text). Guard so init runs exactly once per renderer.
    if (initStarted) return;
    initStarted = true;
    try {
      const bootstrap = await window.studio.bootstrap();
      document.documentElement.dataset.platform = bootstrap.platform;
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
      await Promise.all([get().refreshCatalog(), get().loadModelsCatalog()]);

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

  ensureActiveSession: async (targetTabId?: string): Promise<string | null> => {
    const { tabs, activeTabId, projects } = get();
    const tabId = targetTabId || activeTabId;
    if (!tabId) return null;
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab || (tab.kind && tab.kind !== "session")) return null;

    if (tab.activeKey) {
      if (get().activeKey !== tab.activeKey) set({ activeKey: tab.activeKey });
      if (get().models.length === 0 || !get().selectedModel) await hydrateSession(tab.activeKey, tabId);
      return tab.activeKey;
    }

    if (startingSessions.has(tabId)) {
      return startingSessions.get(tabId)!;
    }

    const project = projects.find((p) => p.id === tab.projectId);
    if (!project?.path) return null;

    const startPromise = (async () => {
      set({ isLoadingModels: true });
      try {
        const res = await window.studio.startSession({ projectPath: project.path, sessionPath: tab.sessionPath });
        set((s) => ({
          // Only steal focus if the user is still on this tab.
          ...(s.activeTabId === tabId ? { activeKey: res.key } : {}),
          tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, activeKey: res.key, isCold: false } : t)),
        }));
        await hydrateSession(res.key, tabId);
        return res.key;
      } catch (err) {
        console.error("Failed to start live session", err);
        set({ error: `Couldn't start Pi: ${err instanceof Error ? err.message : String(err)}` });
        return null;
      } finally {
        set({ isLoadingModels: false });
        startingSessions.delete(tabId);
      }
    })();

    startingSessions.set(tabId, startPromise);
    return startPromise;
  },

  loadModelsCatalog: async () => {
    try {
      const catalog = await window.studio.getModelsCatalog();
      if (catalog) {
        const catalogModels = catalog.models as Array<Model<any>>;
        const enabledKeys = catalog.enabledModels || [];
        set({
          allCatalogModels: catalogModels,
          enabledModelKeys: enabledKeys,
        });
        // If models list is currently empty, seed from catalog
        if (get().models.length === 0 && catalogModels.length > 0) {
          set({ models: catalogModels });
          if (!get().selectedModel) {
            const match = enabledKeys.length > 0
              ? catalogModels.find((m) => enabledKeys.includes(`${m.provider}/${m.id}`) || (!m.id.includes("/") && enabledKeys.includes(m.id)))
              : null;
            set({ selectedModel: match ?? catalogModels[0] ?? null });
          }
        }
      }
    } catch (err) {
      console.error("Failed to load models catalog", err);
    }
  },

  saveEnabledModels: async (keys: string[]) => {
    try {
      await window.studio.saveEnabledModels(keys);
      set({ enabledModelKeys: keys });
    } catch (err) {
      console.error("Failed to save enabled models", err);
    }
  },

  addAttachments: (items: AttachedItem[]) => {
    set((s) => ({ attachments: [...s.attachments, ...items] }));
  },

  removeAttachment: (id: string) => {
    set((s) => ({ attachments: s.attachments.filter((a) => a.id !== id) }));
  },

  clearAttachments: () => {
    set({ attachments: [] });
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
      kind: "session",
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

    void get().ensureActiveSession(tabId);
  },

  newSessionTab: async (projectId: string) => {
    const { tabs, projects } = get();
    const project = projects.find((p) => p.id === projectId) ?? null;
    if (!project) return;

    const tabId = `tab_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newTab: TabItem = {
      id: tabId,
      kind: "session",
      projectId,
      title: "New Session",
      pinned: false,
      isCold: true,
      thinkingLevel: get().selectedThinkingLevel,
      mode: get().selectedMode,
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

    void get().ensureActiveSession(tabId);
  },

  openFileTab: async (filePath: string, projectId: string, title?: string) => {
    const { tabs, projects } = get();
    const tabId = `file:${filePath}`;
    const existing = tabs.find((t) => t.id === tabId);
    const project = projects.find((p) => p.id === projectId) ?? null;

    let content = "";
    let language = "text";
    try {
      const data = await window.studio.readFile(filePath);
      content = data.content;
      language = data.language;
    } catch (err: any) {
      content = `Failed to load file: ${err.message || String(err)}`;
    }

    if (existing) {
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === tabId ? { ...t, fileContent: content, fileLanguage: language } : t,
        ),
        activeTabId: tabId,
        activeProject: project,
      }));
      return;
    }

    const fileName = filePath.split(/[/\\]/).pop() || "File";
    const newTab: TabItem = {
      id: tabId,
      kind: "file",
      projectId,
      title: title || fileName,
      filePath,
      fileContent: content,
      fileLanguage: language,
      pinned: false,
      isCold: false,
    };

    set({
      tabs: [...tabs, newTab],
      activeTabId: tabId,
      activeProject: project,
    });
  },

  openDiffTab: async (filePath: string, staged: boolean, projectId: string) => {
    const { tabs, projects } = get();
    const tabId = `diff:${staged ? "staged" : "working"}:${filePath}`;
    const existing = tabs.find((t) => t.id === tabId);
    const project = projects.find((p) => p.id === projectId) ?? null;

    let diffContent = "";
    if (project?.path) {
      try {
        diffContent = await window.studio.getGitDiff(project.path, { staged, filePath });
      } catch (err: any) {
        diffContent = `Failed to load diff: ${err.message || String(err)}`;
      }
    }

    if (existing) {
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === tabId ? { ...t, diffContent: diffContent || "No differences detected." } : t,
        ),
        activeTabId: tabId,
        activeProject: project,
      }));
      return;
    }

    const fileName = filePath.split(/[/\\]/).pop() || filePath;
    const newTab: TabItem = {
      id: tabId,
      kind: "diff",
      projectId,
      title: `${staged ? "[Staged] " : ""}${fileName}`,
      filePath,
      diffStaged: staged,
      diffContent: diffContent || "No differences detected.",
      pinned: false,
      isCold: false,
    };

    set({
      tabs: [...tabs, newTab],
      activeTabId: tabId,
      activeProject: project,
    });
  },

  openUsageTab: () => {
    const { tabs } = get();
    if (!tabs.some((t) => t.id === USAGE_TAB_ID)) {
      const tab: TabItem = { id: USAGE_TAB_ID, kind: "usage", projectId: "", title: "Usage", pinned: false };
      set({ tabs: [...tabs, tab] });
    }
    set({ activeTabId: USAGE_TAB_ID });
  },

  switchTab: async (tabId: string) => {
    const tab = get().tabs.find((t) => t.id === tabId);
    if (!tab) return;
    if (tab.kind === "usage") {
      set({ activeTabId: tabId });
      return;
    }
    // File / diff tabs are views; they must not tear down the live session's transcript.
    if (tab.kind === "file" || tab.kind === "diff") {
      set({ activeTabId: tabId, activeProject: get().projects.find((p) => p.id === tab.projectId) ?? get().activeProject });
      return;
    }
    // Leaving a non-session tab back to the same live session: nothing to reload.
    if ((tab.kind === "session" || !tab.kind) && tab.activeKey && tab.activeKey === get().activeKey) {
      set({ activeTabId: tabId });
      return;
    }
    const project = get().projects.find((p) => p.id === tab.projectId) ?? null;

    set({
      activeTabId: tabId,
      activeProject: project,
      activeKey: tab.activeKey ?? null,
      selectedModel: tab.model ?? get().selectedModel,
      selectedThinkingLevel: tab.thinkingLevel ?? get().selectedThinkingLevel,
      selectedMode: tab.mode ?? get().selectedMode,
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

    if (tab.kind === "session" || !tab.kind) {
      void get().ensureActiveSession(tabId);
    }
  },

  closeTab: async (tabId: string) => {
    const { tabs, activeTabId } = get();
    const tab = tabs.find((t) => t.id === tabId);
    // Stop in the background: closing a tab should feel instant.
    if (tab?.activeKey) void window.studio.stopSession(tab.activeKey).catch(() => {});
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
    let { activeKey, promptText, transcript, attachments } = get();
    if (!promptText.trim() && attachments.length === 0) return;

    // Promote cold tab to live process if needed
    if (!activeKey) {
      activeKey = await get().ensureActiveSession();
      if (!activeKey) return;
    }

    const images: Array<{ type: "image"; data: string; mimeType: string }> = [];
    const fileBlocks: string[] = [];

    for (const item of attachments) {
      if (item.kind === "image" && item.dataBase64) {
        images.push({
          type: "image",
          data: item.dataBase64,
          mimeType: item.mimeType,
        });
      } else if (item.textContent) {
        fileBlocks.push(
          `--- Attached File: ${item.name}${item.path ? ` (${item.path})` : ""} ---\n${item.textContent}\n--- End of File ---`
        );
      }
    }

    let message = promptText;
    if (fileBlocks.length > 0) {
      message = (message ? message + "\n\n" : "") + fileBlocks.join("\n\n");
    }

    // Prefix mode steering if in non-default mode
    const { selectedMode } = get();
    if (selectedMode === "plan") {
      message = `[Mode: Plan - Analyze, research, and outline an architectural plan. Do not execute file edits unless explicitly directed to do so.]\n\n${message}`;
    } else if (selectedMode === "manual") {
      message = `[Mode: Manual - Propose changes and request user confirmation before modifying files.]\n\n${message}`;
    } else if (selectedMode === "debug") {
      message = `[Mode: Debug - Prioritize root cause diagnosis, examining error traces, logs, and reproduction steps.]\n\n${message}`;
    }

    set({ promptText: "", attachments: [] });

    if (transcript.running && streamingBehavior === "steer") {
      await window.studio.rpc(activeKey, {
        type: "steer",
        message,
        ...(images.length > 0 ? { images } : {}),
      });
    } else if (transcript.running && streamingBehavior === "followUp") {
      await window.studio.rpc(activeKey, {
        type: "follow_up",
        message,
        ...(images.length > 0 ? { images } : {}),
      });
    } else {
      await window.studio.rpc(activeKey, {
        type: "prompt",
        message,
        ...(images.length > 0 ? { images } : {}),
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
    // 1. Immediately find the target model in available models or catalog
    const allKnown = [...get().models, ...get().allCatalogModels];
    const target =
      allKnown.find((m) => m.provider === provider && m.id === modelId) ??
      ({ id: modelId, provider, name: modelId, reasoning: false, input: ["text"] } as Model<any>);

    const previousModel = get().selectedModel;
    const previousLevels = get().thinkingLevels;

    // Optimistically update selectedModel immediately so UI changes without delay
    set({ selectedModel: target, error: null });

    // Associate with the active tab so each tab remembers its chosen model
    const { activeTabId } = get();
    if (activeTabId) {
      set((s) => ({
        tabs: s.tabs.map((t) => (t.id === activeTabId ? { ...t, model: target } : t)),
      }));
    }

    // 2. Sync with live session if active or activatable
    let { activeKey } = get();
    if (!activeKey) {
      activeKey = await get().ensureActiveSession();
    }
    if (!activeKey) return;

    try {
      const res = await window.studio.rpc(activeKey, { type: "set_model", provider, modelId });
      if (res.ok) {
        set({ selectedModel: res.data as Model<any>, error: null });
        const levelsRes = await window.studio.rpc(activeKey, { type: "get_available_thinking_levels" });
        if (levelsRes.ok) {
          const levels = (levelsRes.data as { levels: string[] }).levels || [];
          set({ thinkingLevels: levels });
          const currentLvl = get().selectedThinkingLevel;
          if (levels.length > 0 && !levels.includes(currentLvl)) {
            const nextLvl = levels.includes("medium")
              ? "medium"
              : levels.find((l) => l !== "off") || levels[0] || "off";
            set({ selectedThinkingLevel: nextLvl });
            void window.studio.rpc(activeKey, { type: "set_thinking_level", level: nextLvl as any }).catch(() => {});
          }
        }
      } else {
        console.error("set_model RPC returned error:", res.error);
        set({
          selectedModel: previousModel,
          thinkingLevels: previousLevels,
          error: `Could not switch to ${target.name || modelId}: ${res.error}`,
        });
      }
    } catch (err) {
      console.error("set_model RPC failed:", err);
      set({
        selectedModel: previousModel,
        thinkingLevels: previousLevels,
        error: `Failed to set model: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  },

  setThinkingLevel: async (level: string) => {
    const previous = get().selectedThinkingLevel;
    // Optimistically update store immediately so UI updates with zero delay
    set({ selectedThinkingLevel: level });

    const { activeTabId } = get();
    if (activeTabId) {
      set((s) => ({
        tabs: s.tabs.map((t) => (t.id === activeTabId ? { ...t, thinkingLevel: level } : t)),
      }));
    }

    let { activeKey } = get();
    if (!activeKey) {
      activeKey = await get().ensureActiveSession();
    }
    if (!activeKey) return;

    try {
      const res = await window.studio.rpc(activeKey, { type: "set_thinking_level", level: level as any });
      if (!res.ok) {
        console.warn("set_thinking_level RPC returned error:", res.error);
        set({
          selectedThinkingLevel: previous,
          error: `Could not set thinking level to "${level}": ${res.error}`,
        });
      }
    } catch (err) {
      console.error("set_thinking_level RPC failed:", err);
      set({
        selectedThinkingLevel: previous,
        error: `Failed to set thinking level: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  },

  setMode: (mode: AgentMode) => {
    set({ selectedMode: mode });
    const { activeTabId } = get();
    if (activeTabId) {
      set((s) => ({
        tabs: s.tabs.map((t) => (t.id === activeTabId ? { ...t, mode } : t)),
      }));
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

if (typeof window !== "undefined") {
  // Exposed for dev tooling / screenshot automation.
  (window as unknown as { useSessionStore: typeof useSessionStore }).useSessionStore = useSessionStore;
}
