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
  type SessionWorktree,
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
import { emitSessionEvents, toolAwaitsUser } from "../modules/session-bus.ts";
import { usePaneLayoutStore, findLeafForTab } from "./pane-layout-store.ts";
import { findOriginProject, findOriginTab } from "../lib/tab-origin.ts";
import { openLink } from "../modules/link-bus.ts";
import type { OpenTabSpec } from "@hive/module-sdk/renderer";
import { playUiSound } from "./sound-store.ts";
import { toast } from "../modules/toast-store.ts";
import { NEW_SESSION_TITLE, pickTitleModel, sessionDisplayTitle, titleFromPrompt } from "../lib/session-title.ts";
import { clampThinkingLevel, getSupportedThinkingLevels } from "../lib/models/thinking.ts";
import { parseAgentResultText, type SubagentView } from "../lib/ai/subagents.ts";
import { getStoredItem, setStoredItem } from "../lib/storage.ts";
import { filterDisabledProviders, withProviderDisabled } from "../lib/provider-filter.ts";

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

/** Compaction progress and outcome state for a session. */
export interface CompactionState {
  phase: "compacting" | "done" | "error";
  saved?: number;
  before?: number;
  tokens?: number;
  toName?: string;
  message?: string;
}

const COMPACTION_DONE_MS = 5000;
const COMPACTION_ERROR_MS = 15000;
const compactionClearTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function setCompactionState(key: string, state: CompactionState | null): void {
  const timer = compactionClearTimers.get(key);
  if (timer) {
    clearTimeout(timer);
    compactionClearTimers.delete(key);
  }
  useSessionStore.setState((s) => {
    const next = { ...s.compactionStates };
    if (state) next[key] = state;
    else delete next[key];
    return { compactionStates: next };
  });
  if (state?.phase === "done") {
    compactionClearTimers.set(
      key,
      setTimeout(() => {
        compactionClearTimers.delete(key);
        if (useSessionStore.getState().compactionStates[key]?.phase === "done") {
          setCompactionState(key, null);
        }
      }, COMPACTION_DONE_MS),
    );
  } else if (state?.phase === "error") {
    compactionClearTimers.set(
      key,
      setTimeout(() => {
        compactionClearTimers.delete(key);
        if (useSessionStore.getState().compactionStates[key]?.phase === "error") {
          setCompactionState(key, null);
        }
      }, COMPACTION_ERROR_MS),
    );
  }
}

export const __resetCompactionStates = () => {
  compactionClearTimers.forEach(clearTimeout);
  compactionClearTimers.clear();
  useSessionStore.setState({ compactionStates: {} });
};

/** A prompt sent while compaction runs. Held client-side (shown as queued) and sent once compaction ends. */
export interface HeldMessage {
  /** Text shown in the queue list. */
  text: string;
  /** Full prompt text (attachments + mode prefix applied). */
  message: string;
  images: Array<{ type: "image"; data: string; mimeType: string }>;
}

/**
 * Hook run when the user sends a prompt. Return a promise to start a compaction (or similar) first: the prompt is held
 * (shown as queued) until it settles. Return nothing to let the prompt through. Only the first hook returning a promise runs
 * per send, so several "compact first" sources never compact twice.
 */
export type PreSendHook = (key: string) => Promise<unknown> | null | undefined | void;
const preSendHooks = new Set<PreSendHook>();

export function registerPreSendHook(hook: PreSendHook): () => void {
  preSendHooks.add(hook);
  return () => preSendHooks.delete(hook);
}

function runPreSendHooks(key: string): Promise<unknown> | null {
  for (const hook of [...preSendHooks]) {
    try {
      const pending = hook(key);
      if (pending) return Promise.resolve(pending).catch(() => {});
    } catch {
      // A broken hook must never block sending.
    }
  }
  return null;
}

/**
 * A hook can report "done" before the session store has applied the compaction result (Pi's compaction_end is handled
 * async). Wait for the shared compaction phase to leave "compacting" so the held prompt isn't sent into a stale transcript.
 */
function whenCompactionApplied(key: string, timeoutMs = 15_000): Promise<void> {
  const compacting = () => useSessionStore.getState().compactionStates[key]?.phase === "compacting";
  if (!compacting()) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      off();
      clearTimeout(timer);
      resolve();
    };
    const off = useSessionStore.subscribe(() => {
      if (!compacting()) done();
    });
    const timer = setTimeout(done, timeoutMs);
  });
}

/** Put an unsent prompt back in a tab's composer, after anything typed since (newline-separated). */
function restoreDraft(tabId: string, text: string, attachments: AttachedItem[]): void {
  if (!useSessionStore.getState().tabs.some((t) => t.id === tabId)) return;
  updateTabUi(tabId, (ui) => ({
    promptText: ui.promptText.trim() && text ? `${ui.promptText}\n${text}` : ui.promptText || text,
    attachments: attachments.length > 0 ? [...ui.attachments, ...attachments] : ui.attachments,
  }));
}

/** Send everything held for `key` as one prompt now that compaction is over. */
export async function flushHeldMessages(key: string): Promise<void> {
  const held = useSessionStore.getState().compactionHeld[key];
  if (!held || held.length === 0) return;
  useSessionStore.setState((s) => {
    const next = { ...s.compactionHeld };
    delete next[key];
    return { compactionHeld: next };
  });
  const message = held.map((h) => h.message).join("\n\n");
  const images = held.flatMap((h) => h.images);
  let failure: string | null = null;
  try {
    const res = await window.studio.rpc(key, { type: "prompt", message, ...(images.length > 0 ? { images } : {}) });
    if (!res?.ok) failure = res?.error || "Pi didn't accept the message.";
  } catch (err) {
    failure = err instanceof Error ? err.message : String(err);
  }
  if (failure !== null) {
    // Re-queue (ahead of anything held meanwhile) so the message isn't lost.
    useSessionStore.setState((s) => ({
      compactionHeld: { ...s.compactionHeld, [key]: [...held, ...(s.compactionHeld[key] ?? [])] },
      error: `Couldn't send your message: ${failure}`,
    }));
  }
}

export async function handleCompactionEvent(key: string, ev: unknown): Promise<void> {
  const e = ev as {
    type: string;
    reason?: string;
    aborted?: boolean;
    errorMessage?: string;
    result?: unknown;
  };
  if (e.type === "compaction_start") {
    const current = useSessionStore.getState().compactionStates[key];
    if (!current || current.phase !== "compacting") {
      const s = useSessionStore.getState();
      const model = s.tabs.find((t) => t.activeKey === key)?.model ?? s.selectedModel;
      const toName = model?.name || model?.id || "the model";
      setCompactionState(key, { phase: "compacting", toName });
    }
  } else if (e.type === "compaction_end") {
    if (e.errorMessage) {
      setCompactionState(key, { phase: "error", message: String(e.errorMessage) });
    } else if (!e.aborted && e.result) {
      const outcome = await applyCompactionResult(key, e.result);
      if (outcome) {
        const s = useSessionStore.getState();
        const model = s.tabs.find((t) => t.activeKey === key)?.model ?? s.selectedModel;
        const toName = model?.name || model?.id || "the model";
        setCompactionState(key, {
          phase: "done",
          before: outcome.tokensBefore,
          tokens: outcome.tokensAfter ?? outcome.tokensBefore,
          toName,
        });
      }
    } else if (e.aborted) {
      setCompactionState(key, null);
    }
    await flushHeldMessages(key);
  }
}

export interface ExtensionWidgetState {
  lines: string[];
  placement: "aboveEditor" | "belowEditor";
}

export interface SessionStoreState {
  bootstrap: Bootstrap | null;
  projects: ProjectEntry[];
  /** True once the first project list has loaded (or init failed); gates the onboarding screen. */
  projectsLoaded: boolean;
  allSessions: SessionCatalogItem[];
  tabs: TabItem[];
  activeTabId: string | null;

  // Active session details
  activeKey: string | null;
  activeProject: ProjectEntry | null;
  openProjectIds: string[];
  openProjectTab: (projectId: string) => Promise<void>;
  closeProjectTab: (projectId: string) => Promise<void>;
  reorderProjectTabs: (fromIndex: number, toIndex: number) => void;
  closeOtherProjectTabs: (keepProjectId: string) => Promise<void>;
  closeProjectTabsToRight: (projectId: string) => Promise<void>;
  projectLastActiveTab: Record<string, string>;
  setActiveProject: (project: ProjectEntry) => Promise<void>;
  status: SessionStatusUpdate | null;
  transcript: TranscriptState;
  transcriptsByTab: Record<string, TranscriptState>;
  /** Session tab whose state occupies the top-level fields (transcript, composer...). Differs from activeTabId while a file/diff tab is focused. */
  displayedTabId: string | null;
  models: Array<Model<any>>;
  allCatalogModels: Array<Model<any>>;
  enabledModelKeys: string[];
  /** Providers switched off in Settings; their models are filtered out of every picker. */
  disabledProviders: string[];
  defaultModel?: string;
  defaultProvider?: string;
  selectedModel: Model<any> | null;
  thinkingLevels: string[];
  selectedThinkingLevel: string;
  selectedMode: AgentMode;
  /** New sessions run in the main tree instead of their own git worktree (opt-out; default off). */
  newSessionInMainTree: boolean;
  setNewSessionInMainTree: (value: boolean) => void;
  stats: SessionStats | null;
  /**
   * Per-tab (keyed by tab id) agent activity, tracked for every tab,
   * not just the active one. "done"/"error" mean the run finished while the user wasn't looking at it.
   */
  sessionActivity: Record<string, SessionActivity>;
  /** Tab ids with a running tool call that blocks on the user (e.g. a plan review). */
  sessionAwaitingUser: Record<string, true>;
  /** First prompt of a cold tab, shown with its startup step until Pi starts the run (keyed by tab id). */
  pendingStarts: Record<string, PendingStart>;
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
  /** Per live-session-key compaction state (compacting, done, error). */
  compactionStates: Record<string, CompactionState>;
  /** Messages sent while a session compacts, per live-session-key; shown as queued, sent when compaction ends. */
  compactionHeld: Record<string, HeldMessage[]>;
  /** Drop one held (compaction-queued) message of the active session (or target tab). */
  removeHeldMessage: (index: number, targetTabId?: string) => void;
  /** Move a held message back into the composer. */
  popHeldToEditor: (index: number, targetTabId?: string) => void;
  isInitializing: boolean;
  error: string | null;

