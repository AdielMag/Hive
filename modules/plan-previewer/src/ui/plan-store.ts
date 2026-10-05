import { create } from "zustand";
import {
  PlanMethods,
  type PlanExecutionMode as AgentMode,
  type PlanFeedbackPayload,
  type PlanPreviewData,
  type SubmitFeedbackResult,
} from "../shared.ts";
import { extractDecisions, extractPlanViews, summarizeDiff, type DecisionItem } from "../plan-utils.ts";
import {
  buildAnswersPayload,
  buildChoicesPayload,
  buildQuestionsPayload,
  countUnansweredAgentQuestions,
  pendingRounds,
  reconcileSelections,
  type ChoiceSelections,
  type DraftAnswers,
} from "../plan-review.ts";
import { planHost } from "./plan-host.ts";

export type PlanViewMode = "summary" | "full";
export type PlanWidthMode = "comfortable" | "wide";
/** reviewing: normal; answering: agent `--ask` questions pending; sent: waiting for the agent; approved: done. */
export type PlanPhase = "reviewing" | "answering" | "sent" | "approved";
export type FeedbackStatus = PlanFeedbackPayload["status"];

export interface PlanAnnotation {
  id: string;
  selectedText: string;
  question: string;
  timestamp: string;
}

const LS_VIEW = "hive-plan-view-mode";
const LS_WIDTH = "hive-plan-reading-width";
const LS_OUTLINE = "hive-plan-outline"; // "show" | "hide"; absent = automatic

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}

// Keys from the previous layout (3-way width, right sidebar) no longer apply.
for (const old of ["hive-plan-width-mode", "hive-plan-collapse-left", "hive-plan-collapse-right"]) writeStorage(old, null);

function initialOutline(): boolean | null {
  const v = readStorage(LS_OUTLINE);
  return v === "show" ? true : v === "hide" ? false : null;
}

/** Decisions of the whole plan (inline part, Summary and Full alike), de-duplicated by key. */
function decisionsFor(content: string): DecisionItem[] {
  return extractDecisions(content);
}

function derivePhase(data: PlanPreviewData | null, sent: boolean): PlanPhase {
  if (data?.planApproved) return "approved";
  if (pendingRounds(data?.agentQuestions).length > 0) return "answering";
  return sent ? "sent" : "reviewing";
}

interface PlanState {
  filePath: string | null;
  planData: PlanPreviewData | null;
  loading: boolean;
  error: string | null;

  viewMode: PlanViewMode;
  widthMode: PlanWidthMode;
  /** null = automatic (by tab width); boolean = user override. */
  outlineOpen: boolean | null;

  /** Decisions of the active view. */
  decisions: DecisionItem[];
  selections: ChoiceSelections;
  draftAnswers: DraftAnswers;
  annotations: PlanAnnotation[];
  agentAnswers: Record<string, string>; // `${roundId}:${questionId}` -> value
  footerComment: string;
  selectedExecutionMode: AgentMode;

  phase: PlanPhase;
  /** What the last successful submit sent (drives the "sent" copy). */
  sentKind: "changes" | "answers" | null;
  lastUpdate: { additions: number; deletions: number; at: number } | null;
  dismissedReplyAt: string | null;
  isSubmitting: boolean;

  /** The popup showing the full plan (opened from the inline card). */
  modalOpen: boolean;
  /** Absolute plan paths the CLI announced recently (newest first); lets inline cards resolve relative args. */
  recentPaths: string[];

  /** `agentWaiting`: a live `plan-previewer` call is blocked on the user, so the agent has acted (never "sent"). */
  loadPlan: (filePath: string, agentWaiting?: boolean) => Promise<void>;
  refresh: () => Promise<void>;
  updateFromDisk: (content: string, fileVersion: number) => void;
  setViewMode: (mode: PlanViewMode) => void;
  setWidthMode: (mode: PlanWidthMode) => void;
  setOutlineOpen: (open: boolean | null) => void;
  openModal: () => void;
  closeModal: () => void;
  addRecentPath: (filePath: string) => void;

  selectChoice: (decision: DecisionItem, optionLabel: string) => void;
  setDraftAnswer: (key: string, text: string) => void;

  addAnnotation: (selectedText: string, question: string) => void;
  removeAnnotation: (id: string) => void;

