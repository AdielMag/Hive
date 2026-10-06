import { summarizeReload } from "../lib/reload-summary.ts";
import { create } from "zustand";
import {
  BRIDGE_TOPICS,
  isCoreTabKind,
  isStudioFormCancel,
  isStudioSubagentActivity,
  isStudioSubagentStopResult,
  isStudioFormRequest,
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
  type StudioFormRequest,
  type StudioFormResult,
  type TabItem,
} from "@hive/protocol";
import {
  applyEntries,
  applyEvent,
  createTranscript,
  type TranscriptState,
} from "@hive/pi-adapter";
import { emitSessionEvents } from "../modules/session-bus.ts";
import { openLink } from "../modules/link-bus.ts";
import type { OpenTabSpec } from "@hive/module-sdk/renderer";
import { NEW_SESSION_TITLE, sessionDisplayTitle, titleFromPrompt } from "../lib/session-title.ts";
import { clampThinkingLevel, getSupportedThinkingLevels } from "../lib/models/thinking.ts";
import { parseAgentResultText, type SubagentView } from "../lib/ai/subagents.ts";

export interface SubagentModalTarget {
  view: SubagentView;
  parentSessionPath?: string;
  parentActiveKey?: string;
  projectId?: string;
}

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
  /** Multi-question form from an extension (bridge capability "ui:form"). */
  pendingForm: StudioFormRequest | null;
  extensionWidgets: Record<string, ExtensionWidgetState>;
  extensionStatus: Record<string, string>;
}

const EMPTY_TAB_UI: TabUiState = {
  promptText: "",
  attachments: [],
  pendingUiDialog: null,
  pendingForm: null,
  extensionWidgets: {},
  extensionStatus: {},
};

const DEFAULT_MODE: AgentMode = "auto-edit";

/** True when a parked tab has something unsent in its composer. */
export function hasDraft(ui: TabUiState | undefined): boolean {
  return !!ui && (ui.promptText.trim().length > 0 || ui.attachments.length > 0);
}

/** Progress of a Pi reload for one session. "reloading" locks the composer; the others are a result strip. */
export interface ReloadState {
  phase: "reloading" | "success" | "error";
  /** Headline: what is happening or what changed ("+1 skill", an error message...). */
  message: string;
  /** Extra lines for a tooltip (names of added/removed tools and skills). */
  detail?: string;
}

/** How long a success strip stays before disappearing on its own. */
const RELOAD_SUCCESS_MS = 6000;
const reloadClearTimers = new Map<string, ReturnType<typeof setTimeout>>();