  // Actions
  init: () => Promise<void>;
  /** Reload Pi's extensions, skills and prompts for the active session (the CLI's `/reload`) and refresh dependent views. */
  reloadPi: () => Promise<void>;
  /** Hide a finished (success/failed) reload strip for session `key`. */
  dismissReload: (key: string) => void;
  /** Manually compact session context, managing the shared compaction bar state. */
  compactSession: (
    key: string,
    options?: { fallbackTokensAfter?: number; saved?: number; toName?: string; before?: number },
  ) => Promise<CompactionOutcome | null>;
  /** Hide a finished (done/error) compaction strip for session `key`. */
  dismissCompaction: (key: string) => void;
  loadModelsCatalog: () => Promise<void>;
  saveEnabledModels: (keys: string[]) => Promise<void>;
  setProviderDisabled: (provider: string, disabled: boolean) => Promise<void>;
  ensureActiveSession: (targetTabId?: string, opts?: { title?: string }) => Promise<string | null>;
  renameWorktreeBranch: (tabId: string, newTitle: string) => Promise<void>;
  addAttachments: (items: AttachedItem[]) => void;
  removeAttachment: (id: string) => void;
  clearAttachments: () => void;
  refreshCatalog: () => Promise<void>;
  addProject: (dirPath: string, name?: string, color?: string, icon?: string | null) => Promise<ProjectEntry>;
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
  newSessionTab: (projectId: string, targetPaneId?: string) => Promise<void>;
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
  /** Clear the error and retry the last user message or prompt. */
  retryLastMessage: () => Promise<void>;
  setModel: (provider: string, modelId: string) => Promise<void>;
  setThinkingLevel: (level: string) => Promise<void>;
  setMode: (mode: AgentMode) => void;
  clearError: () => void;
  respondDialog: (response: RpcExtensionUIResponse) => Promise<void>;
  /** Answer a pending dialog of any tab, displayed or parked (e.g. an inactive split pane). */
  respondTabDialog: (tabId: string, response: RpcExtensionUIResponse) => Promise<void>;
  /** Answer (or cancel) the displayed tab's pending question form. */
  respondForm: (result: Omit<StudioFormResult, "kind">) => Promise<void>;
  /** Ask the runner to terminate a running or queued subagent. Failures surface via `error`. */
  stopSubagent: (target: { agentId?: string; type?: string; description?: string }) => Promise<boolean>;
  deleteSessionFile: (sessionPath: string) => Promise<void>;
  /** Delete a specific queued message from steering or follow-up queue. */
  deleteQueuedMessage: (type: "steering" | "followUp", index: number, targetTabId?: string) => Promise<void>;
  /** Update the text of a specific queued message. */
  editQueuedMessage: (type: "steering" | "followUp", index: number, newText: string, targetTabId?: string) => Promise<void>;
  /** Interrupt whatever is running and immediately prompt the LLM with this queued message ("Do now"). */
  runQueuedNow: (type: "steering" | "followUp", index: number, targetTabId?: string) => Promise<void>;
  /** Steer a queued message for the next step without aborting the current step ("Next step"). */
  steerQueuedNext: (type: "steering" | "followUp", index: number, targetTabId?: string) => Promise<void>;
  /** Steer/run a queued message immediately ("Do now"). Alias to runQueuedNow. */
  steerQueuedNow: (type: "steering" | "followUp", index: number, targetTabId?: string) => Promise<void>;
  /** Clear all queued messages for the active session (or target tab). */
  clearAllQueued: (targetTabId?: string) => Promise<void>;
  /** Remove a queued message and put its text back into the composer editor. */
  popQueuedToEditor: (type: "steering" | "followUp", index: number, targetTabId?: string) => Promise<void>;
  /** Set (or clear, with "") the user-facing title of a session. */
  renameSession: (sessionPath: string, title: string) => Promise<void>;
  /** Hide / unhide a session in the sidebar without touching its file. */
  setSessionArchived: (sessionPath: string, archived: boolean) => Promise<void>;
}

let initStarted = false;
const startingSessions = new Map<string, Promise<string | null>>();

/** Startup step of a cold tab's first prompt: host steps (worktree/spawn), then model hydration, then the prompt RPC. */
export type PendingStartStep = "starting" | "worktree" | "spawn" | "model" | "sending";
export interface PendingStart {
  text: string;
  attachmentNames: string[];
  step: PendingStartStep;
}

const pendingStartTimers = new Map<string, ReturnType<typeof setTimeout>>();
/** Safety net: Pi may never start a run for a prompt (e.g. an extension command), so drop the indicator eventually. */
const PENDING_START_TIMEOUT_MS = 30_000;

function setPendingStartStep(tabId: string, step: PendingStartStep): void {
  useSessionStore.setState((s) => {
    const cur = s.pendingStarts[tabId];
    return cur && cur.step !== step ? { pendingStarts: { ...s.pendingStarts, [tabId]: { ...cur, step } } } : {};
  });
}

function clearPendingStart(tabId: string): void {
  const timer = pendingStartTimers.get(tabId);
  if (timer) clearTimeout(timer);
  pendingStartTimers.delete(tabId);
  useSessionStore.setState((s) => {
    if (!s.pendingStarts[tabId]) return {};
    const { [tabId]: _, ...rest } = s.pendingStarts;
    return { pendingStarts: rest };
  });
}

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

/** Subagent ids reported running by the studio bridge for a tab (for Stop). */
const bridgeSubagentIds = new Map<string, string[]>();

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

/** Running tool calls per tab that wait on the user (module cards with `awaitsUser`). */
const awaitingUserCalls = new Map<string, Set<string>>();

function syncAwaitingUser(tabId: string): void {
  const waiting = (awaitingUserCalls.get(tabId)?.size ?? 0) > 0;
  useSessionStore.setState((s) => {
    if (!!s.sessionAwaitingUser[tabId] === waiting) return {};
    const next = { ...s.sessionAwaitingUser };
    if (waiting) next[tabId] = true;
    else delete next[tabId];
    return { sessionAwaitingUser: next };
  });
}

function setAwaitingUserCall(tabId: string, callId: string, waiting: boolean): void {
  let set = awaitingUserCalls.get(tabId);
  if (waiting) {
    if (!set) awaitingUserCalls.set(tabId, (set = new Set()));
    if (set.has(callId)) return;
    set.add(callId);
  } else if (!set?.delete(callId)) return;
  syncAwaitingUser(tabId);
}

function clearAwaitingUser(tabId: string): void {
  if (awaitingUserCalls.delete(tabId)) syncAwaitingUser(tabId);
}

/** True when the transcript has a running tool call that blocks on the user (covers tabs reopened mid-wait). */
export function transcriptAwaitsUser(t: TranscriptState): boolean {
  if (!t.running) return false;
  return Object.values(t.tools).some((r) => r.status === "running" && toolAwaitsUser(r.toolName, r.args));
}