  setAgentAnswer: (answerKey: string, value: string) => void;
  setFooterComment: (comment: string) => void;
  setSelectedExecutionMode: (mode: AgentMode) => void;

  clearLastUpdate: () => void;
  dismissReply: (timestamp: string) => void;
  submitFeedback: (status: FeedbackStatus) => Promise<SubmitFeedbackResult>;
}

export const usePlanStore = create<PlanState>((set, get) => ({
  filePath: null,
  planData: null,
  loading: false,
  error: null,

  viewMode: (readStorage(LS_VIEW) as PlanViewMode) === "summary" ? "summary" : "full",
  widthMode: readStorage(LS_WIDTH) === "wide" ? "wide" : "comfortable",
  outlineOpen: initialOutline(),

  decisions: [],
  selections: {},
  draftAnswers: {},
  annotations: [],
  agentAnswers: {},
  footerComment: "",
  selectedExecutionMode: "auto-edit",

  phase: "reviewing",
  sentKind: null,
  lastUpdate: null,
  dismissedReplyAt: null,
  isSubmitting: false,

  modalOpen: false,
  recentPaths: [],

  loadPlan: async (filePath: string, agentWaiting = false) => {
    const samePlan = get().filePath === filePath && get().planData !== null;
    set({ loading: true, error: null, filePath });
    try {
      const data = await planHost().ipc.invoke<PlanPreviewData | null>(PlanMethods.get, filePath);
      if (!data) {
        set({ loading: false, error: `Plan file not found: ${filePath}` });
        return;
      }

      const views = extractPlanViews(data.content);
      let viewMode = get().viewMode;
      if (views.summary && !readStorage(LS_VIEW)) viewMode = "summary";
      const decisions = decisionsFor(data.content);

      // Re-mounting the same plan keeps the review in progress; a different plan starts fresh.
      const reset = samePlan
        ? { selections: reconcileSelections(decisions, get().selections) }
        : {
            selections: {},
            draftAnswers: {},
            annotations: [],
            agentAnswers: {},
            footerComment: "",
            lastUpdate: null,
            dismissedReplyAt: null,
          };

      // Re-mounting a plan that is already waiting on the agent must not flip it back to "reviewing".
      const derived = derivePhase(data, false);
      const keepSent = !agentWaiting && samePlan && get().phase === "sent" && derived === "reviewing";

      set({
        ...reset,
        loading: false,
        planData: data,
        decisions,
        viewMode,
        sentKind: keepSent ? get().sentKind : null,
        phase: keepSent ? "sent" : derived,
      });
    } catch (err: any) {
      set({ loading: false, error: err?.message || "Failed to load plan" });
    }
  },

  /** Re-fetch after the agent re-notifies (new questions / reply): the agent acted, so "sent" ends. */
  refresh: async () => {
    const { filePath, planData: prev } = get();
    if (!filePath || !prev) return;
    try {
      const data = await planHost().ipc.invoke<PlanPreviewData | null>(PlanMethods.get, filePath);
      if (!data) return;
      const decisions = decisionsFor(data.content);
      const diff = summarizeDiff(prev.content, data.content);
      set((s) => ({
        planData: data,
        decisions,
        selections: reconcileSelections(decisions, s.selections),
        phase: derivePhase(data, false),
        sentKind: null,
        lastUpdate: diff.additions || diff.deletions ? { ...diff, at: Date.now() } : s.lastUpdate,
      }));
    } catch {
      /* keep the current view */
    }
  },

  updateFromDisk: (content: string, fileVersion: number) => {
    const prev = get().planData;
    if (!prev || prev.content === content) return;

    const diff = summarizeDiff(prev.content, content);
    const planData = { ...prev, content, fileVersion, updatedAt: new Date().toISOString() };
    const decisions = decisionsFor(content);

    set((s) => ({
      planData,
      decisions,
      selections: reconcileSelections(decisions, s.selections),
      lastUpdate: { ...diff, at: Date.now() },
      phase: s.phase === "sent" ? derivePhase(planData, false) : s.phase,
      sentKind: s.phase === "sent" ? null : s.sentKind,
    }));
  },

  setViewMode: (viewMode) => {
    writeStorage(LS_VIEW, viewMode);
    set({ viewMode });
  },

  setWidthMode: (widthMode) => {
    writeStorage(LS_WIDTH, widthMode);
    set({ widthMode });
  },

  openModal: () => {
    // "Show more" means the whole plan; this does not overwrite the user's saved view preference.
    const views = extractPlanViews(get().planData?.content ?? "");
    set({ modalOpen: true, ...(views.summary && views.full ? { viewMode: "full" as PlanViewMode } : {}) });
  },

  closeModal: () => set({ modalOpen: false }),

  addRecentPath: (filePath) =>
    set((s) => ({ recentPaths: [filePath, ...s.recentPaths.filter((p) => p !== filePath)].slice(0, 8) })),

  setOutlineOpen: (outlineOpen) => {
    writeStorage(LS_OUTLINE, outlineOpen === null ? null : outlineOpen ? "show" : "hide");
    set({ outlineOpen });
  },

  selectChoice: (decision, optionLabel) => {
    const opt = decision.options.find((o) => o.label === optionLabel);
    if (!opt) return;
    set((s) => ({
      selections: { ...s.selections, [decision.key]: { title: decision.title, label: opt.label, text: opt.text } },
    }));
  },

  setDraftAnswer: (key, text) => {
    set((s) => ({ draftAnswers: { ...s.draftAnswers, [key]: text } }));
  },

  addAnnotation: (selectedText, question) => {
    const item: PlanAnnotation = {
      id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      selectedText,
      question,
      timestamp: new Date().toISOString(),
    };
    set((s) => ({ annotations: [...s.annotations, item] }));
  },

  removeAnnotation: (id) => {
    set((s) => ({ annotations: s.annotations.filter((a) => a.id !== id) }));
  },

  setAgentAnswer: (answerKey, value) => {
    set((s) => ({ agentAnswers: { ...s.agentAnswers, [answerKey]: value } }));
  },

  setFooterComment: (footerComment) => set({ footerComment }),

  setSelectedExecutionMode: (selectedExecutionMode) => set({ selectedExecutionMode }),

  clearLastUpdate: () => set({ lastUpdate: null }),

  dismissReply: (timestamp) => set({ dismissedReplyAt: timestamp }),

  submitFeedback: async (status) => {
    const state = get();
    if (!state.filePath || !state.planData) return { success: false, error: "No active plan" };
    if (state.isSubmitting) return { success: false, error: "Already sending" };

    const rounds = pendingRounds(state.planData.agentQuestions);
    if (status === "approved" && rounds.length > 0) {
      return { success: false, error: "Answer the agent's questions before approving" };
    }
    if (status === "answered" && countUnansweredAgentQuestions(rounds, state.agentAnswers) > 0) {
      return { success: false, error: "Answer every question first" };
    }

    const answers = buildAnswersPayload(rounds, state.agentAnswers);
    const payload: PlanFeedbackPayload =
      status === "answered"
        ? { filePath: state.filePath, status, comment: "", choices: [], questions: [], answers }
        : {
            filePath: state.filePath,
            status,
            comment: state.footerComment.trim(),
            executionMode: status === "approved" ? state.selectedExecutionMode : undefined,
            choices: buildChoicesPayload(state.decisions, state.selections),
            questions: buildQuestionsPayload(state.decisions, state.draftAnswers, state.annotations),
            answers,
          };

    set({ isSubmitting: true });
    try {
      const res = await planHost().ipc.invoke<SubmitFeedbackResult>(PlanMethods.submitFeedback, payload);
      if (!res.success) {
        set({ isSubmitting: false });
        return res;
      }

      const answeredIds = new Set(answers.map((a) => a.roundId));
      const planData: PlanPreviewData = {
        ...state.planData,
        planApproved: state.planData.planApproved || status === "approved",
        agentQuestions: state.planData.agentQuestions.map((r) =>
          answeredIds.has(r.roundId) ? { ...r, status: "answered" as const, answeredAt: new Date().toISOString() } : r,
        ),
      };

      if (status === "approved") {
        set({ isSubmitting: false, planData, phase: "approved", sentKind: null });
      } else {
        set({
          isSubmitting: false,
          planData,
          phase: "sent",
          sentKind: status === "answered" ? "answers" : "changes",
          // Sent feedback is consumed; the next round starts clean.
          ...(status === "changes_requested" ? { footerComment: "", annotations: [] } : {}),
        });
      }
      return res;
    } catch (err: any) {
      set({ isSubmitting: false });
      return { success: false, error: err?.message || "Failed to send feedback" };
    }
  },
}));