function setReloadState(key: string, state: ReloadState | null): void {
  const timer = reloadClearTimers.get(key);
  if (timer) {
    clearTimeout(timer);
    reloadClearTimers.delete(key);
  }
  useSessionStore.setState((s) => {
    const next = { ...s.reloadStates };
    if (state) next[key] = state;
    else delete next[key];
    return { reloadStates: next };
  });
  if (state?.phase === "success") {
    reloadClearTimers.set(
      key,
      setTimeout(() => {
        reloadClearTimers.delete(key);
        if (useSessionStore.getState().reloadStates[key]?.phase === "success") setReloadState(key, null);
      }, RELOAD_SUCCESS_MS),
    );
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
  transcriptsByTab: Record<string, TranscriptState>;
  /** Session tab whose state occupies the top-level fields (transcript, composer...). Differs from activeTabId while a file/diff tab is focused. */
  displayedTabId: string | null;
  models: Array<Model<any>>;
  allCatalogModels: Array<Model<any>>;
  enabledModelKeys: string[];
  defaultModel?: string;
  defaultProvider?: string;
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
  pendingForm: StudioFormRequest | null;
  promptText: string;
  attachments: AttachedItem[];
  isLoadingModels: boolean;
  /** Per live-session-key reload progress/result, so each session shows (and is locked by) its own reload. */
  reloadStates: Record<string, ReloadState>;
  /** Bumped after every successful reload; views that cache registry-derived data re-fetch on change. */
  reloadEpoch: number;
  isInitializing: boolean;
  error: string | null;

  // Actions
  init: () => Promise<void>;
  /** Reload Pi's extensions, skills and prompts for the active session (the CLI's `/reload`) and refresh dependent views. */
  reloadPi: () => Promise<void>;
  /** Hide a finished (success/failed) reload strip for session `key`. */
  dismissReload: (key: string) => void;
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
  subagentModal: SubagentModalTarget | null;
  openSubagentModal: (target: SubagentModalTarget) => void;
  closeSubagentModal: () => void;
  openSubagentTab: (
    view: SubagentView,
    opts?: { parentSessionPath?: string; parentActiveKey?: string; projectId?: string },
  ) => void;
  updateSubagentTab: (identifier: string, view: SubagentView) => void;
  openSessionTab: (sessionPath: string, projectId: string, title?: string) => Promise<void>;
  newSessionTab: (projectId: string) => Promise<void>;
  /** Open (or focus) the singleton Skills & Agents library tab. */
  openLibraryTab: () => void;
  openModuleTab: (spec: OpenTabSpec) => string;
  ensureTabTranscriptLoaded: (tabId: string) => Promise<void>;
  reorderTabs: (fromIndex: number, toIndex: number) => void;
  switchTab: (tabId: string) => Promise<void>;
  closeTab: (tabId: string, nextActiveTabId?: string) => Promise<void>;
  setPromptText: (text: string) => void;
  sendPrompt: (streamingBehavior?: "steer" | "followUp") => Promise<void>;
  abort: () => Promise<void>;
  /**
   * Cursor-style "edit / retry": rewind the conversation to just before a user message.
   * `edit` puts its text (and images) back in the composer; `resend` runs it again immediately.
   */
  rewindToUserMessage: (entryId: string, mode: "edit" | "resend") => Promise<void>;
  setModel: (provider: string, modelId: string) => Promise<void>;
  setThinkingLevel: (level: string) => Promise<void>;
  setMode: (mode: AgentMode) => void;
  clearError: () => void;
  respondDialog: (response: RpcExtensionUIResponse) => Promise<void>;
  /** Answer (or cancel) the displayed tab's pending question form. */
  respondForm: (result: Omit<StudioFormResult, "kind">) => Promise<void>;
  /** Ask the runner to terminate a running or queued subagent. Failures surface via `error`. */
  stopSubagent: (target: { agentId?: string; type?: string; description?: string }) => Promise<void>;
  deleteSessionFile: (sessionPath: string) => Promise<void>;
  /** Delete a specific queued message from steering or follow-up queue. */
  deleteQueuedMessage: (type: "steering" | "followUp", index: number) => Promise<void>;
  /** Update the text of a specific queued message. */
  editQueuedMessage: (type: "steering" | "followUp", index: number, newText: string) => Promise<void>;
  /** Interrupt whatever is running and immediately prompt the LLM with this queued message ("Do now"). */
  runQueuedNow: (type: "steering" | "followUp", index: number) => Promise<void>;
  /** Steer a queued message for the next step without aborting the current step ("Next step"). */
  steerQueuedNext: (type: "steering" | "followUp", index: number) => Promise<void>;
  /** Steer/run a queued message immediately ("Do now"). Alias to runQueuedNow. */
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
    displayedTabId: nextTabId,
  };
  if (prev === nextTabId) return config;
  const tabUi = { ...s.tabUi };
  if (prev && s.tabs.some((t) => t.id === prev)) {
    tabUi[prev] = {
      promptText: s.promptText,
      attachments: s.attachments,
      pendingUiDialog: s.pendingUiDialog,
      pendingForm: s.pendingForm,
      extensionWidgets: s.extensionWidgets,
      extensionStatus: s.extensionStatus,
    };
  }
  const next = tabUi[nextTabId] ?? EMPTY_TAB_UI;
  delete tabUi[nextTabId];
  // Keep the outgoing session's live transcript so another pane can keep showing it.
  const transcriptsByTab =
    prev && s.tabs.some((t) => t.id === prev) ? { ...s.transcriptsByTab, [prev]: s.transcript } : s.transcriptsByTab;
  return { ...config, tabUi, transcriptsByTab, ...next };
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

/** Whether the main assistant thread is currently running for a tab. */
const mainThreadRunning = new Map<string, boolean>();

/** Subagent IDs currently running in the background for a tab. */
const runningSubagents = new Map<string, Set<string>>();

/** Subagent running count reported by the studio bridge for a tab. */
const bridgeSubagentsRunning = new Map<string, number>();

function hasRunningWork(tabId: string): boolean {
  if (mainThreadRunning.get(tabId)) return true;
  const subagents = runningSubagents.get(tabId);
  if (subagents && subagents.size > 0) return true;
  const bridgeCount = bridgeSubagentsRunning.get(tabId);
  if (bridgeCount !== undefined && bridgeCount > 0) return true;
  return false;
}

/** The tab that owns live session `key`, if any (events for closed/dropped keys are ignored). */
function tabIdForKey(key: string): string | undefined {
  const s = useSessionStore.getState();
  if (key === s.activeKey && displayedSessionTabId) return displayedSessionTabId;
  return s.tabs.find((t) => t.activeKey === key)?.id;
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
  mainThreadRunning.delete(tabId);
  runningSubagents.delete(tabId);
  bridgeSubagentsRunning.delete(tabId);
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
      mainThreadRunning.set(tabId, true);
      setActivity(tabId, "running");
    } else if (ev.type === "message_end") {
      const msg = ev.message as {
        role?: string;
        stopReason?: string;
        customType?: string;
        details?: { id?: string; status?: string; error?: string; others?: Array<{ id?: string; status?: string; error?: string }> };
      } | undefined;
      if (msg?.role === "assistant" && msg.stopReason === "error") {
        runErrored.add(tabId);
      } else if (msg?.role === "custom" && msg.customType === "subagent-notification") {
        const d = msg.details;
        const removeSub = (id?: string, status?: string, error?: string) => {
          if (!id) return;
          runningSubagents.get(tabId)?.delete(id);
          if (status === "error" || error) runErrored.add(tabId);
        };
        if (d) {
          removeSub(d.id, d.status, d.error);
          if (Array.isArray(d.others)) {
            for (const o of d.others) removeSub(o.id, o.status, o.error);
          }
        }
        if (!hasRunningWork(tabId)) {
          const errored = runErrored.has(tabId);
          runErrored.delete(tabId);
          setActivity(tabId, isTabInView(tabId) ? null : errored ? "error" : "done");
        }
      }
    } else if (ev.type === "entry_appended") {
      const entry = ev.entry as {
        type?: string;
        customType?: string;
        details?: { id?: string; status?: string; error?: string; others?: Array<{ id?: string; status?: string; error?: string }> };
      } | undefined;
      if (entry?.type === "custom_message" && entry.customType === "subagent-notification") {
        const d = entry.details;
        const removeSub = (id?: string, status?: string, error?: string) => {
          if (!id) return;
          runningSubagents.get(tabId)?.delete(id);
          if (status === "error" || error) runErrored.add(tabId);
        };
        if (d) {
          removeSub(d.id, d.status, d.error);
          if (Array.isArray(d.others)) {
            for (const o of d.others) removeSub(o.id, o.status, o.error);
          }
        }
        if (!hasRunningWork(tabId)) {
          const errored = runErrored.has(tabId);
          runErrored.delete(tabId);
          setActivity(tabId, isTabInView(tabId) ? null : errored ? "error" : "done");
        }
      }
    } else if (ev.type === "tool_execution_end") {
      const toolName = String(ev.toolName ?? "");
      if (toolName === "Agent" || toolName === "SubagentWorkflow") {
        const res = ev.result as {
          text?: string;
          details?: Record<string, unknown>;
          content?: Array<{ text?: string }>;
        } | undefined;
        const details = res?.details;
        const text = res?.text ?? (Array.isArray(res?.content) ? res.content.map((c) => c.text ?? "").join("\n") : "");
        const parsed = parseAgentResultText(text);
        const agentId = (typeof details?.agentId === "string" ? details.agentId : undefined) ||
          (typeof details?.taskId === "string" ? details.taskId : undefined) ||
          parsed.agentId;
        const isBg = toolName === "SubagentWorkflow" ||
          details?.status === "background" ||
          /in background/i.test(text);
        if (agentId && isBg) {
          let set = runningSubagents.get(tabId);
          if (!set) {
            set = new Set();
            runningSubagents.set(tabId, set);
          }
          set.add(agentId);
          setActivity(tabId, "running");
        }
      }
    } else if (ev.type === "agent_settled") {
      mainThreadRunning.set(tabId, false);
      if (hasRunningWork(tabId)) {
        // Subagent(s) are still actively executing in background; maintain running state!
        setActivity(tabId, "running");
      } else {
        const errored = runErrored.has(tabId);
        runErrored.delete(tabId);
        setActivity(tabId, isTabInView(tabId) ? null : errored ? "error" : "done");
      }
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
  // A session that died mid-reload must not stay locked behind a spinner.
  if (useSessionStore.getState().reloadStates[key]) setReloadState(key, null);
  const tabId = tabIdForKey(key);
  if (tabId) {
    const wasRunning = useSessionStore.getState().sessionActivity[tabId] === "running" || hasRunningWork(tabId);
    runErrored.delete(tabId);
    mainThreadRunning.delete(tabId);
    runningSubagents.delete(tabId);
    bridgeSubagentsRunning.delete(tabId);
    if (wasRunning) setActivity(tabId, crashed && !isTabInView(tabId) ? "error" : null);
    // Nobody is left to answer a pending dialog/form; leaving it open would block the whole window.
    updateTabUi(tabId, () => ({ pendingUiDialog: null, pendingForm: null }));
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

/**
 * Pi reports `contextUsage.tokens: null` after a compaction until the next model response, which would
 * blank the context widgets. Remember the size Pi estimated for the compacted context (per session key)
 * and fill it in until Pi has a real number again.
 */
const postCompactionTokens = new Map<string, number>();

export interface CompactionOutcome {
  /** Context size before compacting. */
  tokensBefore: number;
  /** Estimated context size after compacting (null when unknown). */
  tokensAfter: number | null;
}

/** Reads Pi's compaction result (`compact` RPC response / `compaction_end.result`). */
export function readCompactionOutcome(result: unknown): CompactionOutcome | null {
  const r = result as { tokensBefore?: unknown; estimatedTokensAfter?: unknown } | null | undefined;
  if (!r || typeof r !== "object" || typeof r.tokensBefore !== "number") return null;
  return {
    tokensBefore: r.tokensBefore,
    tokensAfter: typeof r.estimatedTokensAfter === "number" ? r.estimatedTokensAfter : null,
  };
}

export function withCompactionEstimate(key: string, stats: SessionStats): SessionStats {
  const usage = stats.contextUsage;
  if (!usage) return stats;
  if (usage.tokens != null) {
    postCompactionTokens.delete(key);
    return stats;
  }
  const estimate = postCompactionTokens.get(key);
  if (estimate === undefined) return stats;
  const percent = usage.contextWindow > 0 ? (estimate / usage.contextWindow) * 100 : null;
  return { ...stats, contextUsage: { ...usage, tokens: estimate, percent } };
}

/** Test hook: forget remembered post-compaction sizes. */
export const __resetCompactionEstimates = () => postCompactionTokens.clear();

/** Fetch context/token stats for `key`; ignored if the user has switched sessions meanwhile. */
async function refreshStats(key: string): Promise<void> {
  const res = await window.studio.rpc(key, { type: "get_session_stats" });
  if (res.ok && useSessionStore.getState().activeKey === key) {
    useSessionStore.setState({ stats: withCompactionEstimate(key, res.data as SessionStats) });
  }
}

/**
 * Bring the UI in line with a finished compaction (manual, auto, or the cache bar's): remember the new
 * context size, update the context widgets right away, reload the transcript (live sessions never receive
 * the compaction entry, so the breakdown would still count the old turns) and re-fetch Pi's stats.
 * Safe to call more than once for the same compaction. Returns what was compacted (for display).
 */
export async function applyCompactionResult(
  key: string,
  result: unknown,
  fallbackTokensAfter?: number,
): Promise<CompactionOutcome | null> {
  const outcome = readCompactionOutcome(result);
  if (!outcome) return null;
  const tokensAfter = outcome.tokensAfter ?? fallbackTokensAfter ?? null;
  if (tokensAfter !== null) postCompactionTokens.set(key, tokensAfter);
  const get = useSessionStore.getState;
  if (get().activeKey === key) {
    const stats = get().stats;
    if (stats?.contextUsage && tokensAfter !== null) {
      const { contextWindow } = stats.contextUsage;
      const percent = contextWindow > 0 ? (tokensAfter / contextWindow) * 100 : null;
      useSessionStore.setState({ stats: { ...stats, contextUsage: { ...stats.contextUsage, tokens: tokensAfter, percent } } });
    }
    const sessionPath = get().tabs.find((t) => t.activeKey === key)?.sessionPath;
    if (sessionPath) {
      try {
        const { entries, leafId } = await window.studio.readSessionFile(sessionPath);
        useSessionStore.setState((s) =>
          s.activeKey === key ? { transcript: applyEntries(s.transcript, entries, leafId, "replace") } : {},
        );
      } catch (err) {
        console.error("Failed to reload session after compaction", err);
      }
    }
    await refreshStats(key).catch(() => {});
  }
  return { tokensBefore: outcome.tokensBefore, tokensAfter };
}

/** Re-read the models Pi can use (extensions may add or remove providers) and merge them into the store. */
async function refreshModels(key: string): Promise<void> {
  const res = await window.studio.rpc(key, { type: "get_available_models" });
  if (!res.ok || useSessionStore.getState().activeKey !== key) return;
  const models = (res.data as { models: Array<Model<any>> }).models;
  useSessionStore.setState((s) => {
    const existing = new Set(s.allCatalogModels.map((m) => `${m.provider}/${m.id}`));
    const additions = models.filter((m) => !existing.has(`${m.provider}/${m.id}`));
    return { models, ...(additions.length ? { allCatalogModels: [...s.allCatalogModels, ...additions] } : {}) };
  });
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
  transcriptsByTab: {},
  displayedTabId: null,
  models: [],
  allCatalogModels: [],
  enabledModelKeys: [],
  defaultModel: undefined,
  defaultProvider: undefined,
  selectedModel: null,
  thinkingLevels: [],
  selectedThinkingLevel: "medium",
  selectedMode: "auto-edit",
  stats: null,
  sessionActivity: {},
  tabUi: {},
  subagentModal: null,
  extensionWidgets: {},
  extensionStatus: {},
  pendingUiDialog: null,
  pendingForm: null,
  promptText: "",
  attachments: [],
  isLoadingModels: false,
  reloadStates: {},
  reloadEpoch: 0,
  isInitializing: true,
  error: null,
  clearError: () => set({ error: null }),

  reloadPi: async () => {
    const { activeKey, transcript } = get();
    const tabId = activeKey ? tabIdForKey(activeKey) : undefined;
    if (!activeKey || !tabId || get().reloadStates[activeKey]?.phase === "reloading") return;
    if (transcript.running || hasRunningWork(tabId)) return;
    const key = activeKey;
    setReloadState(key, { phase: "reloading", message: "Reloading extensions, skills and prompts…" });
    // Extensions that were removed never clear their own status/widgets; the new runtime re-sets what it still has.
    updateTabUi(tabId, () => ({ extensionStatus: {}, extensionWidgets: {} }));
    try {
      const before = await window.studio.getSessionRegistry(key).catch(() => null);
      const res = await window.studio.bridgeAction(key, { action: "reload" });
      if (!res.ok) {
        setReloadState(key, { phase: "error", message: res.error || "Could not reload Pi." });
        return;
      }
      // The new registry (tools, skills) has already arrived. Refresh everything else derived from it.
      await Promise.allSettled([refreshStats(key), refreshModels(key)]);
      const after = await window.studio.getSessionRegistry(key).catch(() => null);
      const summary = summarizeReload(before, after);
      set((s) => ({ reloadEpoch: s.reloadEpoch + 1 }));
      setReloadState(key, { phase: "success", message: summary.text, detail: summary.detail || undefined });
    } catch (err) {
      setReloadState(key, { phase: "error", message: err instanceof Error ? err.message : String(err) });
    }
  },
  dismissReload: (key) => {
    if (get().reloadStates[key]?.phase !== "reloading") setReloadState(key, null);
  },

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
        for (const ev of batch.events) {
          const done = ev as { type: string; aborted?: boolean; errorMessage?: string; result?: unknown };
          if (done.type === "compaction_end" && !done.aborted && !done.errorMessage && done.result) {
            void applyCompactionResult(batch.key, done.result);
          }
        }
        emitSessionEvents(batch.key, batch.key === get().activeKey, batch.events as Array<{ type: string }>);
        const bgTabId = tabIdForKey(batch.key);
        if (batch.key !== get().activeKey) {
          // A background tab finishing a turn may have just created / updated its session file.
          if (batch.events.some((e) => e.type === "agent_settled")) void get().refreshCatalog();
          if (bgTabId) {
            const cached = get().transcriptsByTab[bgTabId];
            const hasFile = !!get().tabs.find((t) => t.id === bgTabId)?.sessionPath;
            if (!cached && hasFile) {
              // Don't cache an events-only transcript; load history from disk instead.
              void get().ensureTabTranscriptLoaded(bgTabId);
            } else {
              let bgT = cached ?? createTranscript();
              for (const ev of batch.events) bgT = applyEvent(bgT, ev);
              set((s) => ({ transcriptsByTab: { ...s.transcriptsByTab, [bgTabId]: bgT } }));
            }
          }
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
        const curTabId = displayedSessionTabId ?? get().activeTabId;
        set((s) => ({
          transcript: t,
          ...(curTabId ? { transcriptsByTab: { ...s.transcriptsByTab, [curTabId]: t } } : {}),
        }));
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

      // Question forms ride on the bridge's event bus (Pi's RPC UI protocol has no multi-question dialog).
      window.studio.onBridgeMessage(({ key, message }) => {
        if (message.type !== "event" || message.topic !== BRIDGE_TOPICS.toGui) return;
        const tabId = key === get().activeKey && displayedSessionTabId ? displayedSessionTabId : tabIdForKey(key);
        if (!tabId) return;
        if (isStudioFormRequest(message.data)) {
          const form = message.data;
          const st = useSessionStore.getState();
          const previous = (isDisplayed(tabId) ? st.pendingForm : st.tabUi[tabId]?.pendingForm) ?? null;
          // Tell the extension its form arrived (it falls back to plain dialogs if nobody acks).
          void window.studio.bridgeEmit(key, BRIDGE_TOPICS.fromGui, { kind: "form_ack", id: form.id }).catch(() => {});
          // A newer form replaces an unanswered one: release the older request instead of leaving it hanging.
          if (previous && previous.id !== form.id) {
            void window.studio
              .bridgeEmit(key, BRIDGE_TOPICS.fromGui, { kind: "form_result", id: previous.id, cancelled: true, answers: [] })
              .catch(() => {});
          }
          updateTabUi(tabId, () => ({ pendingForm: form }));
        } else if (isStudioFormCancel(message.data)) {
          const { id } = message.data;
          updateTabUi(tabId, (s) => (s.pendingForm?.id === id ? { pendingForm: null } : {}));
        } else if (isStudioSubagentStopResult(message.data) && !message.data.ok) {
          useSessionStore.setState({ error: `Could not stop subagent: ${message.data.error ?? "unknown error"}` });
        } else if (isStudioSubagentActivity(message.data)) {
          const { runningCount, hasRunning } = message.data;
          bridgeSubagentsRunning.set(tabId, runningCount);
          if (hasRunning) {
            setActivity(tabId, "running");
          } else if (!hasRunningWork(tabId)) {
            const errored = runErrored.has(tabId);
            runErrored.delete(tabId);
            setActivity(tabId, isTabInView(tabId) ? null : errored ? "error" : "done");
          }
        }
      });

      // Links clicked anywhere (incl. webview popups) are routed by core; a module may claim them.
      window.studio.onOpenLink(({ url, title }) => openLink(url, title));

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
          defaultModel: catalog.defaultModel,
          defaultProvider: catalog.defaultProvider,
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

  openSubagentModal: (target) => set({ subagentModal: target }),
  closeSubagentModal: () => set({ subagentModal: null }),

  openSubagentTab: (view, opts) => {
    const { tabs, activeProject, activeKey, activeTabId } = get();
    const activeTab = tabs.find((t) => t.id === activeTabId);
    const identifier = view.toolCallId || view.agentId || `sub_${Date.now()}`;
    const tabId = `subagent:${identifier}`;
    const existing = tabs.find(
      (t) =>
        t.id === tabId ||
        (view.agentId && t.subagentAgentId === view.agentId) ||
        (view.toolCallId && t.subagentToolCallId === view.toolCallId),
    );

    const parentSessionPath =
      opts?.parentSessionPath ??
      (activeTab?.kind === "session" ? activeTab?.sessionPath : activeTab?.parentSessionPath);
    const parentActiveKey =
      opts?.parentActiveKey ??
      (activeTab?.kind === "session" ? activeTab?.activeKey : activeTab?.parentActiveKey) ??
      activeKey ??
      undefined;
    const projectId = opts?.projectId ?? activeTab?.projectId ?? activeProject?.id ?? "";

    if (existing) {
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === existing.id
            ? {
                ...t,
                subagentView: view,
                title: `${view.type}: ${view.description || "Subagent"}`,
                subagentToolCallId: view.toolCallId || t.subagentToolCallId,
                subagentAgentId: view.agentId || t.subagentAgentId,
              }
            : t,
        ),
        activeTabId: existing.id,
      }));
      return;
    }

    const newTab: TabItem = {
      id: tabId,
      kind: "subagent",
      projectId,
      title: `${view.type}: ${view.description || "Subagent"}`,
      pinned: false,
      subagentToolCallId: view.toolCallId,
      subagentAgentId: view.agentId,
      subagentView: view,
      parentSessionPath,
      parentActiveKey,
    };

    set({ tabs: [...tabs, newTab], activeTabId: tabId });
  },

  updateSubagentTab: (identifier, view) => {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.kind === "subagent" &&
        (t.id === `subagent:${identifier}` ||
          t.subagentAgentId === identifier ||
          t.subagentToolCallId === identifier)
          ? {
              ...t,
              subagentView: { ...t.subagentView, ...view },
              title: `${view.type || t.subagentView?.type || "subagent"}: ${
                view.description || t.subagentView?.description || "Subagent"
              }`,
            }
          : t,
      ),
    }));
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
      const t = applyEntries(createTranscript(), entries, leafId, "replace");
      set((s) => ({
        transcriptsByTab: { ...s.transcriptsByTab, [tabId]: t },
        ...(s.displayedTabId === tabId ? { transcript: t } : {}),
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

  openLibraryTab: () => {
    const { tabs } = get();
    if (!tabs.some((t) => t.id === LIBRARY_TAB_ID)) {
      const tab: TabItem = { id: LIBRARY_TAB_ID, kind: "library", projectId: "", title: "Skills & Agents", pinned: false };
      set({ tabs: [...tabs, tab] });
    }
    set({ activeTabId: LIBRARY_TAB_ID });
  },

  openModuleTab: (spec: OpenTabSpec) => {
    const { tabs, activeProject } = get();
    const asModuleTab = (t: TabItem) => ({
      id: t.id,
      kind: t.kind,
      title: t.title,
      projectId: t.projectId,
      filePath: t.filePath,
      url: t.url,
      favicon: t.favicon,
      isSleeping: t.isSleeping,
      lastActiveAt: t.lastActiveAt,
      data: t.data,
    });
    const existing = tabs.find((t) => {
      if (t.kind !== spec.kind) return false;
      if (spec.reuse) return spec.reuse(asModuleTab(t));
      if (spec.filePath) return t.filePath === spec.filePath;
      return !!spec.id && t.id === spec.id;
    });
    if (existing) {
      void get().switchTab(existing.id);
      return existing.id;
    }

    const tabId = spec.id ?? `${spec.kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const newTab: TabItem = {
      id: tabId,
      kind: spec.kind,
      projectId: spec.projectId ?? activeProject?.id ?? "",
      title: spec.title,
      filePath: spec.filePath,
      url: spec.url,
      isSleeping: spec.isSleeping ?? false,
      lastActiveAt: spec.lastActiveAt ?? Date.now(),
      data: spec.data,
      pinned: false,
    };
    const owner = spec.projectId ? get().projects.find((p) => p.id === spec.projectId) : undefined;
    set({ tabs: [...tabs, newTab], activeTabId: tabId, ...(owner ? { activeProject: owner } : {}) });
    return tabId;
  },

  ensureTabTranscriptLoaded: async (tabId: string) => {
    const tab = get().tabs.find((t) => t.id === tabId);
    if (!tab || !tab.sessionPath || get().transcriptsByTab[tabId]) return;
    try {
      const { entries, leafId } = await window.studio.readSessionFile(tab.sessionPath);
      const t = applyEntries(createTranscript(), entries, leafId, "replace");
      set((s) => ({
        transcriptsByTab: { ...s.transcriptsByTab, [tabId]: t },
      }));
    } catch (err) {
      console.error("Failed to load background tab transcript", err);
    }
  },

  reorderTabs: (fromIndex: number, toIndex: number) => {
    const tabs = [...get().tabs];
    if (fromIndex < 0 || fromIndex >= tabs.length || toIndex < 0 || toIndex >= tabs.length) return;
    const [moved] = tabs.splice(fromIndex, 1);
    if (!moved) return;
    tabs.splice(toIndex, 0, moved);
    set({ tabs });
  },

  switchTab: async (tabId: string) => {
    const currentTab = get().tabs.find((t) => t.id === get().activeTabId);
    // Stamp the tab being left so modules can reason about inactivity (e.g. the browser's RAM saver).
    if (currentTab && currentTab.lastActiveAt !== undefined) {
      set((s) => ({
        tabs: s.tabs.map((t) => (t.id === currentTab.id ? { ...t, lastActiveAt: Date.now() } : t)),
      }));
    }

    const tab = get().tabs.find((t) => t.id === tabId);
    if (!tab) return;
    // Module-contributed tab kinds are plain views; they follow their own project when they have one.
    if (tab.kind && !isCoreTabKind(tab.kind)) {
      const owner = tab.projectId ? get().projects.find((p) => p.id === tab.projectId) : undefined;
      set(owner ? { activeTabId: tabId, activeProject: owner } : { activeTabId: tabId });
      return;
    }
    // Subagent tabs are views; they must not tear down the live session's transcript.
    if (tab.kind === "subagent") {
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
      // A session that kept working in the background reflects running if its main thread was active
      // (hydrateSession then confirms with Pi's own isStreaming flag).
      transcript: { ...(get().transcriptsByTab[tabId] ?? createTranscript()), running: bgRunning && (mainThreadRunning.get(tabId) ?? false) },
      stats: null,
    });

    if (tab.sessionPath) {
      try {
        const { entries, leafId } = await window.studio.readSessionFile(tab.sessionPath);
        const base = get().transcriptsByTab[tabId] ?? createTranscript();
        const t = applyEntries(base, entries, leafId, "replace");
        set((s) => ({
          transcriptsByTab: { ...s.transcriptsByTab, [tabId]: t },
          ...(s.displayedTabId === tabId ? { transcript: t } : {}),
        }));
      } catch (err) {
        console.error("Failed to read session file", err);
      }
    }

    if (tab.kind === "session" || !tab.kind) {
      void get().ensureActiveSession(tabId);
    }
  },

  closeTab: async (tabId: string, nextActiveTabId?: string) => {
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
      const transcriptsByTab = { ...s.transcriptsByTab };
      delete transcriptsByTab[tabId];
      return { tabs: remaining, tabUi, transcriptsByTab };
    });
    if (displayedSessionTabId === tabId) {
      displayedSessionTabId = null;
      set({ displayedTabId: null });
    }

    if (activeTabId === tabId && remaining.length > 0) {
      const nextTab = remaining.find((t) => t.id === nextActiveTabId) ?? remaining[remaining.length - 1]!;
      await get().switchTab(nextTab.id);
    } else if (remaining.length === 0) {
      set({ activeTabId: null, activeProject: null, activeKey: null, transcript: createTranscript(), ...EMPTY_TAB_UI });
    }
  },

  setPromptText: (text: string) => set({ promptText: text }),

  sendPrompt: async (streamingBehavior) => {
    let { activeKey, promptText, transcript, attachments } = get();
    if (!promptText.trim() && attachments.length === 0) return;
    // Pi is swapping its extension runtime; a prompt now would hit a half-loaded session.
    if (activeKey && get().reloadStates[activeKey]?.phase === "reloading") return;

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
    } else if (selectedMode === "ask") {
      message = `[Mode: Ask - Answer questions, explain concepts, and analyze code. Do not edit files or execute destructive actions.]\n\n${message}`;
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

  rewindToUserMessage: async (entryId, mode) => {
    const { activeKey, transcript } = get();
    if (!activeKey) return;
    const entry = transcript.byId[entryId];
    if (!entry || entry.type !== "message") return;
    const msg = entry.message as unknown as { role?: string; content?: unknown };
    if (msg.role !== "user") return;

    const parts =
      typeof msg.content === "string"
        ? [{ type: "text", text: msg.content } as Record<string, unknown>]
        : Array.isArray(msg.content)
          ? (msg.content as Array<Record<string, unknown>>)
          : [];
    // Drop the "[Mode: …]" steering prefix that sendPrompt adds; the composer re-applies the current mode.
    const text = parts
      .filter((p) => p.type === "text")
      .map((p) => String(p.text ?? ""))
      .join("\n")
      .replace(/^\[Mode: [^\]]*\]\n\n/, "");
    const images: AttachedItem[] = parts
      .filter((p) => p.type === "image" && typeof p.data === "string")
      .map((p, i) => {
        const mimeType = String(p.mimeType ?? "image/png");
        return {
          id: `rewind-${entryId}-${i}`,
          name: `image-${i + 1}`,
          kind: "image" as const,
          mimeType,
          dataBase64: p.data as string,
          previewUrl: `data:${mimeType};base64,${p.data as string}`,
        };
      });

    if (transcript.running) await get().abort();

    const res = await window.studio.bridgeAction(activeKey, { action: "navigate_tree", entryId });
    if (!res.ok) {
      set({ error: res.error || "Could not rewind the conversation." });
      return;
    }
    // Pi moved its leaf to the parent of this message; mirror that so the view (and appends) follow.
    set((s) => ({
      transcript: applyEntries(s.transcript, [], entry.parentId ?? null, "append"),
      promptText: text,
      attachments: images,
    }));
    if (mode === "resend") await get().sendPrompt();
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
    const tabId = displayedSessionTabId ?? get().activeTabId;
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

  respondForm: async (result) => {
    const { activeKey, pendingForm } = get();
    if (!pendingForm) return;
    set({ pendingForm: null });
    if (!activeKey) return; // session already gone: just close the form
    try {
      await window.studio.bridgeEmit(activeKey, BRIDGE_TOPICS.fromGui, { kind: "form_result", ...result });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  stopSubagent: async (target) => {
    const { activeKey } = get();
    if (!activeKey) return;
    try {
      await window.studio.bridgeEmit(activeKey, BRIDGE_TOPICS.fromGui, {
        kind: "subagent_stop",
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        ...target,
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
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

  runQueuedNow: async (type: "steering" | "followUp", index: number) => {
    const { activeKey, transcript } = get();
    if (!activeKey) return;

    const res = await window.studio.rpc(activeKey, { type: "clear_queue" });
    if (!res.ok) return;
    const current = (res.data ?? {}) as { steering?: string[]; followUp?: string[] };
    const steering = [...(current.steering ?? transcript.queue.steering ?? [])];
    const followUp = [...(current.followUp ?? transcript.queue.followUp ?? [])];

    let target: string | undefined;
    if (type === "steering") {
      if (index >= 0 && index < steering.length) {
        [target] = steering.splice(index, 1);
      }
    } else {
      if (index >= 0 && index < followUp.length) {
        [target] = followUp.splice(index, 1);
      }
    }
    if (!target) {
      const fallbackList = type === "steering" ? transcript.queue.steering : transcript.queue.followUp;
      target = fallbackList[index];
    }
    if (!target) return;

    if (transcript.running) {
      try {
        await window.studio.rpc(activeKey, { type: "abort" });
      } catch (err) {
        console.warn("Abort failed while running queued message now:", err);
      }
    }

    try {
      await window.studio.rpc(activeKey, { type: "prompt", message: target });
    } catch (err) {
      console.error("Prompt failed while running queued message now:", err);
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
        running: true,
        queue: {
          steering,
          followUp,
        },
      },
    }));
  },

  steerQueuedNext: async (type: "steering" | "followUp", index: number) => {
    const { activeKey, transcript } = get();
    if (!activeKey) return;

    if (!transcript.running) {
      return get().runQueuedNow(type, index);
    }

    const res = await window.studio.rpc(activeKey, { type: "clear_queue" });
    if (!res.ok) return;
    const current = (res.data ?? {}) as { steering?: string[]; followUp?: string[] };
    const steering = [...(current.steering ?? transcript.queue.steering ?? [])];
    const followUp = [...(current.followUp ?? transcript.queue.followUp ?? [])];

    let target: string | undefined;
    if (type === "steering") {
      if (index >= 0 && index < steering.length) {
        [target] = steering.splice(index, 1);
      }
    } else {
      if (index >= 0 && index < followUp.length) {
        [target] = followUp.splice(index, 1);
      }
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

  steerQueuedNow: async (type: "steering" | "followUp", index: number) => {
    return get().runQueuedNow(type, index);
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

export const __test = {
  trackActivity,
  hasRunningWork,
  setActivity,
  clearActivity,
  runErrored,
  mainThreadRunning,
  runningSubagents,
  bridgeSubagentsRunning,
};