function clearActivity(tabId: string): void {
  clearAwaitingUser(tabId);
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
      clearPendingStart(tabId);
      if (ev.type === "agent_start") runErrored.delete(tabId);
      const wasRunning = mainThreadRunning.get(tabId) ?? false;
      mainThreadRunning.set(tabId, true);
      setActivity(tabId, "running");
      if (!wasRunning && isTabInView(tabId)) playUiSound("agent_start");
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
          if (isTabInView(tabId)) {
            playUiSound(d.status === "error" || d.error ? "agent_error" : "subagent_done");
          }
        }
        if (!hasRunningWork(tabId)) {
          const errored = runErrored.has(tabId);
          runErrored.delete(tabId);
          setActivity(tabId, isTabInView(tabId) ? null : errored ? "error" : "done");
        }
      }
    } else if (ev.type === "tool_execution_start") {
      if (toolAwaitsUser(String(ev.toolName ?? ""), ev.args)) {
        setAwaitingUserCall(tabId, String(ev.toolCallId), true);
        // The visible plan card announces itself; ping only when the question lands in a background tab.
        if (useSessionStore.getState().activeTabId !== tabId) playUiSound("question_asked");
      }
      if (isTabInView(tabId)) playUiSound("tool_start");
    } else if (ev.type === "tool_execution_end") {
      setAwaitingUserCall(tabId, String(ev.toolCallId), false);
      const isToolErr = Boolean((ev as { isError?: boolean }).isError);
      if (isTabInView(tabId)) playUiSound(isToolErr ? "tool_error" : "tool_end");
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
        if (agentId && isBg && !/completed|done|failed|finished/i.test(text)) {
          let set = runningSubagents.get(tabId);
          if (!set) {
            set = new Set();
            runningSubagents.set(tabId, set);
          }
          set.add(agentId);
          setActivity(tabId, "running");
          playUiSound("subagent_spawn");
        } else if (agentId && (/completed|done|failed|finished/i.test(text) || details?.status === "completed")) {
          runningSubagents.get(tabId)?.delete(agentId);
        }
      }
    } else if (ev.type === "agent_settled") {
      clearAwaitingUser(tabId);
      mainThreadRunning.set(tabId, false);
      if (hasRunningWork(tabId)) {
        // Subagent(s) are still actively executing in background; maintain running state!
        setActivity(tabId, "running");
      } else {
        const errored = runErrored.has(tabId);
        runErrored.delete(tabId);
        setActivity(tabId, isTabInView(tabId) ? null : errored ? "error" : "done");
        playUiSound(errored ? "agent_error" : "agent_settled");
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
    clearAwaitingUser(tabId);
    const wasRunning = useSessionStore.getState().sessionActivity[tabId] === "running" || hasRunningWork(tabId);
    runErrored.delete(tabId);
    mainThreadRunning.delete(tabId);
    runningSubagents.delete(tabId);
    bridgeSubagentsRunning.delete(tabId);
    if (wasRunning) setActivity(tabId, crashed && !isTabInView(tabId) ? "error" : null);
    // Nobody is left to answer a pending dialog/form; leaving it open would block the whole window.
    updateTabUi(tabId, () => ({ pendingUiDialog: null, pendingForm: null }));
  }
  useSessionStore.setState((s) => {
    // A dead process can't finish its run: don't leave "Working..." + Stop on the displayed/cached transcript.
    const settle = (t: TranscriptState): TranscriptState => (t.running || t.streaming ? { ...t, running: false, streaming: null } : t);
    const cached = tabId ? s.transcriptsByTab[tabId] : undefined;
    return {
      ...(s.activeKey === key || (tabId && isDisplayed(tabId)) ? { transcript: settle(s.transcript) } : {}),
      ...(tabId && cached ? { transcriptsByTab: { ...s.transcriptsByTab, [tabId]: settle(cached) } } : {}),
    };
  });
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

const hydratedSessionKeys = new Set<string>();

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
  const alreadyHydrated = hydratedSessionKeys.has(key);
  if (isDisplayed(tabId) && !alreadyHydrated) set({ isLoadingModels: true });
  try {
    const statePromise = rpc(key, { type: "get_state" });
    const modelsPromise = alreadyHydrated && get().models.length > 0
      ? Promise.resolve({ ok: true as const, data: { models: get().models } })
      : rpc(key, { type: "get_available_models" });
    const [stateRes, modelsRes] = await Promise.all([statePromise, modelsPromise]);
    const models = modelsRes.ok ? (modelsRes.data as { models: Array<Model<any>> }).models : null;
    if (models && !alreadyHydrated) {
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
      // A new session shouldn't land on a provider the user switched off (unless nothing else exists).
      const allowed = filterDisabledProviders(models, get().disabledProviders);
      const pool = allowed.length > 0 ? allowed : models;
      const match = enabled.length
        ? pool.find((m) => enabled.includes(`${m.provider}/${m.id}`) || (!m.id.includes("/") && enabled.includes(m.id)))
        : null;
      model = match ?? pool[0] ?? null;
    }
    if (model) {
      patchTab({ model });
      if (isDisplayed(tabId)) set({ selectedModel: model });
    }

    // Thinking: levels depend on the (possibly just changed) model, so fetch them afterwards.
    const levels = alreadyHydrated
      ? getSupportedThinkingLevels(model)
      : await rpc(key, { type: "get_available_thinking_levels" }).then((r) =>
          r.ok ? (r.data as { levels: string[] }).levels ?? getSupportedThinkingLevels(model) : getSupportedThinkingLevels(model),
        );
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
    hydratedSessionKeys.add(key);
  } catch (err) {
    console.error("Failed to query session state", err);
  } finally {
    if (isDisplayed(tabId) && !alreadyHydrated) set({ isLoadingModels: false });
  }
}
export const LIBRARY_TAB_ID = "studio:library";

const MAIN_TREE_KEY = "hive.new-session.main-tree";
const OPEN_PROJECT_TABS_KEY = "hive.open-project-tabs.v1";

