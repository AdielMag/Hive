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
} from "@hive/protocol";
import {
  applyEntries,
  applyEvent,
  createTranscript,
  type TranscriptState,
} from "@hive/pi-adapter";
import { useInsights } from "../features/insights/insights-store.ts";
import { NEW_SESSION_TITLE, sessionDisplayTitle, titleFromPrompt } from "../lib/session-title.ts";
import { clampThinkingLevel, getSupportedThinkingLevels } from "../lib/models/thinking.ts";

declare global {
  interface Window {
    studio: StudioApi;
  }
}

export type SessionActivity = "running" | "done" | "error";

/**
 * Per-session UI state that must never leak between tabs. The displayed session's copy lives in the
 * top-level store fields (so components read it directly); every other tab's copy is parked in `tabUi`.
 */
export interface TabUiState {
  promptText: string;
  attachments: AttachedItem[];
  pendingUiDialog: RpcExtensionUIRequest | null;
  extensionWidgets: Record<string, ExtensionWidgetState>;
  extensionStatus: Record<string, string>;
}

const EMPTY_TAB_UI: TabUiState = {
  promptText: "",
  attachments: [],
  pendingUiDialog: null,
  extensionWidgets: {},
  extensionStatus: {},
};

const DEFAULT_MODE: AgentMode = "auto-edit";

/** True when a parked tab has something unsent in its composer. */
export function hasDraft(ui: TabUiState | undefined): boolean {
  return !!ui && (ui.promptText.trim().length > 0 || ui.attachments.length > 0);
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
  /**
   * Per-tab (keyed by tab id) agent activity, tracked for every tab,
   * not just the active one. "done"/"error" mean the run finished while the user wasn't looking at it.
   */
  sessionActivity: Record<string, SessionActivity>;
  /** Parked per-tab UI state for every session tab except the displayed one (keyed by tab id). */
  tabUi: Record<string, TabUiState>;
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
  /** Open (or focus) the singleton Skills & Agents library tab. */
  openLibraryTab: () => void;
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
  /** Delete a specific queued message from steering or follow-up queue. */
  deleteQueuedMessage: (type: "steering" | "followUp", index: number) => Promise<void>;
  /** Update the text of a specific queued message. */
  editQueuedMessage: (type: "steering" | "followUp", index: number, newText: string) => Promise<void>;
  /** Steer a queued message immediately into the active run ("Do now"). */
  steerQueuedNow: (type: "steering" | "followUp", index: number) => Promise<void>;
  /** Clear all queued messages for the active session. */
  clearAllQueued: () => Promise<void>;
  /** Remove a queued message and put its text back into the composer editor. */
  popQueuedToEditor: (type: "steering" | "followUp", index: number) => Promise<void>;
  /** Set (or clear, with "") the user-facing title of a session. */
  renameSession: (sessionPath: string, title: string) => Promise<void>;
  /** Hide / unhide a session in the sidebar without touching its file. */
  setSessionArchived: (sessionPath: string, archived: boolean) => Promise<void>;
}

let initStarted = false;
const startingSessions = new Map<string, Promise<string | null>>();

/** Main process reports this when the Pi process behind a key has exited / crashed. */
const isStaleSessionError = (error: unknown): boolean =>
  typeof error === "string" && /^Session ".*" is not active$/.test(error);

/** The session tab whose state currently occupies the top-level store fields. */
let displayedSessionTabId: string | null = null;

const isDisplayed = (tabId: string | null | undefined): boolean => !!tabId && displayedSessionTabId === tabId;

/**
 * Park the displayed session tab's UI state and bring in `nextTabId`'s (model/thinking/mode come from
 * the tab itself, never from whichever session was shown before). Returns the store patch to apply.
 */
function swapInSessionTab(nextTabId: string): Partial<SessionStoreState> {
  const s = useSessionStore.getState();
  const prev = displayedSessionTabId;
  displayedSessionTabId = nextTabId;
  const nextTab = s.tabs.find((t) => t.id === nextTabId);
  const nextModel = nextTab?.model ?? null;
  const supportedLevels = getSupportedThinkingLevels(nextModel);
  const clampedLevel = clampThinkingLevel(nextModel, nextTab?.thinkingLevel ?? s.selectedThinkingLevel);
  const config: Partial<SessionStoreState> = {
    selectedModel: nextModel,
    thinkingLevels: supportedLevels,
    selectedThinkingLevel: clampedLevel,
    selectedMode: nextTab?.mode ?? DEFAULT_MODE,
  };
  if (prev === nextTabId) return config;
  const tabUi = { ...s.tabUi };
  if (prev && s.tabs.some((t) => t.id === prev)) {
    tabUi[prev] = {
      promptText: s.promptText,
      attachments: s.attachments,
      pendingUiDialog: s.pendingUiDialog,
      extensionWidgets: s.extensionWidgets,
      extensionStatus: s.extensionStatus,
    };
  }
  const next = tabUi[nextTabId] ?? EMPTY_TAB_UI;
  delete tabUi[nextTabId];
  return { ...config, tabUi, ...next };
}

