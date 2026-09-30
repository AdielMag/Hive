import { create } from "zustand";
import {
  type Bootstrap,
  type Model,
  type RpcExtensionUIRequest,
  type RpcExtensionUIResponse,
  type SessionStats,
  type SessionStatusUpdate,
  type StudioApi,
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
  activeKey: string | null;
  projectPath: string;
  projectName: string;
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
  startSession: (projectPath: string, sessionPath?: string) => Promise<void>;
  setPromptText: (text: string) => void;
  sendPrompt: (streamingBehavior?: "steer" | "followUp") => Promise<void>;
  abort: () => Promise<void>;
  setModel: (provider: string, modelId: string) => Promise<void>;
  setThinkingLevel: (level: string) => Promise<void>;
  respondDialog: (response: RpcExtensionUIResponse) => Promise<void>;
}

export const useSessionStore = create<SessionStoreState>((set, get) => ({
  bootstrap: null,
  activeKey: null,
  projectPath: "",
  projectName: "",
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
        // Fire-and-forget requests:
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

        // Dialog requests requiring response
        if (["select", "confirm", "input", "editor"].includes(request.method)) {
          set({ pendingUiDialog: request });
        }
      });

      // Auto-start initial session if Pi is found
      if (bootstrap.pi.ok && bootstrap.initialProjectPath) {
        await get().startSession(bootstrap.initialProjectPath);
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err), isInitializing: false });
    }
  },

  startSession: async (projectPath: string, sessionPath?: string) => {
    set({ projectPath, projectName: projectPath.split(/[/\\]/).pop() || projectPath, error: null });
    try {
      const { key } = await window.studio.startSession({ projectPath, sessionPath });
      set({
        activeKey: key,
        transcript: createTranscript(),
        extensionWidgets: {},
        extensionStatus: {},
        pendingUiDialog: null,
      });

      // Fetch initial models, state, thinking levels
      const stateRes = await window.studio.rpc(key, { type: "get_state" });
      if (stateRes.ok) {
        const state = stateRes.data as {
          model?: Model<any>;
          thinkingLevel?: string;
        };
        if (state.model) set({ selectedModel: state.model });
        if (state.thinkingLevel) set({ selectedThinkingLevel: state.thinkingLevel });
      }

      const modelsRes = await window.studio.rpc(key, { type: "get_available_models" });
      if (modelsRes.ok) {
        const models = (modelsRes.data as { models: Array<Model<any>> }).models;
        set({ models });
        if (!get().selectedModel && models.length > 0) {
          set({ selectedModel: models[0] ?? null });
        }
      }

      const levelsRes = await window.studio.rpc(key, { type: "get_available_thinking_levels" });
      if (levelsRes.ok) {
        set({ thinkingLevels: (levelsRes.data as { levels: string[] }).levels });
      }

      // Initial entries
      const entriesRes = await window.studio.rpc(key, { type: "get_entries" });
      if (entriesRes.ok) {
        const { entries, leafId } = entriesRes.data as { entries: any[]; leafId: string | null };
        set((s) => ({
          transcript: applyEntries(s.transcript, entries, leafId, "replace"),
        }));
      }

      const statsRes = await window.studio.rpc(key, { type: "get_session_stats" });
      if (statsRes.ok) {
        set({ stats: statsRes.data as SessionStats });
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  setPromptText: (text: string) => set({ promptText: text }),

  sendPrompt: async (streamingBehavior) => {
    const { activeKey, promptText, transcript } = get();
    if (!activeKey || !promptText.trim()) return;

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
}));