function loadPersistedOpenProjectIds(): string[] {
  try {
    const raw = getStoredItem(OPEN_PROJECT_TABS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function persistOpenProjectIds(ids: string[]) {
  try {
    setStoredItem(OPEN_PROJECT_TABS_KEY, JSON.stringify(ids));
  } catch {}
}

/** Worktree a session tab runs in: the tab's own (set when it starts), else the catalog's (resumed sessions). */
export function useSessionWorktree(tabId: string | null | undefined): SessionWorktree | undefined {
  return useSessionStore((s) => {
    const tab = tabId ? s.tabs.find((t) => t.id === tabId) : undefined;
    if (!tab || (tab.kind && tab.kind !== "session")) return undefined;
    return tab.worktree ?? (tab.sessionPath ? s.allSessions.find((x) => x.path === tab.sessionPath)?.worktree : undefined);
  });
}

export const useSessionStore = create<SessionStoreState>((set, get) => ({
  bootstrap: null,
  projects: [],
  projectsLoaded: false,
  allSessions: [],
  tabs: [],
  activeTabId: null,

  activeKey: null,
  activeProject: null,
  openProjectIds: typeof window !== "undefined" ? loadPersistedOpenProjectIds() : [],
  projectLastActiveTab: {},
  status: null,
  transcript: createTranscript(),
  transcriptsByTab: {},
  displayedTabId: null,
  models: [],
  allCatalogModels: [],
  enabledModelKeys: [],
  disabledProviders: [],
  defaultModel: undefined,
  defaultProvider: undefined,
  selectedModel: null,
  thinkingLevels: [],
  selectedThinkingLevel: "medium",
  selectedMode: "auto-edit",
  newSessionInMainTree: getStoredItem(MAIN_TREE_KEY) === "true",
  setNewSessionInMainTree: (value: boolean) => {
    setStoredItem(MAIN_TREE_KEY, String(value));
    set({ newSessionInMainTree: value });
  },
  stats: null,
  sessionActivity: {},
  sessionAwaitingUser: {},
  pendingStarts: {},
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
  compactionStates: {},
  compactionHeld: {},
  removeHeldMessage: (index, targetTabId) => {
    const s = get();
    const tab = targetTabId ? s.tabs.find((t) => t.id === targetTabId) : undefined;
    const key = tab?.activeKey ?? s.activeKey;
    if (!key) return;
    set((state) => {
      const list = [...(state.compactionHeld[key] ?? [])];
      list.splice(index, 1);
      const next = { ...state.compactionHeld };
      if (list.length) next[key] = list;
      else delete next[key];
      return { compactionHeld: next };
    });
  },
  popHeldToEditor: (index, targetTabId) => {
    const s = get();
    const tab = targetTabId ? s.tabs.find((t) => t.id === targetTabId) : undefined;
    const key = tab?.activeKey ?? s.activeKey;
    const item = key ? s.compactionHeld[key]?.[index] : undefined;
    if (!item) return;
    get().removeHeldMessage(index, targetTabId);
    if (!targetTabId || targetTabId === s.activeTabId || targetTabId === s.displayedTabId) {
      set({ promptText: s.promptText ? `${s.promptText}\n${item.text}` : item.text });
    } else {
      updateTabUi(targetTabId, (ui) => ({
        promptText: ui.promptText ? `${ui.promptText}\n${item.text}` : item.text,
      }));
    }
  },
  isInitializing: true,
  error: null,
  clearError: () => set({ error: null }),
  dismissCompaction: (key) => setCompactionState(key, null),

  compactSession: async (key, options) => {
    const s = get();
    if (!key || s.compactionStates[key]?.phase === "compacting" || s.transcript.running) return null;
    const model = s.tabs.find((t) => t.activeKey === key)?.model ?? s.selectedModel;
    const toName = options?.toName ?? (model?.name || model?.id || "the model");
    setCompactionState(key, {
      phase: "compacting",
      saved: options?.saved,
      before: options?.before,
      tokens: options?.fallbackTokensAfter,
      toName,
    });
    try {
      const res = await window.studio.rpc(key, { type: "compact" });
      if (!res.ok) {
        throw new Error(res.error || "Compaction failed");
      }
      const outcome = await applyCompactionResult(key, res.data, options?.fallbackTokensAfter);
      const stats = get().stats;
      const contextTokens = stats?.contextUsage?.tokens ?? get().transcript.lastUsage?.totalTokens ?? 0;
      const before = outcome?.tokensBefore ?? contextTokens;
      const tokens = outcome?.tokensAfter ?? options?.fallbackTokensAfter ?? before;
      setCompactionState(key, {
        phase: "done",
        before,
        tokens,
        toName,
      });
      return outcome;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setCompactionState(key, { phase: "error", message });
      throw err;
    } finally {
      await flushHeldMessages(key);
    }
  },

  reloadPi: async () => {
    const { activeKey, transcript } = get();
    const tabId = activeKey ? tabIdForKey(activeKey) : undefined;
    if (!activeKey || !tabId || get().reloadStates[activeKey]?.phase === "reloading") return;
    if (transcript.running || hasRunningWork(tabId)) return;
    const key = activeKey;
    hydratedSessionKeys.delete(key);
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
          void handleCompactionEvent(batch.key, ev);
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
          const tabId = tabIdForKey(status.key);
          if (tabId) clearPendingStart(tabId);
          dropSessionKey(status.key, status.phase === "crashed");
        }
      });

      // Startup steps of an in-flight startSession (startId = tab id).
      window.studio.onSessionStartProgress(({ startId, step }) => setPendingStartStep(startId, step));

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
          playUiSound("question_asked");
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
          if (!previous || previous.id !== form.id) playUiSound("question_asked");
          updateTabUi(tabId, () => ({ pendingForm: form }));
        } else if (isStudioFormCancel(message.data)) {
          const { id } = message.data;
          updateTabUi(tabId, (s) => (s.pendingForm?.id === id ? { pendingForm: null } : {}));
        } else if (isStudioSubagentStopResult(message.data) && !message.data.ok) {
          useSessionStore.setState({ error: `Could not stop subagent: ${message.data.error ?? "unknown error"}` });
        } else if (isStudioSubagentActivity(message.data)) {
          const { runningCount, hasRunning } = message.data;
          bridgeSubagentsRunning.set(tabId, runningCount);
          bridgeSubagentIds.set(tabId, (message.data.agents ?? []).map((a) => a.id));
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

      // Open last-used project (or first), or env HIVE_PROJECT
      const projects = get().projects;
      const lastId = await window.studio.getLastOpenedProjectId();
      const targetProject =
        (lastId ? projects.find((p) => p.id === lastId) : null) ??
        projects[0] ??
        (bootstrap.initialProjectPath ? await get().addProject(bootstrap.initialProjectPath) : null);

      if (targetProject) {
        const persisted = get().openProjectIds.filter((id) => projects.some((p) => p.id === id));
        const openProjectIds = persisted.length > 0
          ? (persisted.includes(targetProject.id) ? persisted : [...persisted, targetProject.id])
          : [targetProject.id];
        set({ activeProject: targetProject, openProjectIds });
        persistOpenProjectIds(openProjectIds);
        void window.studio.setLastOpenedProjectId(targetProject.id);
        if (get().tabs.length === 0) {
          await get().newSessionTab(targetProject.id);
        }
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err), isInitializing: false, projectsLoaded: true });
    }
  },

  ensureActiveSession: async (targetTabId?: string, opts?: { title?: string }): Promise<string | null> => {
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
        // Worktree options only matter for a brand-new session; a resume reuses the recorded worktree.
        const titleToUse = opts?.title ?? (tab.title && tab.title !== NEW_SESSION_TITLE ? tab.title : undefined);
        const newSessionOpts = tab.sessionPath
          ? {}
          : {
              useWorktree: !get().newSessionInMainTree,
              ...(titleToUse ? { title: titleToUse } : {}),
            };
        const res = await window.studio.startSession({ projectPath: project.path, sessionPath: tab.sessionPath, startId: tabId, ...newSessionOpts });
        // The tab was closed while Pi was starting: don't orphan the process.
        if (!get().tabs.some((t) => t.id === tabId)) {
          void window.studio.stopSession(res.key).catch(() => {});
          return null;
        }
        setPendingStartStep(tabId, "model");
        set((s) => ({
          // Only steal focus if the user is still on this tab.
          ...(isDisplayed(tabId) ? { activeKey: res.key } : {}),
          tabs: s.tabs.map((t) =>
            t.id === tabId ? { ...t, activeKey: res.key, isCold: false, ...(res.worktree ? { worktree: res.worktree } : {}) } : t,
          ),
          // A resumed session may have been given a fresh worktree (its old one was deleted): keep the catalog in sync.
          ...(res.worktree && tab.sessionPath
            ? {
                allSessions: s.allSessions.map((x) =>
                  x.path === tab.sessionPath && x.worktree?.worktreePath !== res.worktree!.worktreePath ? { ...x, worktree: res.worktree } : x,
                ),
              }
            : {}),
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
          disabledProviders: catalog.disabledProviders ?? [],
          defaultModel: catalog.defaultModel,
          defaultProvider: catalog.defaultProvider,
        });
        // If models list is currently empty, seed from catalog
        if (get().models.length === 0 && catalogModels.length > 0) {
          set({ models: catalogModels });
          if (!get().selectedModel) {
            const allowed = filterDisabledProviders(catalogModels, get().disabledProviders);
            const pool = allowed.length > 0 ? allowed : catalogModels;
            const match = enabledKeys.length > 0
              ? pool.find((m) => enabledKeys.includes(`${m.provider}/${m.id}`) || (!m.id.includes("/") && enabledKeys.includes(m.id)))
              : null;
            const chosen = match ?? pool[0] ?? null;
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

  setProviderDisabled: async (provider: string, disabled: boolean) => {
    const previous = get().disabledProviders;
    const next = withProviderDisabled(previous, provider, disabled);
    set({ disabledProviders: next });
    try {
      await window.studio.saveDisabledProviders(next);
    } catch (err) {
      console.error("Failed to save disabled providers", err);
      set({ disabledProviders: previous });
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
        const validProjectIds = new Set(projects.map((p) => p.id));
        const filteredOpenIds = s.openProjectIds.filter((id) => validProjectIds.has(id));
        if (filteredOpenIds.length !== s.openProjectIds.length) {
          persistOpenProjectIds(filteredOpenIds);
        }
        return changed
          ? { projects, projectsLoaded: true, allSessions, tabs, openProjectIds: filteredOpenIds }
          : { projects, projectsLoaded: true, allSessions, openProjectIds: filteredOpenIds };
      });
    } catch (err) {
      console.error("refreshCatalog failed", err);
      if (!get().projectsLoaded) set({ projectsLoaded: true });
    }
  },

  setActiveProject: async (project: ProjectEntry) => {
    void window.studio.setLastOpenedProjectId(project.id);
    const { tabs, projectLastActiveTab, openProjectIds } = get();
    if (!openProjectIds.includes(project.id)) {
      const nextOpen = [...openProjectIds, project.id];
      set({ openProjectIds: nextOpen });
      persistOpenProjectIds(nextOpen);
    }
    const lastTabId = projectLastActiveTab[project.id];
    const candidateTab =
      (lastTabId && tabs.find((t) => t.id === lastTabId && t.projectId === project.id)) ||
      tabs.find((t) => t.projectId === project.id);

    if (candidateTab) {
      set({ activeProject: project });
      await get().switchTab(candidateTab.id);
    } else {
      set({
        activeProject: project,
        activeTabId: null,
        activeKey: null,
        displayedTabId: null,
        transcript: createTranscript(),
        stats: null,
        ...EMPTY_TAB_UI,
      });
    }
  },

  openProjectTab: async (projectId: string) => {
    const { projects, openProjectIds } = get();
    const project = projects.find((p) => p.id === projectId);
    if (!project) return;
    if (!openProjectIds.includes(projectId)) {
      const next = [...openProjectIds, projectId];
      set({ openProjectIds: next });
      persistOpenProjectIds(next);
    }
    await get().setActiveProject(project);
  },

  closeProjectTab: async (projectId: string) => {
    const { openProjectIds, activeProject, projects } = get();
    const idx = openProjectIds.indexOf(projectId);
    if (idx === -1) return;
    const nextOpen = openProjectIds.filter((id) => id !== projectId);
    set({ openProjectIds: nextOpen });
    persistOpenProjectIds(nextOpen);

    if (activeProject?.id === projectId) {
      if (nextOpen.length > 0) {
        const nextIdx = Math.min(idx, nextOpen.length - 1);
        const nextProject = projects.find((p) => p.id === nextOpen[nextIdx]);
        if (nextProject) {
          await get().setActiveProject(nextProject);
          return;
        }
      }
      set({
        activeProject: null,
        activeTabId: null,
        activeKey: null,
        displayedTabId: null,
        transcript: createTranscript(),
        stats: null,
        ...EMPTY_TAB_UI,
      });
    }
  },

  reorderProjectTabs: (fromIndex: number, toIndex: number) => {
    const { openProjectIds } = get();
    if (fromIndex < 0 || fromIndex >= openProjectIds.length || toIndex < 0 || toIndex >= openProjectIds.length) return;
    const next = [...openProjectIds];
    const [moved] = next.splice(fromIndex, 1);
    if (!moved) return;
    next.splice(toIndex, 0, moved);
    set({ openProjectIds: next });
    persistOpenProjectIds(next);
  },

  closeOtherProjectTabs: async (keepProjectId: string) => {
    const { projects, openProjectIds } = get();
    if (!openProjectIds.includes(keepProjectId)) return;
    const next = [keepProjectId];
    set({ openProjectIds: next });
    persistOpenProjectIds(next);
    const p = projects.find((x) => x.id === keepProjectId);
    if (p && get().activeProject?.id !== keepProjectId) {
      await get().setActiveProject(p);
    }
  },

  closeProjectTabsToRight: async (projectId: string) => {
    const { openProjectIds, activeProject, projects } = get();
    const idx = openProjectIds.indexOf(projectId);
    if (idx === -1) return;
    const next = openProjectIds.slice(0, idx + 1);
    set({ openProjectIds: next });
    persistOpenProjectIds(next);
    if (activeProject && !next.includes(activeProject.id)) {
      const p = projects.find((x) => x.id === projectId);
      if (p) await get().setActiveProject(p);
    }
  },

  addProject: async (dirPath: string, name?: string, color?: string, icon?: string | null) => {
    const project = await window.studio.addProject(dirPath, name, color, icon);
    const { openProjectIds } = get();
    if (!openProjectIds.includes(project.id)) {
      const next = [...openProjectIds, project.id];
      set({ openProjectIds: next });
      persistOpenProjectIds(next);
    }
    await get().refreshCatalog();
    return project;
  },

  updateProject: async (id: string, updates: Partial<ProjectEntry>) => {
    await window.studio.updateProject(id, updates);
    await get().refreshCatalog();
  },

  removeProject: async (id: string) => {
    await window.studio.removeProject(id);
    const { openProjectIds } = get();
    if (openProjectIds.includes(id)) {
      await get().closeProjectTab(id);
    }
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

  newSessionTab: async (projectId: string, targetPaneId?: string) => {
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

    if (targetPaneId) {
      usePaneLayoutStore.getState().addTabToPane(tabId, targetPaneId);
    }

    set({ tabs: [...tabs, newTab] });
    set({
      ...swapInSessionTab(tabId),
      activeTabId: tabId,
      activeProject: project,
      activeKey: null,
      transcript: createTranscript(),
      stats: null,
    });

    // Do not eagerly spawn a live process or worktree until the user sends their initial request,
    // so the worktree branch name can be descriptive based on that request and no orphaned worktrees are created.
  },

  renameWorktreeBranch: async (tabId: string, newTitle: string) => {
    const tab = get().tabs.find((t) => t.id === tabId);
    if (!tab?.worktree) return;
    try {
      const res = await window.studio.worktreeRenameBranch(tab.worktree, newTitle);
      if (res.ok && res.branch) {
        const updatedWorktree = { ...tab.worktree, branch: res.branch };
        set((s) => ({
          tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, worktree: updatedWorktree } : t)),
          allSessions: s.allSessions.map((x) =>
            x.path === tab.sessionPath ? { ...x, worktree: updatedWorktree } : x,
          ),
        }));
        if (tab.sessionPath) {
          await window.studio.updateSessionMeta(tab.sessionPath, { worktree: updatedWorktree });
        }
      }
    } catch (err) {
      console.error("Failed to rename worktree branch", err);
    }
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
    const { tabs, activeProject, projects } = get();
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

    // Open next to the session that triggered the tab (e.g. a CLI run by the agent), not wherever the user is looking.
    const originTab = findOriginTab(tabs, spec.origin);
    const originProjectId = originTab?.projectId ?? findOriginProject(projects, spec.origin)?.id;
    const tabId = spec.id ?? `${spec.kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const newTab: TabItem = {
      id: tabId,
      kind: spec.kind,
      projectId: spec.projectId ?? originProjectId ?? activeProject?.id ?? "",
      title: spec.title,
      filePath: spec.filePath,
      url: spec.url,
      isSleeping: spec.isSleeping ?? false,
      lastActiveAt: spec.lastActiveAt ?? Date.now(),
      data: spec.data,
      pinned: false,
    };
    const originIdx = originTab ? tabs.findIndex((t) => t.id === originTab.id) : -1;
    const nextTabs = originIdx >= 0 ? [...tabs.slice(0, originIdx + 1), newTab, ...tabs.slice(originIdx + 1)] : [...tabs, newTab];
    const ownerId = spec.projectId ?? originProjectId;
    const owner = ownerId ? get().projects.find((p) => p.id === ownerId) : undefined;
    set({ tabs: nextTabs, activeTabId: tabId, ...(owner ? { activeProject: owner } : {}) });
    if (originTab) {
      // Put it in the originating session's pane, right after that session's tab (default sync would use the focused pane).
      const panes = usePaneLayoutStore.getState();
      const leaf = findLeafForTab(panes.root, originTab.id);
      if (leaf) {
        panes.syncWithTabs(nextTabs.map((t) => t.id), tabId);
        const idx = (findLeafForTab(usePaneLayoutStore.getState().root, originTab.id)?.tabIds ?? leaf.tabIds).indexOf(originTab.id);
        usePaneLayoutStore.getState().moveTab(tabId, leaf.id, idx + 1);
      }
    }
    return tabId;
  },

  ensureTabTranscriptLoaded: async (tabId: string) => {
    const tab = get().tabs.find((t) => t.id === tabId);
    if (!tab || !tab.sessionPath || get().transcriptsByTab[tabId]) return;
    try {
      const { entries, leafId } = await window.studio.readSessionFile(tab.sessionPath);
      const t = applyEntries(createTranscript(), entries, leafId, "replace");
      set((s) =>
        s.tabs.some((x) => x.id === tabId) && !s.transcriptsByTab[tabId]
          ? { transcriptsByTab: { ...s.transcriptsByTab, [tabId]: t } }
          : {},
      );
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
    if (tab.kind === "subagent" || tab.kind === "tidy") {
      set({ activeTabId: tabId, activeProject: get().projects.find((p) => p.id === tab.projectId) ?? get().activeProject });
      return;
    }
    // Leaving a non-session tab back to the same live session: nothing to reload.
    if ((tab.kind === "session" || !tab.kind) && tab.activeKey && tab.activeKey === get().activeKey) {
      set({ activeTabId: tabId });
      markSeen(tabId);
      if (tab.projectId) {
        set((s) => ({ projectLastActiveTab: { ...s.projectLastActiveTab, [tab.projectId!]: tabId } }));
      }
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
      ...(tab.projectId
        ? { projectLastActiveTab: { ...get().projectLastActiveTab, [tab.projectId]: tabId } }
        : {}),
      // A session that kept working in the background reflects running if its main thread was active
      // (hydrateSession then confirms with Pi's own isStreaming flag).
      transcript: { ...(get().transcriptsByTab[tabId] ?? createTranscript()), running: bgRunning && (mainThreadRunning.get(tabId) ?? false) },
      stats: null,
    });

    if (tab.sessionPath) {
      const existing = get().transcriptsByTab[tabId];
      if (!existing || existing.order.length === 0) {
        try {
          const { entries, leafId } = await window.studio.readSessionFile(tab.sessionPath);
          const base = existing ?? createTranscript();
          const t = applyEntries(base, entries, leafId, "replace");
          set((s) =>
            s.tabs.some((x) => x.id === tabId)
              ? {
                  transcriptsByTab: { ...s.transcriptsByTab, [tabId]: t },
                  ...(s.displayedTabId === tabId ? { transcript: t } : {}),
                }
              : {},
          );
        } catch (err) {
          console.error("Failed to read session file", err);
        }
      }
    }

    if (tab.kind === "session" || !tab.kind) {
      void get().ensureActiveSession(tabId);
    }
  },

  closeTab: async (tabId: string, nextActiveTabId?: string) => {
    const { tabs, activeTabId } = get();
    const tab = tabs.find((t) => t.id === tabId);
    clearPendingStart(tabId);
    // Stop in the background: closing a tab should feel instant.
    if (tab?.activeKey) {
      const closedKey = tab.activeKey;
      hydratedSessionKeys.delete(closedKey);
      void window.studio.stopSession(closedKey).catch(() => {});
      setReloadState(closedKey, null);
      setCompactionState(closedKey, null);
      postCompactionTokens.delete(closedKey);
      set((s) => {
        if (!s.compactionHeld[closedKey]) return {};
        const compactionHeld = { ...s.compactionHeld };
        delete compactionHeld[closedKey];
        return { compactionHeld };
      });
    }
    bridgeSubagentIds.delete(tabId);
    clearActivity(tabId);
    // The session file may only now be complete on disk; make sure it's listed so it can be reopened.
    if (tab?.sessionPath) void get().refreshCatalog();
    const remaining = tabs.filter((t) => t.id !== tabId);
    set((s) => {
      const tabUi = { ...s.tabUi };
      delete tabUi[tabId];
      const transcriptsByTab = { ...s.transcriptsByTab };
      delete transcriptsByTab[tabId];
      const projectLastActiveTab = { ...s.projectLastActiveTab };
      if (tab?.projectId && projectLastActiveTab[tab.projectId] === tabId) {
        delete projectLastActiveTab[tab.projectId];
      }
      return { tabs: remaining, tabUi, transcriptsByTab, projectLastActiveTab };
    });
    if (displayedSessionTabId === tabId) {
      displayedSessionTabId = null;
      set({ displayedTabId: null });
    }

    if (activeTabId === tabId) {
      const currentProjectId = tab?.projectId ?? get().activeProject?.id;
      const projectTabs = currentProjectId ? remaining.filter((t) => t.projectId === currentProjectId) : remaining;

      if (projectTabs.length > 0) {
        const nextTab = projectTabs.find((t) => t.id === nextActiveTabId) ?? projectTabs[projectTabs.length - 1]!;
        await get().switchTab(nextTab.id);
      } else {
        const currentProject = get().activeProject ?? (tab?.projectId ? get().projects.find((p) => p.id === tab.projectId) ?? null : null);
        set({ activeTabId: null, activeProject: currentProject, activeKey: null, transcript: createTranscript(), ...EMPTY_TAB_UI });
      }
    }
  },

  setPromptText: (text: string) => set({ promptText: text }),

  sendPrompt: async (streamingBehavior) => {
    const { promptText, attachments } = get();
    let { transcript, activeKey } = get();
    if (!promptText.trim() && attachments.length === 0) return;
    // Pi is swapping its extension runtime; a prompt now would hit a half-loaded session.
    if (activeKey && get().reloadStates[activeKey]?.phase === "reloading") {
      set({ error: "Pi is reloading - try again in a moment." });
      return;
    }

    playUiSound("prompt_send");

    // Capture everything tab-dependent before any await: the user may switch tabs while Pi starts.
    const { activeTabId, selectedMode } = get();
    const curTab = get().tabs.find((t) => t.id === activeTabId);
    const isFirstPrompt = curTab?.title === NEW_SESSION_TITLE || !curTab?.sessionPath;
    const autoTitle = titleFromPrompt(promptText, 40) || attachments[0]?.name || "";

    // Promote cold tab to live process if needed
    const coldStart = !activeKey;
    if (!activeKey) {
      if (autoTitle && activeTabId && isFirstPrompt) {
        set((s) => ({
          tabs: s.tabs.map((t) => (t.id === activeTabId && t.title === NEW_SESSION_TITLE ? { ...t, title: autoTitle } : t)),
        }));
      }
      // Starting Pi takes a few seconds: take the prompt out of the composer now and show it with its startup step.
      if (activeTabId) {
        const tabId = activeTabId;
        // A second send while Pi is still starting keeps the first prompt's bubble and step.
        const first = !get().pendingStarts[tabId];
        set((s) => ({
          promptText: "",
          attachments: [],
          ...(first
            ? {
                pendingStarts: {
                  ...s.pendingStarts,
                  [tabId]: { text: promptText, attachmentNames: attachments.map((a) => a.name), step: "starting" as const },
                },
              }
            : {}),
        }));
        if (first) pendingStartTimers.set(tabId, setTimeout(() => clearPendingStart(tabId), PENDING_START_TIMEOUT_MS));
      }
      const startedTabId = activeTabId;
      activeKey = await get().ensureActiveSession(activeTabId ?? undefined, { title: autoTitle || undefined });
      if (startedTabId && !get().tabs.some((t) => t.id === startedTabId)) {
        // Tab closed while Pi was starting (ensureActiveSession already stopped the process): drop the prompt quietly.
        clearPendingStart(startedTabId);
        return;
      }
      if (!activeKey) {
        if (activeTabId) {
          clearPendingStart(activeTabId);
          // Give the prompt back so it isn't lost (unless the user already typed something new).
          if (get().tabs.some((t) => t.id === activeTabId)) {
            updateTabUi(activeTabId, (ui) => (ui.promptText || ui.attachments.length > 0 ? {} : { promptText, attachments }));
          }
        }
        return;
      }
      if (activeTabId) setPendingStartStep(activeTabId, "sending");
      // The snapshot above predates the session start; don't act on a stale `running` (of this tab, not the displayed one).
      transcript = activeTabId && !isDisplayed(activeTabId) ? get().transcriptsByTab[activeTabId] ?? createTranscript() : get().transcript;
    } else if (isFirstPrompt && autoTitle && activeTabId) {
      // If the session was already running and had a worktree with a placeholder branch (e.g. hive/session-xxxx),
      // rename the worktree branch to a descriptive name based on the user's initial request!
      const runningTab = get().tabs.find((t) => t.id === activeTabId);
      if (runningTab?.worktree && /^hive\/session-[a-f0-9]+$/i.test(runningTab.worktree.branch)) {
        void get().renameWorktreeBranch(runningTab.id, autoTitle);
      }
    }

    const images: Array<{ type: "image"; data: string; mimeType: string }> = [];
    const fileBlocks: string[] = [];
    const videoBlocks: string[] = [];

    for (const item of attachments) {
      if (item.kind === "image" && item.dataBase64) {
        images.push({
          type: "image",
          data: item.dataBase64,
          mimeType: item.mimeType,
        });
      } else if (item.kind === "video" && item.path) {
        // Pi's prompt API only takes images, so a video goes in as a file reference the agent can open with its tools.
        videoBlocks.push(`--- Attached Video: ${item.name} (${item.path}${item.mimeType ? `, ${item.mimeType}` : ""}) ---`);
      } else if (item.textContent) {
        fileBlocks.push(
          `--- Attached File: ${item.name}${item.path ? ` (${item.path})` : ""} ---\n${item.textContent}\n--- End of File ---`
        );
      }
    }

    let message = promptText;
    if (videoBlocks.length > 0) {
      message =
        (message ? message + "\n\n" : "") +
        "The user attached video file(s) on disk. You cannot view video directly; inspect them with your tools (e.g. ffprobe/ffmpeg to read metadata or extract frames) as needed.\n" +
        videoBlocks.join("\n");
    }
    if (fileBlocks.length > 0) {
      message = (message ? message + "\n\n" : "") + fileBlocks.join("\n\n");
    }

    // Prefix mode steering if in non-default mode
    if (selectedMode === "plan") {
      message = `[Mode: Plan - Analyze, research, and outline an architectural plan. Do not execute file edits unless explicitly directed to do so.]\n\n${message}`;
    } else if (selectedMode === "manual") {
      message = `[Mode: Manual - Propose changes and request user confirmation before modifying files.]\n\n${message}`;
    } else if (selectedMode === "debug") {
      message = `[Mode: Debug - Prioritize root cause diagnosis, examining error traces, logs, and reproduction steps.]\n\n${message}`;
    } else if (selectedMode === "ask") {
      message = `[Mode: Ask - Answer questions, explain concepts, and analyze code. Do not edit files or execute destructive actions.]\n\n${message}`;
    }

    // A cold start already emptied the composer; don't wipe what the user typed while Pi was starting.
    // A warm (already started) idle session still takes a moment to echo the prompt: show it right away too.
    const warmPending = !coldStart && !transcript.running && !!activeTabId && !get().pendingStarts[activeTabId];
    if (!coldStart) {
      set((s) => ({
        promptText: "",
        attachments: [],
        ...(warmPending && activeTabId
          ? {
              pendingStarts: {
                ...s.pendingStarts,
                [activeTabId]: { text: promptText, attachmentNames: attachments.map((a) => a.name), step: "sending" as const },
              },
            }
          : {}),
      }));
      if (warmPending && activeTabId) {
        const tid = activeTabId;
        pendingStartTimers.set(tid, setTimeout(() => clearPendingStart(tid), PENDING_START_TIMEOUT_MS));
      }
    }
    const trackPending = coldStart || warmPending;

    // Name a fresh tab after its first prompt so the header reflects the conversation right away.
    if (autoTitle && activeTabId) {
      set((s) => ({
        tabs: s.tabs.map((t) => (t.id === activeTabId && t.title === NEW_SESSION_TITLE ? { ...t, title: autoTitle } : t)),
      }));
    }

    // Replace the prompt-derived title with a short LLM-generated one (best effort, once per session).
    if (isFirstPrompt && autoTitle && promptText.trim()) {
      const t = get().tabs.find((x) => x.id === activeTabId);
      if (t?.sessionPath) {
        const project = get().projects.find((pr) => pr.id === t.projectId);
        void generateAiTitle(t.sessionPath, project?.path ?? "", titleFromPrompt(promptText, 2000), autoTitle, t.model ?? get().selectedModel, get().models);
      }
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
            cwd: sentTab.worktree?.worktreePath ?? project?.path ?? "",
            created: now,
            modified: now,
            messageCount: 0,
            firstMessage: promptText || attachments[0]?.name || "",
            projectId: sentTab.projectId,
            pending: true,
            ...(sentTab.worktree ? { worktree: sentTab.worktree } : {}),
          },
          ...s.allSessions,
        ],
      }));
    }

    // A stale `running` flag would route this prompt into Pi's steer/follow-up queue on an idle session, where it sits
    // as "queued". Pi is the source of truth: if it isn't streaming, send a normal prompt.
    let running = transcript.running;
    if (running) {
      const st = await window.studio.rpc(activeKey, { type: "get_state" }).catch(() => null);
      if (st?.ok && (st.data as { isStreaming?: boolean } | undefined)?.isStreaming === false) {
        running = false;
        set((s) => (s.activeKey === activeKey && s.transcript.running ? { transcript: { ...s.transcript, running: false } } : {}));
      }
    }

    // "Compact first" sources (cold cache bar, Jev hint) that weren't dismissed compact before this prompt goes out.
    // Slash commands and mid-turn steering go straight through.
    const compactFirst =
      !running && !promptText.trim().startsWith("/") && get().compactionStates[activeKey]?.phase !== "compacting"
        ? runPreSendHooks(activeKey)
        : null;

    // Compaction in progress: hold the message, show it as queued, send it when compaction ends.
    if (compactFirst || get().compactionStates[activeKey]?.phase === "compacting") {
      // The held message is listed as queued; the startup indicator would duplicate it.
      if (trackPending && activeTabId) clearPendingStart(activeTabId);
      const key = activeKey;
      const text = promptText.trim() || attachments[0]?.name || "";
      set((s) => ({
        compactionHeld: {
          ...s.compactionHeld,
          [key]: [...(s.compactionHeld[key] ?? []), { text, message, images }],
        },
      }));
      // Whatever way the compaction ends (done, failed, never started), the prompt goes out.
      if (compactFirst) void compactFirst.then(() => whenCompactionApplied(key)).finally(() => flushHeldMessages(key));
      return;
    }

    // A rejected/failed send must not lose the user's text: put it back in the composer and say why.
    const failSend = (reason: string | undefined) => {
      if (trackPending && activeTabId) clearPendingStart(activeTabId);
      if (activeTabId) restoreDraft(activeTabId, promptText, attachments);
      set({ error: `Couldn't send your message: ${reason || "Pi didn't accept it."}` });
    };
    const sendRpc = async (command: Parameters<StudioApi["rpc"]>[1]) => {
      try {
        const res = await window.studio.rpc(activeKey, command);
        if (!res?.ok) failSend(res?.error);
        return res;
      } catch (err) {
        failSend(err instanceof Error ? err.message : String(err));
        return null;
      }
    };

    if (running && streamingBehavior === "steer") {
      await sendRpc({
        type: "steer",
        message,
        ...(images.length > 0 ? { images } : {}),
      });
    } else if (running && streamingBehavior === "followUp") {
      await sendRpc({
        type: "follow_up",
        message,
        ...(images.length > 0 ? { images } : {}),
      });
    } else {
      // Without a run (rejected prompt, or a slash command Pi handles itself) no agent_start will clear the indicator.
      const res = await sendRpc({
        type: "prompt",
        message,
        ...(images.length > 0 ? { images } : {}),
        ...(running ? { streamingBehavior: "steer" } : {}),
      });
      const started = !!res?.ok && !promptText.trim().startsWith("/");
      if (trackPending && activeTabId && !started) clearPendingStart(activeTabId);
    }
  },

  rewindToUserMessage: async (requestedId, mode) => {
    const fail = (message: string) => {
      console.error("[rewind]", message);
      toast({ message, kind: "error" });
    };

    let activeKey = get().activeKey;
    if (!activeKey) {
      // Cold tab (session opened from history, no Pi process yet): start it so the rewind can run.
      activeKey = await get().ensureActiveSession();
      if (!activeKey) return fail("Couldn't start the session to rewind it.");
    }
    if (get().reloadStates[activeKey]?.phase === "reloading") {
      return fail("Pi is reloading. Try again in a moment.");
    }

    // The row key can be `live:user:<ts>` for a message not synced from the session file yet; map it to the real entry.
    const findEntry = () => {
      const { byId } = get().transcript;
      const direct = byId[requestedId];
      if (direct) return direct;
      const m = /^live:user:(.+)$/.exec(requestedId);
      if (!m) return undefined;
      return Object.values(byId).find((e) => {
        if (e.type !== "message") return false;
        const em = e.message as unknown as { role?: string; timestamp?: unknown };
        return em.role === "user" && String(em.timestamp ?? "?") === m[1];
      });
    };
    let entry = findEntry();
    if (!entry) {
      // Not synced yet: reload from the session file once and look again.
      const sessionPath = get().tabs.find((t) => t.activeKey === activeKey)?.sessionPath;
      if (sessionPath) {
        try {
          const { entries, leafId } = await window.studio.readSessionFile(sessionPath);
          set((s) => (s.activeKey === activeKey ? { transcript: applyEntries(s.transcript, entries, leafId, "append") } : {}));
        } catch (err) {
          console.error("[rewind] session file reload failed", err);
        }
        entry = findEntry();
      }
    }
    if (!entry || entry.type !== "message") {
      return fail("This message isn't saved to the session yet, so it can't be rewound. Try again in a moment.");
    }
    const target = entry;
    const entryId = target.id;
    const msg = target.message as unknown as { role?: string; content?: unknown; timestamp?: unknown };
    if (msg.role !== "user") return fail("Only your own messages can be retried or edited.");

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

    if (get().transcript.running) {
      await get().abort();
      // Pi refuses to navigate while it is still streaming; wait for the run to actually settle.
      const settleDeadline = Date.now() + 8_000;
      while (get().transcript.running && Date.now() < settleDeadline) {
        await new Promise((r) => setTimeout(r, 100));
      }
    }

    // Retry while Pi is still winding down (abort is asynchronous).
    let res = await window.studio.bridgeAction(activeKey, { action: "navigate_tree", entryId });
    for (let attempt = 0; !res.ok && /Wait for the current/i.test(res.error ?? "") && attempt < 20; attempt++) {
      await new Promise((r) => setTimeout(r, 250));
      res = await window.studio.bridgeAction(activeKey, { action: "navigate_tree", entryId });
    }
    if (!res.ok) {
      return fail(`Couldn't rewind the conversation: ${res.error || "Pi didn't accept the rewind."}`);
    }
    // Pi moved its leaf to the parent of this message; mirror that so the view (and appends) follow.
    // Messages from the abandoned branch may still sit in `live`; keep only ones sent before this message.
    const cutoff = typeof msg.timestamp === "number" ? msg.timestamp : null;
    set((s) => {
      const next = applyEntries(s.transcript, [], target.parentId ?? null, "append");
      return {
        transcript:
          cutoff === null
            ? next
            : { ...next, live: next.live.filter((m) => typeof m.timestamp === "number" && m.timestamp < cutoff) },
        // Keep whatever the user has typed meanwhile.
        promptText: mode === "resend" || !s.promptText.trim() ? text : `${s.promptText}\n${text}`,
        attachments: mode === "resend" ? images : [...s.attachments, ...images],
      };
    });
    if (mode === "resend") {
      try {
        await get().sendPrompt();
      } catch (err) {
        fail(`Couldn't resend the message: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  },

  retryLastMessage: async () => {
    get().clearError();
    const { transcript, promptText } = get();
    const entries = Object.values(transcript.byId);
    const lastUserEntry = [...entries]
      .reverse()
      .find((e) => e.type === "message" && (e.message as { role?: string } | undefined)?.role === "user");

    if (lastUserEntry) {
      await get().rewindToUserMessage(lastUserEntry.id, "resend");
    } else if (promptText.trim()) {
      await get().sendPrompt();
    }
  },

  abort: async () => {
    const { activeKey } = get();
    if (!activeKey) return;
    const res = await window.studio.rpc(activeKey, { type: "clear_queue" });
    if (res.ok) {
      const q = res.data as { steering?: string[]; followUp?: string[] };
      const restored = [...(q.steering ?? []), ...(q.followUp ?? [])].join("\n");
      if (restored) set((s) => ({ promptText: s.promptText.trim() ? `${s.promptText}\n\n${restored}` : restored }));
    }
    await window.studio.rpc(activeKey, { type: "abort" });
    // Also stop background subagents so nothing keeps running.
    const tabId = get().activeTabId;
    if (tabId) {
      const ids = new Set<string>([...(runningSubagents.get(tabId) ?? []), ...(bridgeSubagentIds.get(tabId) ?? [])]);
      await Promise.all([...ids].map((agentId) => get().stopSubagent({ agentId })));
    }
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

  respondTabDialog: async (tabId, response) => {
    if (isDisplayed(tabId)) return get().respondDialog(response);
    const key = get().tabs.find((t) => t.id === tabId)?.activeKey;
    if (!key) {
      updateTabUi(tabId, () => ({ pendingUiDialog: null }));
      return;
    }
    await window.studio.respondUi(key, response);
    updateTabUi(tabId, (ui) => (ui.pendingUiDialog?.id === response.id ? { pendingUiDialog: null } : {}));
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
    if (!activeKey) return false;
    try {
      await window.studio.bridgeEmit(activeKey, BRIDGE_TOPICS.fromGui, {
        kind: "subagent_stop",
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        ...target,
      });
      return true;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
      return false;
    }
  },

  deleteSessionFile: async (sessionPath: string) => {
    // Stop the running Pi first so Windows releases the file lock; close tabs only once the delete succeeded.
    const openTabs = get().tabs.filter((t) => t.sessionPath === sessionPath);
    for (const t of openTabs) {
      if (t.activeKey) {
        try {
          await window.studio.stopSession(t.activeKey);
        } catch {}
      }
    }
    try {
      await window.studio.deleteSessionFile(sessionPath);
    } catch (err) {
      throw new Error(`Couldn't delete the session: ${err instanceof Error ? err.message : String(err)}`);
    }
    for (const t of openTabs) await get().closeTab(t.id);
    await get().refreshCatalog();
  },

  deleteQueuedMessage: async (type: "steering" | "followUp", index: number, targetTabId?: string) => {
    const s = get();
    const tab = targetTabId ? s.tabs.find((t) => t.id === targetTabId) : undefined;
    const key = tab?.activeKey ?? s.activeKey;
    if (!key) return;
    const res = await window.studio.rpc(key, { type: "clear_queue" });
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
      await window.studio.rpc(key, { type: "steer", message: msg });
    }
    for (const msg of followUp) {
      await window.studio.rpc(key, { type: "follow_up", message: msg });
    }

    const latest = get();
    const curTab = targetTabId ?? latest.displayedTabId ?? latest.activeTabId;
    const isCur = !targetTabId || targetTabId === latest.activeTabId || targetTabId === latest.displayedTabId;
    const prevT = (curTab ? latest.transcriptsByTab[curTab] : undefined) ?? latest.transcript;
    const nextT = { ...prevT, queue: { steering, followUp } };

    set((state) => ({
      ...(isCur ? { transcript: nextT } : {}),
      ...(curTab ? { transcriptsByTab: { ...state.transcriptsByTab, [curTab]: nextT } } : {}),
    }));
  },

  editQueuedMessage: async (type: "steering" | "followUp", index: number, newText: string, targetTabId?: string) => {
    const trimmed = newText.trim();
    if (!trimmed) {
      return get().deleteQueuedMessage(type, index, targetTabId);
    }
    const s = get();
    const tab = targetTabId ? s.tabs.find((t) => t.id === targetTabId) : undefined;
    const key = tab?.activeKey ?? s.activeKey;
    if (!key) return;
    const res = await window.studio.rpc(key, { type: "clear_queue" });
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
      await window.studio.rpc(key, { type: "steer", message: msg });
    }
    for (const msg of followUp) {
      await window.studio.rpc(key, { type: "follow_up", message: msg });
    }

    const latest = get();
    const curTab = targetTabId ?? latest.displayedTabId ?? latest.activeTabId;
    const isCur = !targetTabId || targetTabId === latest.activeTabId || targetTabId === latest.displayedTabId;
    const prevT = (curTab ? latest.transcriptsByTab[curTab] : undefined) ?? latest.transcript;
    const nextT = { ...prevT, queue: { steering, followUp } };

    set((state) => ({
      ...(isCur ? { transcript: nextT } : {}),
      ...(curTab ? { transcriptsByTab: { ...state.transcriptsByTab, [curTab]: nextT } } : {}),
    }));
  },

  runQueuedNow: async (type: "steering" | "followUp", index: number, targetTabId?: string) => {
    const s = get();
    const tab = targetTabId ? s.tabs.find((t) => t.id === targetTabId) : undefined;
    const key = tab?.activeKey ?? s.activeKey;
    if (!key) return;

    const curTab = targetTabId ?? s.displayedTabId ?? s.activeTabId;
    const targetTranscript = (curTab ? s.transcriptsByTab[curTab] : undefined) ?? s.transcript;

    const res = await window.studio.rpc(key, { type: "clear_queue" });
    if (!res.ok) return;
    const current = (res.data ?? {}) as { steering?: string[]; followUp?: string[] };
    const steering = [...(current.steering ?? targetTranscript.queue.steering ?? [])];
    const followUp = [...(current.followUp ?? targetTranscript.queue.followUp ?? [])];

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
      const fallbackList = type === "steering" ? targetTranscript.queue.steering : targetTranscript.queue.followUp;
      target = fallbackList[index];
    }
    if (!target) return;

    if (targetTranscript.running) {
      try {
        await window.studio.rpc(key, { type: "abort" });
      } catch (err) {
        console.warn("Abort failed while running queued message now:", err);
      }
    }

    try {
      await window.studio.rpc(key, { type: "prompt", message: target });
    } catch (err) {
      console.error("Prompt failed while running queued message now:", err);
    }

    for (const msg of steering) {
      await window.studio.rpc(key, { type: "steer", message: msg });
    }
    for (const msg of followUp) {
      await window.studio.rpc(key, { type: "follow_up", message: msg });
    }

    const latest = get();
    const latestCurTab = targetTabId ?? latest.displayedTabId ?? latest.activeTabId;
    const latestIsCur = !targetTabId || targetTabId === latest.activeTabId || targetTabId === latest.displayedTabId;
    const nextT = {
      ...targetTranscript,
      running: true,
      queue: {
        steering,
        followUp,
      },
    };

    set((state) => ({
      ...(latestIsCur ? { transcript: nextT } : {}),
      ...(latestCurTab ? { transcriptsByTab: { ...state.transcriptsByTab, [latestCurTab]: nextT } } : {}),
    }));
  },

  steerQueuedNext: async (type: "steering" | "followUp", index: number, targetTabId?: string) => {
    const s = get();
    const tab = targetTabId ? s.tabs.find((t) => t.id === targetTabId) : undefined;
    const key = tab?.activeKey ?? s.activeKey;
    if (!key) return;

    const curTab = targetTabId ?? s.displayedTabId ?? s.activeTabId;
    const targetTranscript = (curTab ? s.transcriptsByTab[curTab] : undefined) ?? s.transcript;

    if (!targetTranscript.running) {
      return get().runQueuedNow(type, index, targetTabId);
    }

    const res = await window.studio.rpc(key, { type: "clear_queue" });
    if (!res.ok) return;
    const current = (res.data ?? {}) as { steering?: string[]; followUp?: string[] };
    const steering = [...(current.steering ?? targetTranscript.queue.steering ?? [])];
    const followUp = [...(current.followUp ?? targetTranscript.queue.followUp ?? [])];

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

    await window.studio.rpc(key, { type: "steer", message: target });
    for (const msg of steering) {
      await window.studio.rpc(key, { type: "steer", message: msg });
    }
    for (const msg of followUp) {
      await window.studio.rpc(key, { type: "follow_up", message: msg });
    }

    const latest = get();
    const latestCurTab = targetTabId ?? latest.displayedTabId ?? latest.activeTabId;
    const latestIsCur = !targetTabId || targetTabId === latest.activeTabId || targetTabId === latest.displayedTabId;
    const nextT = {
      ...targetTranscript,
      queue: {
        steering: [target!, ...steering],
        followUp,
      },
    };

    set((state) => ({
      ...(latestIsCur ? { transcript: nextT } : {}),
      ...(latestCurTab ? { transcriptsByTab: { ...state.transcriptsByTab, [latestCurTab]: nextT } } : {}),
    }));
  },

  steerQueuedNow: async (type: "steering" | "followUp", index: number, targetTabId?: string) => {
    return get().runQueuedNow(type, index, targetTabId);
  },

  clearAllQueued: async (targetTabId?: string) => {
    const s = get();
    const tab = targetTabId ? s.tabs.find((t) => t.id === targetTabId) : undefined;
    const key = tab?.activeKey ?? s.activeKey;
    if (!key) return;
    await window.studio.rpc(key, { type: "clear_queue" });
    set((state) => {
      const compactionHeld = { ...state.compactionHeld };
      delete compactionHeld[key];
      const curTab = targetTabId ?? s.displayedTabId ?? s.activeTabId;
      const isCur = !targetTabId || targetTabId === s.activeTabId || targetTabId === s.displayedTabId;
      const prevT = (curTab ? state.transcriptsByTab[curTab] : undefined) ?? state.transcript;
      const nextT = { ...prevT, queue: { steering: [], followUp: [] } };
      return {
        compactionHeld,
        ...(isCur ? { transcript: nextT } : {}),
        ...(curTab ? { transcriptsByTab: { ...state.transcriptsByTab, [curTab]: nextT } } : {}),
      };
    });
  },

  popQueuedToEditor: async (type: "steering" | "followUp", index: number, targetTabId?: string) => {
    const s = get();
    const curTab = targetTabId ?? s.displayedTabId ?? s.activeTabId;
    const targetTranscript = (curTab ? s.transcriptsByTab[curTab] : undefined) ?? s.transcript;
    const list = type === "steering" ? targetTranscript.queue.steering : targetTranscript.queue.followUp;
    const msg = list[index];
    if (msg === undefined) return;
    await get().deleteQueuedMessage(type, index, targetTabId);

    const latest = get();
    const isCur = !targetTabId || targetTabId === latest.activeTabId || targetTabId === latest.displayedTabId;
    if (isCur) {
      const { promptText } = latest;
      const combined = promptText.trim() ? `${promptText}\n\n${msg}` : msg;
      set({ promptText: combined });
    } else if (targetTabId) {
      updateTabUi(targetTabId, (ui) => ({
        promptText: ui.promptText.trim() ? `${ui.promptText}\n\n${msg}` : msg,
      }));
    }
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

const aiTitleInFlight = new Set<string>();

async function generateAiTitle(
  sessionPath: string,
  cwd: string,
  prompt: string,
  provisional: string,
  active: Model<any> | null | undefined,
  catalog: Array<Model<any>>,
): Promise<void> {
  if (aiTitleInFlight.has(sessionPath) || !cwd) return;
  aiTitleInFlight.add(sessionPath);
  try {
    const title = await window.studio.generateSessionTitle(cwd, prompt, pickTitleModel(catalog, active));
    if (!title) return;
    const { allSessions } = useSessionStore.getState();
    const existing = allSessions.find((x) => x.path === sessionPath);
    if (existing?.title?.trim() || existing?.aiTitle?.trim()) return; // user renamed meanwhile
    await window.studio.updateSessionMeta(sessionPath, { aiTitle: title });
    useSessionStore.setState((s) => ({
      allSessions: s.allSessions.map((x) => (x.path === sessionPath ? { ...x, aiTitle: title } : x)),
      tabs: s.tabs.map((t) => (t.sessionPath === sessionPath && t.title === provisional ? { ...t, title: titleFromPrompt(title, 40) } : t)),
    }));
    await useSessionStore.getState().refreshCatalog();
  } catch (err) {
    console.error("AI session title failed", err);
  } finally {
    aiTitleInFlight.delete(sessionPath);
  }
}

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
  dropSessionKey,
  setDisplayedTab: (id: string | null) => {
    displayedSessionTabId = id;
  },
};