/** Apply a UI-state change to a tab, whether it is displayed (top-level fields) or parked. */
function updateTabUi(tabId: string, fn: (ui: TabUiState) => Partial<TabUiState>): void {
  useSessionStore.setState((s) => {
    if (isDisplayed(tabId)) return fn(s);
    const cur = s.tabUi[tabId] ?? EMPTY_TAB_UI;
    return { tabUi: { ...s.tabUi, [tabId]: { ...cur, ...fn(cur) } } };
  });
}

/** Tab ids whose current run produced an assistant error. */
const runErrored = new Set<string>();

/** The tab that owns live session `key`, if any (events for closed/dropped keys are ignored). */
function tabIdForKey(key: string): string | undefined {
  return useSessionStore.getState().tabs.find((t) => t.activeKey === key)?.id;
}

/** Whether the user is looking at tab `tabId` right now (it is active and the window is focused). */
function isTabInView(tabId: string): boolean {
  const visible = useSessionStore.getState().activeTabId === tabId;
  return visible && (typeof document === "undefined" || document.hasFocus());
}

function setActivity(tabId: string, activity: SessionActivity | null): void {
  useSessionStore.setState((s) => {
    if ((s.sessionActivity[tabId] ?? null) === activity) return {};
    const next = { ...s.sessionActivity };
    if (activity) next[tabId] = activity;
    else delete next[tabId];
    return { sessionActivity: next };
  });
}

function clearActivity(tabId: string): void {
  runErrored.delete(tabId);
  setActivity(tabId, null);
}

/** The user has now seen tab `tabId`: drop a pending "done"/"error" badge (keep "running"). */
function markSeen(tabId: string): void {
  const cur = useSessionStore.getState().sessionActivity[tabId];
  if (cur === "done" || cur === "error") setActivity(tabId, null);
}

/** Update a tab's activity from a raw event batch of its session (runs for every session, active or not). */
function trackActivity(key: string, events: readonly { type: string; [k: string]: unknown }[]): void {
  const tabId = tabIdForKey(key);
  if (!tabId) return;
  for (const ev of events) {
    // Only real agent runs count; idle custom messages also emit message_start but never settle.
    const assistantStart = ev.type === "message_start" && (ev.message as { role?: string } | undefined)?.role === "assistant";
    if (ev.type === "agent_start" || assistantStart) {
      if (ev.type === "agent_start") runErrored.delete(tabId);
      setActivity(tabId, "running");
    } else if (ev.type === "message_end") {
      const msg = ev.message as { role?: string; stopReason?: string } | undefined;
      if (msg?.role === "assistant" && msg.stopReason === "error") runErrored.add(tabId);
    } else if (ev.type === "agent_settled") {
      const errored = runErrored.has(tabId);
      runErrored.delete(tabId);
      setActivity(tabId, isTabInView(tabId) ? null : errored ? "error" : "done");
    }
  }
}

/** Coming back to the window counts as seeing the active tab. */
if (typeof window !== "undefined") {
  window.addEventListener("focus", () => {
    const tabId = useSessionStore.getState().activeTabId;
    if (tabId) markSeen(tabId);
  });
}

/**
 * Forget a dead session key so the next action respawns Pi for that tab (resuming its session file).
 * A crash in the middle of a run the user isn't watching is surfaced as an "error" badge.
 */
function dropSessionKey(key: string, crashed = false): void {
  const tabId = tabIdForKey(key);
  if (tabId) {
    const wasRunning = useSessionStore.getState().sessionActivity[tabId] === "running";
    runErrored.delete(tabId);
    if (wasRunning) setActivity(tabId, crashed && !isTabInView(tabId) ? "error" : null);
  }
  useSessionStore.setState((s) => ({
    tabs: s.tabs.map((t) => (t.activeKey === key ? { ...t, activeKey: undefined, isCold: true } : t)),
    ...(s.activeKey === key ? { activeKey: null } : {}),
  }));
}

/**
 * Send an RPC to the active tab's live session, spawning it if needed. If the process died underneath
 * us (stale key), drop the key, respawn once and retry.
 */
async function rpcLive(command: Parameters<StudioApi["rpc"]>[1]): Promise<Awaited<ReturnType<StudioApi["rpc"]>> | null> {
  const get = useSessionStore.getState;
  let key = get().activeKey ?? (await get().ensureActiveSession());
  if (!key) return null;
  const res = await window.studio.rpc(key, command);
  if (res.ok || !isStaleSessionError(res.error)) return res;
  dropSessionKey(key);
  key = await get().ensureActiveSession();
  if (!key) return res;
  return window.studio.rpc(key, command);
}

/** Fetch context/token stats for `key`; ignored if the user has switched sessions meanwhile. */
async function refreshStats(key: string): Promise<void> {
  const res = await window.studio.rpc(key, { type: "get_session_stats" });
  if (res.ok && useSessionStore.getState().activeKey === key) {
    useSessionStore.setState({ stats: res.data as SessionStats });
  }
}

/**
 * Reconcile a live session with its tab. The tab owns its model / thinking level (chosen by the user,
 * possibly before Pi started); if it has none yet, it adopts whatever the session file restored. Only
 * touches the top-level fields if this tab is still the displayed one when each RPC returns.
 */
async function hydrateSession(key: string, tabId: string): Promise<void> {
  const set = useSessionStore.setState;
  const get = useSessionStore.getState;
  const rpc = window.studio.rpc;
  const patchTab = (patch: Partial<TabItem>) =>
    set((s) => ({ tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, ...patch } : t)) }));
  if (isDisplayed(tabId)) set({ isLoadingModels: true });
  try {
    const [stateRes, modelsRes] = await Promise.all([
      rpc(key, { type: "get_state" }),
      rpc(key, { type: "get_available_models" }),
    ]);
    const models = modelsRes.ok ? (modelsRes.data as { models: Array<Model<any>> }).models : null;
    if (models) {
      set((s) => {
        const existing = new Set(s.allCatalogModels.map((m) => `${m.provider}/${m.id}`));
        const additions = models.filter((m) => !existing.has(`${m.provider}/${m.id}`));
        return { models, ...(additions.length ? { allCatalogModels: [...s.allCatalogModels, ...additions] } : {}) };
      });
    }
    if (!stateRes.ok) return;
    const state = stateRes.data as {
      model?: Model<any>;
      thinkingLevel?: string;
      sessionFile?: string;
      isStreaming?: boolean;
    };

    // The session may be mid-run (e.g. waiting on the model) even if we never saw its agent_start.
    if (state.isStreaming) {
      setActivity(tabId, "running");
      if (isDisplayed(tabId) && get().activeKey === key) {
        set((s) => (s.transcript.running ? {} : { transcript: { ...s.transcript, running: true } }));
      }
    }

    // New sessions learn their file path here, so switching tabs can reload their history.
    if (state.sessionFile) {
      set((s) => ({ tabs: s.tabs.map((t) => (t.id === tabId && !t.sessionPath ? { ...t, sessionPath: state.sessionFile } : t)) }));
    }

    // Model: the tab's choice wins; otherwise keep the session's own; otherwise the first enabled model.
    const tab = get().tabs.find((t) => t.id === tabId);
    let model = state.model ?? null;
    const wanted = tab?.model as Model<any> | undefined;
    if (wanted && (!model || wanted.provider !== model.provider || wanted.id !== model.id)) {
      const setRes = await rpc(key, { type: "set_model", provider: wanted.provider, modelId: wanted.id });
      if (setRes.ok) model = setRes.data as Model<any>;
    }
    if (!model && models && models.length > 0) {
      const enabled = get().enabledModelKeys;
      const match = enabled.length
        ? models.find((m) => enabled.includes(`${m.provider}/${m.id}`) || (!m.id.includes("/") && enabled.includes(m.id)))
        : null;
      model = match ?? models[0] ?? null;
    }
    if (model) {
      patchTab({ model });
      if (isDisplayed(tabId)) set({ selectedModel: model });
    }

    // Thinking: levels depend on the (possibly just changed) model, so fetch them afterwards.
    const levelsRes = await rpc(key, { type: "get_available_thinking_levels" });
    const levels = levelsRes.ok ? (levelsRes.data as { levels: string[] }).levels ?? [] : getSupportedThinkingLevels(model);
    const wantedLevel = get().tabs.find((t) => t.id === tabId)?.thinkingLevel;
    const baseLevel = wantedLevel ?? state.thinkingLevel ?? "medium";
    const effectiveLevel = levels.length > 0 && levels.includes(baseLevel)
      ? baseLevel
      : clampThinkingLevel(model, baseLevel);

    if (effectiveLevel !== state.thinkingLevel) {
      void rpc(key, { type: "set_thinking_level", level: effectiveLevel as any }).catch(() => {});
    }
    patchTab({ thinkingLevel: effectiveLevel });
    if (isDisplayed(tabId)) {
      set({ thinkingLevels: levels, selectedThinkingLevel: effectiveLevel });
    }
  } catch (err) {
    console.error("Failed to query session state", err);
  } finally {
    if (isDisplayed(tabId)) set({ isLoadingModels: false });
  }
}
export const USAGE_TAB_ID = "studio:usage";
export const LIBRARY_TAB_ID = "studio:library";

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
  sessionActivity: {},
  tabUi: {},
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
        trackActivity(batch.key, batch.events);
        if (batch.key !== get().activeKey) {
          // A background tab finishing a turn may have just created / updated its session file.
          if (batch.events.some((e) => e.type === "agent_settled")) void get().refreshCatalog();
          return;
        }
        let t = get().transcript;
        for (const ev of batch.events) {
          t = applyEvent(t, ev);
          if (ev.type === "thinking_level_changed" && typeof (ev as any).level === "string") {
            const level = (ev as any).level;
            set({ selectedThinkingLevel: level });
            const tabId = get().activeTabId;
            if (tabId) {
              set((s) => ({
                tabs: s.tabs.map((tab) => (tab.id === tabId ? { ...tab, thinkingLevel: level } : tab)),
              }));
            }
          }
        }
        set({ transcript: t });
        // Refresh session stats on settled
        if (batch.events.some((e) => e.type === "agent_settled")) {
          void (async () => {
            const key = get().activeKey;
            if (!key) return;
            await refreshStats(key);
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
        // The Pi process is gone; main has already forgotten this key. Don't keep sending RPCs to it.
        if (status.phase === "exited" || status.phase === "crashed") {
          dropSessionKey(status.key, status.phase === "crashed");
        }
      });

      // Listen for extension UI requests
      // Extension UI requests: route to the owning tab even if it is in the background, so a session
      // that is waiting on a question (or updated its widgets/status) shows that when you come back.
      window.studio.onUiRequest(({ key, request }) => {
        const tabId = key === get().activeKey && displayedSessionTabId ? displayedSessionTabId : tabIdForKey(key);
        if (!tabId) return;
        if (request.method === "setStatus") {
          const statusKey = request.statusKey;
          updateTabUi(tabId, (s) => ({
            extensionStatus: request.statusText
              ? { ...s.extensionStatus, [statusKey]: request.statusText }
              : Object.fromEntries(Object.entries(s.extensionStatus).filter(([k]) => k !== statusKey)),
          }));
          return;
        }
        if (request.method === "setWidget") {
          const widgetKey = request.widgetKey;
          updateTabUi(tabId, (s) => ({
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
          updateTabUi(tabId, () => ({ promptText: request.text }));
          return;
        }

        if (["select", "confirm", "input", "editor"].includes(request.method)) {
          updateTabUi(tabId, () => ({ pendingUiDialog: request }));
        }
      });

      // Initial projects and catalog load
      await Promise.all([get().refreshCatalog(), get().loadModelsCatalog()]);

      // Only auto-open if an explicit project was passed via env HIVE_PROJECT
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
      if (isDisplayed(tabId) && get().activeKey !== tab.activeKey) set({ activeKey: tab.activeKey });
      // Every switch re-syncs model/thinking/run state from the live process (the tab is the source of truth).
      await hydrateSession(tab.activeKey, tabId);
      if (get().activeKey === tab.activeKey && !get().stats) void refreshStats(tab.activeKey);
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
          ...(isDisplayed(tabId) ? { activeKey: res.key } : {}),
          tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, activeKey: res.key, isCold: false } : t)),
        }));
        await hydrateSession(res.key, tabId);
        if (get().activeKey === res.key) void refreshStats(res.key);
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
            const chosen = match ?? catalogModels[0] ?? null;
            if (chosen) {
              const levels = getSupportedThinkingLevels(chosen);
              const clamped = clampThinkingLevel(chosen, get().selectedThinkingLevel);
              set({
                selectedModel: chosen,
                thinkingLevels: levels,
                selectedThinkingLevel: clamped,
              });
            }
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
      const [projects, listed] = await Promise.all([
        window.studio.getProjects(),
        window.studio.listAllSessions(),
      ]);
      let allSessions = listed;
      set((s) => {
        // Keep session tab headers in sync with the catalog (first prompt, Pi name or user rename).
        // Pi only lists a session once its file is written; keep optimistic entries for open tabs until then.
        const known = new Set(allSessions.map((item) => item.path));
        const pending = s.allSessions.filter(
          (item) => item.pending && !known.has(item.path) && s.tabs.some((t) => t.sessionPath === item.path),
        );
        if (pending.length) allSessions = [...pending, ...allSessions];
        const byPath = new Map(allSessions.map((item) => [item.path, item]));
        let changed = false;
        const tabs = s.tabs.map((t) => {
          if ((t.kind && t.kind !== "session") || !t.sessionPath) return t;
          const item = byPath.get(t.sessionPath);
          const title = item ? sessionDisplayTitle(item, 40) : "";
          if (!title || title === t.title) return t;
          changed = true;
          return { ...t, title };
        });
        return changed ? { projects, allSessions, tabs } : { projects, allSessions };
      });
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
      // No model/thinking yet: they come from the session file once Pi loads it (not from the current tab).
      mode: DEFAULT_MODE,
    };

    set({ tabs: [...tabs, newTab] });
    set({
      ...swapInSessionTab(tabId),
      activeTabId: tabId,
      activeProject: project,
      activeKey: null,
      transcript: createTranscript(),
      stats: null,
    });

    // Cold read: parse entries from disk without spawning process
    try {
      const { entries, leafId } = await window.studio.readSessionFile(sessionPath);
      set((s) => (s.activeTabId === tabId ? { transcript: applyEntries(s.transcript, entries, leafId, "replace") } : {}));
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
    const curModel = get().selectedModel;
    const initialThinking = clampThinkingLevel(curModel, get().selectedThinkingLevel);
    const newTab: TabItem = {
      id: tabId,
      kind: "session",
      projectId,
      title: NEW_SESSION_TITLE,
      pinned: false,
      isCold: true,
      // A brand-new session starts from the last-used configuration; after that it is its own.
      model: curModel ?? undefined,
      thinkingLevel: initialThinking,
      mode: get().selectedMode,
    };

    set({ tabs: [...tabs, newTab] });
    set({
      ...swapInSessionTab(tabId),
      activeTabId: tabId,
      activeProject: project,
      activeKey: null,
      transcript: createTranscript(),
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
    // Every entry point opens the all-sessions view; callers wanting one session set the focus afterwards.
    useInsights.getState().setFocusSession(null);
    const { tabs } = get();
    if (!tabs.some((t) => t.id === USAGE_TAB_ID)) {
      const tab: TabItem = { id: USAGE_TAB_ID, kind: "usage", projectId: "", title: "Usage", pinned: false };
      set({ tabs: [...tabs, tab] });
    }
    set({ activeTabId: USAGE_TAB_ID });
  },

  openLibraryTab: () => {
    const { tabs } = get();
    if (!tabs.some((t) => t.id === LIBRARY_TAB_ID)) {
      const tab: TabItem = { id: LIBRARY_TAB_ID, kind: "library", projectId: "", title: "Skills & Agents", pinned: false };
      set({ tabs: [...tabs, tab] });
    }
    set({ activeTabId: LIBRARY_TAB_ID });
  },

  switchTab: async (tabId: string) => {
    const tab = get().tabs.find((t) => t.id === tabId);
    if (!tab) return;
    if (tab.kind === "usage" || tab.kind === "library") {
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
      markSeen(tabId);
      return;
    }
    markSeen(tabId);
    const bgRunning = get().sessionActivity[tabId] === "running";
    const project = get().projects.find((p) => p.id === tab.projectId) ?? null;

    set({
      ...swapInSessionTab(tabId),
      activeTabId: tabId,
      activeProject: project,
      activeKey: tab.activeKey ?? null,
      // A session that kept working in the background is still running; reflect it right away
      // (hydrateSession then confirms with Pi's own isStreaming flag).
      transcript: { ...createTranscript(), running: bgRunning },
      stats: null,
    });

    if (tab.sessionPath) {
      try {
        const { entries, leafId } = await window.studio.readSessionFile(tab.sessionPath);
        set((s) => (s.activeTabId === tabId ? { transcript: applyEntries(s.transcript, entries, leafId, "replace") } : {}));
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
    if (tab?.activeKey) {
      void window.studio.stopSession(tab.activeKey).catch(() => {});
    }
    clearActivity(tabId);
    // The session file may only now be complete on disk; make sure it's listed so it can be reopened.
    if (tab?.sessionPath) void get().refreshCatalog();
    const remaining = tabs.filter((t) => t.id !== tabId);
    set((s) => {
      const tabUi = { ...s.tabUi };
      delete tabUi[tabId];
      return { tabs: remaining, tabUi };
    });
    if (displayedSessionTabId === tabId) displayedSessionTabId = null;

    if (activeTabId === tabId && remaining.length > 0) {
      const nextTab = remaining[remaining.length - 1]!;
      await get().switchTab(nextTab.id);
    } else if (remaining.length === 0) {
      set({ activeTabId: null, activeProject: null, activeKey: null, transcript: createTranscript(), ...EMPTY_TAB_UI });
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

    // Name a fresh tab after its first prompt so the header reflects the conversation right away.
    const { activeTabId } = get();
    const autoTitle = promptText.trim().startsWith("/")
      ? ""
      : titleFromPrompt(promptText, 40) || attachments[0]?.name || "";
    if (autoTitle && activeTabId) {
      set((s) => ({
        tabs: s.tabs.map((t) => (t.id === activeTabId && t.title === NEW_SESSION_TITLE ? { ...t, title: autoTitle } : t)),
      }));
    }

    // Show a brand-new session under its project immediately (Pi writes/lists the file only after the first reply).
    const sentTab = get().tabs.find((t) => t.id === activeTabId);
    const sentPath = sentTab?.sessionPath;
    if (sentTab && sentPath && !get().allSessions.some((x) => x.path === sentPath)) {
      const project = get().projects.find((p) => p.id === sentTab.projectId);
      const now = new Date().toISOString();
      set((s) => ({
        allSessions: [
          {
            path: sentPath,
            id: sentPath,
            cwd: project?.path ?? "",
            created: now,
            modified: now,
            messageCount: 0,
            firstMessage: promptText || attachments[0]?.name || "",
            projectId: sentTab.projectId,
            pending: true,
          },
          ...s.allSessions,
        ],
      }));
    }

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
    const allKnown = [...get().models, ...get().allCatalogModels];
    const target =
      allKnown.find((m) => m.provider === provider && m.id === modelId) ??
      ({ id: modelId, provider, name: modelId, reasoning: false, input: ["text"] } as Model<any>);

    // The choice belongs to the session tab it was made in, even if the user switches away mid-RPC.
    const tabId = displayedSessionTabId;
    const patchTab = (patch: Partial<TabItem>) =>
      set((s) => ({ tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, ...patch } : t)) }));
    const previousModel = get().selectedModel;
    const previousLevels = get().thinkingLevels;
    const previousLevel = get().selectedThinkingLevel;

    // Immediately compute supported thinking levels and clamped level for the target model
    const expectedLevels = getSupportedThinkingLevels(target);
    const clampedLevel = clampThinkingLevel(target, previousLevel);

    // Optimistic: the pickers and context reflect the choice immediately.
    set({
      selectedModel: target,
      thinkingLevels: expectedLevels,
      selectedThinkingLevel: clampedLevel,
      error: null,
    });
    if (tabId) patchTab({ model: target, thinkingLevel: clampedLevel });

    // Update contextUsage window if target has a known contextWindow
    const stats = get().stats;
    if (stats?.contextUsage && target.contextWindow) {
      const tokens = stats.contextUsage.tokens ?? 0;
      const contextWindow = target.contextWindow;
      const percent = contextWindow > 0 ? (tokens / contextWindow) * 100 : 0;
      set({ stats: { ...stats, contextUsage: { ...stats.contextUsage, contextWindow, percent } } });
    }

    try {
      const res = await rpcLive({ type: "set_model", provider, modelId });
      const key = get().tabs.find((t) => t.id === tabId)?.activeKey;
      if (!res || !key) return;
      if (res.ok) {
        const model = res.data as Model<any>;
        // Query live thinking levels and state after model change
        const [levelsRes, stateRes] = await Promise.all([
          window.studio.rpc(key, { type: "get_available_thinking_levels" }),
          window.studio.rpc(key, { type: "get_state" }),
        ]);
        const levels = levelsRes.ok ? (levelsRes.data as { levels: string[] }).levels || [] : expectedLevels;
        const piLevel = stateRes.ok ? (stateRes.data as any)?.thinkingLevel : undefined;
        const effectiveLevel = piLevel && levels.includes(piLevel) ? piLevel : clampThinkingLevel(model, clampedLevel);

        if (piLevel && piLevel !== effectiveLevel) {
          void window.studio.rpc(key, { type: "set_thinking_level", level: effectiveLevel as any }).catch(() => {});
        }

        patchTab({ model, thinkingLevel: effectiveLevel });
        if (isDisplayed(tabId)) {
          set({
            selectedModel: model,
            thinkingLevels: levels,
            selectedThinkingLevel: effectiveLevel,
            error: null,
          });
        }
        void refreshStats(key);
      } else {
        console.error("set_model RPC returned error:", res.error);
        patchTab({ model: previousModel ?? undefined, thinkingLevel: previousLevel });
        if (isDisplayed(tabId)) {
          set({
            selectedModel: previousModel,
            thinkingLevels: previousLevels,
            selectedThinkingLevel: previousLevel,
            error: `Could not switch to ${target.name || modelId}: ${res.error}`,
          });
        }
      }
    } catch (err) {
      console.error("set_model RPC failed:", err);
      patchTab({ model: previousModel ?? undefined, thinkingLevel: previousLevel });
      if (isDisplayed(tabId)) {
        set({
          selectedModel: previousModel,
          thinkingLevels: previousLevels,
          selectedThinkingLevel: previousLevel,
          error: `Failed to set model: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }
  },

  setThinkingLevel: async (level: string) => {
    const tabId = displayedSessionTabId;
    const patchTab = (thinkingLevel: string) =>
      set((s) => ({ tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, thinkingLevel } : t)) }));
    const previous = get().selectedThinkingLevel;
    const clamped = clampThinkingLevel(get().selectedModel, level);
    set({ selectedThinkingLevel: clamped });
    if (tabId) patchTab(clamped);

    const fail = (error: string) => {
      patchTab(previous);
      if (isDisplayed(tabId)) set({ selectedThinkingLevel: previous, error });
    };
    try {
      const res = await rpcLive({ type: "set_thinking_level", level: clamped as any });
      if (!res) return;
      if (res.ok) {
        // A respawn re-hydrates from the session file and may have reset the level; reassert the choice.
        patchTab(clamped);
        if (isDisplayed(tabId)) set({ selectedThinkingLevel: clamped });
      } else {
        console.warn("set_thinking_level RPC returned error:", res.error);
        fail(`Could not set thinking level to "${clamped}": ${res.error}`);
      }
    } catch (err) {
      console.error("set_thinking_level RPC failed:", err);
      fail(`Failed to set thinking level: ${err instanceof Error ? err.message : String(err)}`);
    }
  },

  setMode: (mode: AgentMode) => {
    set({ selectedMode: mode });
    const tabId = displayedSessionTabId;
    if (tabId) {
      set((s) => ({ tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, mode } : t)) }));
    }
  },

  respondDialog: async (response: RpcExtensionUIResponse) => {
    const { activeKey } = get();
    if (!activeKey) return;
    await window.studio.respondUi(activeKey, response);
    set({ pendingUiDialog: null });
  },

  deleteSessionFile: async (sessionPath: string) => {
    // Close any open tab first and stop Pi process so Windows releases file handles.
    const openTabs = get().tabs.filter((t) => t.sessionPath === sessionPath);
    for (const t of openTabs) {
      if (t.activeKey) {
        try {
          await window.studio.stopSession(t.activeKey);
        } catch {}
      }
      await get().closeTab(t.id);
    }
    await window.studio.deleteSessionFile(sessionPath);
    await get().refreshCatalog();
  },

  deleteQueuedMessage: async (type: "steering" | "followUp", index: number) => {
    const { activeKey } = get();
    if (!activeKey) return;
    const res = await window.studio.rpc(activeKey, { type: "clear_queue" });
    if (!res.ok) return;
    const current = (res.data ?? {}) as { steering?: string[]; followUp?: string[] };
    const steering = [...(current.steering ?? [])];
    const followUp = [...(current.followUp ?? [])];

    if (type === "steering") {
      steering.splice(index, 1);
    } else {
      followUp.splice(index, 1);
    }

    for (const msg of steering) {
      await window.studio.rpc(activeKey, { type: "steer", message: msg });
    }
    for (const msg of followUp) {
      await window.studio.rpc(activeKey, { type: "follow_up", message: msg });
    }

    set((s) => ({
      transcript: {
        ...s.transcript,
        queue: { steering, followUp },
      },
    }));
  },

  editQueuedMessage: async (type: "steering" | "followUp", index: number, newText: string) => {
    const trimmed = newText.trim();
    if (!trimmed) {
      return get().deleteQueuedMessage(type, index);
    }
    const { activeKey } = get();
    if (!activeKey) return;
    const res = await window.studio.rpc(activeKey, { type: "clear_queue" });
    if (!res.ok) return;
    const current = (res.data ?? {}) as { steering?: string[]; followUp?: string[] };
    const steering = [...(current.steering ?? [])];
    const followUp = [...(current.followUp ?? [])];

    if (type === "steering") {
      if (index >= 0 && index < steering.length) steering[index] = trimmed;
    } else {
      if (index >= 0 && index < followUp.length) followUp[index] = trimmed;
    }

    for (const msg of steering) {
      await window.studio.rpc(activeKey, { type: "steer", message: msg });
    }
    for (const msg of followUp) {
      await window.studio.rpc(activeKey, { type: "follow_up", message: msg });
    }

    set((s) => ({
      transcript: {
        ...s.transcript,
        queue: { steering, followUp },
      },
    }));
  },

  steerQueuedNow: async (type: "steering" | "followUp", index: number) => {
    const { activeKey, transcript } = get();
    if (!activeKey) return;

    if (!transcript.running) {
      const list = type === "steering" ? transcript.queue.steering : transcript.queue.followUp;
      const target = list[index];
      if (!target) return;
      await get().deleteQueuedMessage(type, index);
      await window.studio.rpc(activeKey, { type: "prompt", message: target });
      return;
    }

    const res = await window.studio.rpc(activeKey, { type: "clear_queue" });
    if (!res.ok) return;
    const current = (res.data ?? {}) as { steering?: string[]; followUp?: string[] };
    const steering = [...(current.steering ?? [])];
    const followUp = [...(current.followUp ?? [])];

    let target: string | undefined;
    if (type === "steering") {
      [target] = steering.splice(index, 1);
    } else {
      [target] = followUp.splice(index, 1);
    }
    if (!target) return;

    await window.studio.rpc(activeKey, { type: "steer", message: target });
    for (const msg of steering) {
      await window.studio.rpc(activeKey, { type: "steer", message: msg });
    }
    for (const msg of followUp) {
      await window.studio.rpc(activeKey, { type: "follow_up", message: msg });
    }

    set((s) => ({
      transcript: {
        ...s.transcript,
        queue: {
          steering: [target!, ...steering],
          followUp,
        },
      },
    }));
  },

  clearAllQueued: async () => {
    const { activeKey } = get();
    if (!activeKey) return;
    await window.studio.rpc(activeKey, { type: "clear_queue" });
    set((s) => ({
      transcript: {
        ...s.transcript,
        queue: { steering: [], followUp: [] },
      },
    }));
  },

  popQueuedToEditor: async (type: "steering" | "followUp", index: number) => {
    const { transcript, promptText } = get();
    const list = type === "steering" ? transcript.queue.steering : transcript.queue.followUp;
    const msg = list[index];
    if (msg === undefined) return;
    await get().deleteQueuedMessage(type, index);
    const combined = promptText.trim() ? `${promptText}\n\n${msg}` : msg;
    set({ promptText: combined });
  },

  renameSession: async (sessionPath: string, title: string) => {
    const trimmed = title.trim();
    await window.studio.updateSessionMeta(sessionPath, { title: trimmed }); // "" clears the override
    if (trimmed) {
      set((s) => ({ tabs: s.tabs.map((t) => (t.sessionPath === sessionPath ? { ...t, title: trimmed } : t)) }));
    }
    await get().refreshCatalog();
  },

  setSessionArchived: async (sessionPath: string, archived: boolean) => {
    // Optimistic: hide/show immediately, then reconcile with disk.
    set((s) => ({ allSessions: s.allSessions.map((x) => (x.path === sessionPath ? { ...x, archived } : x)) }));
    await window.studio.updateSessionMeta(sessionPath, { archived });
    await get().refreshCatalog();
  },
}));

if (typeof window !== "undefined") {
  // Exposed for dev tooling / screenshot automation.
  (window as unknown as { useSessionStore: typeof useSessionStore }).useSessionStore = useSessionStore;
}
