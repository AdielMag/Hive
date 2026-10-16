import React, { createContext, useContext, useMemo } from "react";
import { create } from "zustand";
import {
  PlanMethods,
  type PlanExecutionMode as AgentMode,
  type PlanFeedbackPayload,
  type PlanPreviewData,
  type SubmitFeedbackResult,
} from "../shared.ts";
import {
  extractDecisions,
  extractPlanViews,
  normalizePlanPath,
  samePlanPath,
  summarizeDiff,
  type DecisionItem,
} from "../plan-utils.ts";
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

export const normalizePlanKey = (p: string): string => normalizePlanPath(p).toLowerCase();

export interface PlanSessionState {
  filePath: string;
  planData: PlanPreviewData | null;
  loading: boolean;
  error: string | null;

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
}

export function defaultPlanSession(filePath: string): PlanSessionState {
  return {
    filePath,
    planData: null,
    loading: false,
    error: null,
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
  };
}

export interface PlanSessionActions {
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
  openModal: () => void;
  refresh: () => Promise<void>;
}

export interface PlanStoreState {
  // Global reading preferences
  viewMode: PlanViewMode;
  widthMode: PlanWidthMode;
  /** null = automatic (by tab width); boolean = user override. */
  outlineOpen: boolean | null;

  /** The popup showing the full plan: stores filePath of the active modal, or null. */
  modalFilePath: string | null;

  /** Absolute plan paths the CLI announced recently (newest first). */
  recentPaths: string[];

  /** Most recently loaded / active plan path. */
  activePlanPath: string | null;

  /** Isolated state per plan file. */
  plans: Record<string, PlanSessionState>;

  // Plan loading & syncing
  loadPlan: (filePath: string, agentWaiting?: boolean) => Promise<void>;
  refresh: (filePath?: string) => Promise<void>;
  updateFromDisk: (filePath: string, content: string, fileVersion: number) => void;

  // View settings
  setViewMode: (mode: PlanViewMode) => void;
  setWidthMode: (mode: PlanWidthMode) => void;
  setOutlineOpen: (open: boolean | null) => void;
  openModal: (filePath?: string) => void;
  closeModal: () => void;
  addRecentPath: (filePath: string) => void;

  // Mutations (supports both (filePath, ...) and fallback to activePlanPath)
  selectChoice: (filePathOrDecision: string | DecisionItem, decisionOrLabel?: DecisionItem | string, optionLabel?: string) => void;
  setDraftAnswer: (filePathOrKey: string, keyOrText: string, text?: string) => void;
  addAnnotation: (filePathOrText: string, textOrQuestion: string, question?: string) => void;
  removeAnnotation: (filePathOrId: string, id?: string) => void;
  setAgentAnswer: (filePathOrKey: string, keyOrValue: string, value?: string) => void;
  setFooterComment: (filePathOrComment: string, comment?: string) => void;
  setSelectedExecutionMode: (filePathOrMode: string | AgentMode, mode?: AgentMode) => void;
  clearLastUpdate: (filePath?: string) => void;
  dismissReply: (filePathOrTimestamp: string, timestamp?: string) => void;
  submitFeedback: (filePathOrStatus: string | FeedbackStatus, status?: FeedbackStatus) => Promise<SubmitFeedbackResult>;
}

export const usePlanStore = create<PlanStoreState>((set, get) => ({
  viewMode: (readStorage(LS_VIEW) as PlanViewMode) === "summary" ? "summary" : "full",
  widthMode: readStorage(LS_WIDTH) === "wide" ? "wide" : "comfortable",
  outlineOpen: initialOutline(),

  modalFilePath: null,
  recentPaths: [],
  activePlanPath: null,
  plans: {},


  loadPlan: async (filePath: string, agentWaiting = false) => {
    const key = normalizePlanKey(filePath);
    const existing = get().plans[key];
    const samePlan = Boolean(existing && existing.planData !== null);

    set((s) => ({
      activePlanPath: filePath,
      plans: {
        ...s.plans,
        [key]: {
          ...(existing ?? defaultPlanSession(filePath)),
          loading: true,
          error: null,
        },
      },
    }));

    try {
      const data = await planHost().ipc.invoke<PlanPreviewData | null>(PlanMethods.get, filePath);
      if (!data) {
        set((s) => ({
          plans: {
            ...s.plans,
            [key]: {
              ...(s.plans[key] ?? defaultPlanSession(filePath)),
              loading: false,
              error: `Plan file not found: ${filePath}`,
            },
          },
        }));
        return;
      }

      const views = extractPlanViews(data.content);
      if (views.summary && !readStorage(LS_VIEW) && get().viewMode !== "summary") {
        set({ viewMode: "summary" });
      }
      const decisions = decisionsFor(data.content);

      const curSession = get().plans[key] ?? defaultPlanSession(filePath);
      const reset = samePlan
        ? { selections: reconcileSelections(decisions, curSession.selections) }
        : {
            selections: {},
            draftAnswers: {},
            annotations: [],
            agentAnswers: {},
            footerComment: "",
            lastUpdate: null,
            dismissedReplyAt: null,
          };

      const derived = derivePhase(data, false);
      const keepSent = !agentWaiting && samePlan && curSession.phase === "sent" && derived === "reviewing";

      set((s) => ({
        plans: {
          ...s.plans,
          [key]: {
            ...(s.plans[key] ?? defaultPlanSession(filePath)),
            ...reset,
            loading: false,
            planData: data,
            decisions,
            sentKind: keepSent ? (s.plans[key]?.sentKind ?? null) : null,
            phase: keepSent ? "sent" : derived,
          },
        },
      }));
    } catch (err: any) {
      set((s) => ({
        plans: {
          ...s.plans,
          [key]: {
            ...(s.plans[key] ?? defaultPlanSession(filePath)),
            loading: false,
            error: err?.message || "Failed to load plan",
          },
        },
      }));
    }
  },

  refresh: async (filePath?: string) => {
    const targetPath = filePath ?? get().activePlanPath;
    if (!targetPath) return;
    const key = normalizePlanKey(targetPath);
    const prevSession = get().plans[key];
    const prev = prevSession?.planData;
    if (!prev) return;
    try {
      const data = await planHost().ipc.invoke<PlanPreviewData | null>(PlanMethods.get, targetPath);
      if (!data) return;
      const decisions = decisionsFor(data.content);
      const diff = summarizeDiff(prev.content, data.content);
      set((s) => {
        const cur = s.plans[key] ?? defaultPlanSession(targetPath);
        return {
          plans: {
            ...s.plans,
            [key]: {
              ...cur,
              planData: data,
              decisions,
              selections: reconcileSelections(decisions, cur.selections),
              phase: derivePhase(data, false),
              sentKind: null,
              lastUpdate: diff.additions || diff.deletions ? { ...diff, at: Date.now() } : cur.lastUpdate,
            },
          },
        };
      });
    } catch {
      /* keep the current view */
    }
  },

  updateFromDisk: (filePath: string, content: string, fileVersion: number) => {
    const key = normalizePlanKey(filePath);
    const cur = get().plans[key];
    const prev = cur?.planData;
    if (!prev || prev.content === content) return;

    const diff = summarizeDiff(prev.content, content);
    const planData = { ...prev, content, fileVersion, updatedAt: new Date().toISOString() };
    const decisions = decisionsFor(content);

    set((s) => {
      const session = s.plans[key] ?? defaultPlanSession(filePath);
      return {
        plans: {
          ...s.plans,
          [key]: {
            ...session,
            planData,
            decisions,
            selections: reconcileSelections(decisions, session.selections),
            lastUpdate: { ...diff, at: Date.now() },
            phase: session.phase === "sent" ? derivePhase(planData, false) : session.phase,
            sentKind: session.phase === "sent" ? null : session.sentKind,
          },
        },
      };
    });
  },

  setViewMode: (viewMode) => {
    writeStorage(LS_VIEW, viewMode);
    set({ viewMode });
  },

  setWidthMode: (widthMode) => {
    writeStorage(LS_WIDTH, widthMode);
    set({ widthMode });
  },

  openModal: (filePath?: string) => {
    const target = filePath ?? get().activePlanPath;
    if (!target) return;
    const session = get().plans[normalizePlanKey(target)];
    const views = extractPlanViews(session?.planData?.content ?? "");
    set({
      modalFilePath: target,
      ...(views.summary && views.full ? { viewMode: "full" as PlanViewMode } : {}),
    });
  },

  closeModal: () => set({ modalFilePath: null }),

  addRecentPath: (filePath) =>
    set((s) => ({ recentPaths: [filePath, ...s.recentPaths.filter((p) => !samePlanPath(p, filePath))].slice(0, 8) })),

  setOutlineOpen: (outlineOpen) => {
    writeStorage(LS_OUTLINE, outlineOpen === null ? null : outlineOpen ? "show" : "hide");
    set({ outlineOpen });
  },

  selectChoice: (arg1, arg2, arg3) => {
    const filePath = typeof arg1 === "string" ? arg1 : get().activePlanPath;
    const decision = (typeof arg1 === "object" ? arg1 : arg2) as DecisionItem;
    const optionLabel = (typeof arg1 === "object" ? arg2 : arg3) as string;
    if (!filePath || !decision || !optionLabel) return;

    const opt = decision.options.find((o) => o.label === optionLabel);
    if (!opt) return;
    const key = normalizePlanKey(filePath);
    set((s) => {
      const cur = s.plans[key] ?? defaultPlanSession(filePath);
      return {
        plans: {
          ...s.plans,
          [key]: {
            ...cur,
            selections: { ...cur.selections, [decision.key]: { title: decision.title, label: opt.label, text: opt.text } },
          },
        },
      };
    });
  },

  setDraftAnswer: (arg1, arg2, arg3) => {
    const filePath = arg3 !== undefined ? arg1 : get().activePlanPath;
    const dKey = arg3 !== undefined ? arg2 : arg1;
    const text = arg3 !== undefined ? arg3 : arg2;
    if (!filePath || !dKey) return;

    const key = normalizePlanKey(filePath);
    set((s) => {
      const cur = s.plans[key] ?? defaultPlanSession(filePath);
      return {
        plans: {
          ...s.plans,
          [key]: {
            ...cur,
            draftAnswers: { ...cur.draftAnswers, [dKey]: text },
          },
        },
      };
    });
  },

  addAnnotation: (arg1, arg2, arg3) => {
    const filePath = arg3 !== undefined ? arg1 : get().activePlanPath;
    const selectedText = arg3 !== undefined ? arg2 : arg1;
    const question = arg3 !== undefined ? arg3 : arg2;
    if (!filePath) return;

    const item: PlanAnnotation = {
      id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      selectedText,
      question,
      timestamp: new Date().toISOString(),
    };
    const key = normalizePlanKey(filePath);
    set((s) => {
      const cur = s.plans[key] ?? defaultPlanSession(filePath);
      return {
        plans: {
          ...s.plans,
          [key]: {
            ...cur,
            annotations: [...cur.annotations, item],
          },
        },
      };
    });
  },

  removeAnnotation: (arg1, arg2) => {
    const filePath = arg2 !== undefined ? arg1 : get().activePlanPath;
    const id = arg2 !== undefined ? arg2 : arg1;
    if (!filePath || !id) return;

    const key = normalizePlanKey(filePath);
    set((s) => {
      const cur = s.plans[key] ?? defaultPlanSession(filePath);
      return {
        plans: {
          ...s.plans,
          [key]: {
            ...cur,
            annotations: cur.annotations.filter((a) => a.id !== id),
          },
        },
      };
    });
  },

  setAgentAnswer: (arg1, arg2, arg3) => {
    const filePath = arg3 !== undefined ? arg1 : get().activePlanPath;
    const answerKey = arg3 !== undefined ? arg2 : arg1;
    const value = arg3 !== undefined ? arg3 : arg2;
    if (!filePath || !answerKey) return;

    const key = normalizePlanKey(filePath);
    set((s) => {
      const cur = s.plans[key] ?? defaultPlanSession(filePath);
      return {
        plans: {
          ...s.plans,
          [key]: {
            ...cur,
            agentAnswers: { ...cur.agentAnswers, [answerKey]: value },
          },
        },
      };
    });
  },

  setFooterComment: (arg1, arg2) => {
    const filePath = arg2 !== undefined ? arg1 : get().activePlanPath;
    const comment = arg2 !== undefined ? arg2 : arg1;
    if (!filePath) return;

    const key = normalizePlanKey(filePath);
    set((s) => {
      const cur = s.plans[key] ?? defaultPlanSession(filePath);
      return {
        plans: {
          ...s.plans,
          [key]: { ...cur, footerComment: comment },
        },
      };
    });
  },

  setSelectedExecutionMode: (arg1, arg2) => {
    const filePath = arg2 !== undefined ? (arg1 as string) : get().activePlanPath;
    const mode = (arg2 !== undefined ? arg2 : arg1) as AgentMode;
    if (!filePath || !mode) return;

    const key = normalizePlanKey(filePath);
    set((s) => {
      const cur = s.plans[key] ?? defaultPlanSession(filePath);
      return {
        plans: {
          ...s.plans,
          [key]: { ...cur, selectedExecutionMode: mode },
        },
      };
    });
  },

  clearLastUpdate: (filePath?: string) => {
    const target = filePath ?? get().activePlanPath;
    if (!target) return;
    const key = normalizePlanKey(target);
    set((s) => {
      const cur = s.plans[key] ?? defaultPlanSession(target);
      return {
        plans: {
          ...s.plans,
          [key]: { ...cur, lastUpdate: null },
        },
      };
    });
  },

  dismissReply: (arg1, arg2) => {
    const filePath = arg2 !== undefined ? arg1 : get().activePlanPath;
    const timestamp = arg2 !== undefined ? arg2 : arg1;
    if (!filePath) return;

    const key = normalizePlanKey(filePath);
    set((s) => {
      const cur = s.plans[key] ?? defaultPlanSession(filePath);
      return {
        plans: {
          ...s.plans,
          [key]: { ...cur, dismissedReplyAt: timestamp },
        },
      };
    });
  },

  submitFeedback: async (arg1, arg2) => {
    const filePath = arg2 !== undefined ? (arg1 as string) : get().activePlanPath;
    const status = (arg2 !== undefined ? arg2 : arg1) as FeedbackStatus;
    if (!filePath) return { success: false, error: "No active plan" };

    const key = normalizePlanKey(filePath);
    const session = get().plans[key];
    if (!session || !session.planData) return { success: false, error: "No active plan" };
    if (session.isSubmitting) return { success: false, error: "Already sending" };

    const rounds = pendingRounds(session.planData.agentQuestions);
    if (status === "approved" && rounds.length > 0) {
      return { success: false, error: "Answer the agent's questions before approving" };
    }
    if (status === "answered" && countUnansweredAgentQuestions(rounds, session.agentAnswers) > 0) {
      return { success: false, error: "Answer every question first" };
    }

    const answers = buildAnswersPayload(rounds, session.agentAnswers);
    const payload: PlanFeedbackPayload =
      status === "answered"
        ? { filePath: session.filePath, status, comment: "", choices: [], questions: [], answers }
        : {
            filePath: session.filePath,
            status,
            comment: session.footerComment.trim(),
            executionMode: status === "approved" ? session.selectedExecutionMode : undefined,
            choices: buildChoicesPayload(session.decisions, session.selections),
            questions: buildQuestionsPayload(session.decisions, session.draftAnswers, session.annotations),
            answers,
          };

    set((s) => ({
      plans: {
        ...s.plans,
        [key]: {
          ...(s.plans[key] ?? session),
          isSubmitting: true,
        },
      },
    }));

    try {
      const res = await planHost().ipc.invoke<SubmitFeedbackResult>(PlanMethods.submitFeedback, payload);
      if (!res.success) {
        set((s) => ({
          plans: {
            ...s.plans,
            [key]: {
              ...(s.plans[key] ?? session),
              isSubmitting: false,
            },
          },
        }));
        return res;
      }

      const answeredIds = new Set(answers.map((a) => a.roundId));
      const planData: PlanPreviewData = {
        ...session.planData,
        planApproved: session.planData.planApproved || status === "approved",
        agentQuestions: session.planData.agentQuestions.map((r) =>
          answeredIds.has(r.roundId) ? { ...r, status: "answered" as const, answeredAt: new Date().toISOString() } : r,
        ),
      };

      set((s) => {
        const cur = s.plans[key] ?? session;
        if (status === "approved") {
          return {
            plans: {
              ...s.plans,
              [key]: {
                ...cur,
                isSubmitting: false,
                planData,
                phase: "approved",
                sentKind: null,
              },
            },
          };
        }
        return {
          plans: {
            ...s.plans,
            [key]: {
              ...cur,
              isSubmitting: false,
              planData,
              phase: "sent",
              sentKind: status === "answered" ? "answers" : "changes",
              ...(status === "changes_requested" ? { footerComment: "", annotations: [] } : {}),
            },
          },
        };
      });
      return res;
    } catch (err: any) {
      set((s) => ({
        plans: {
          ...s.plans,
          [key]: {
            ...(s.plans[key] ?? session),
            isSubmitting: false,
          },
        },
      }));
      return { success: false, error: err?.message || "Failed to send feedback" };
    }
  },
}));

const PlanContext = createContext<string | null>(null);

export const PlanProvider: React.FC<{ filePath: string; children: React.ReactNode }> = ({ filePath, children }) =>
  React.createElement(PlanContext.Provider, { value: filePath }, children);

export function usePlanContextPath(): string | null {
  return useContext(PlanContext);
}

/**
 * Hook to read and interact with an isolated plan session.
 * Uses filePathOverride if passed, else reads from PlanContext, else activePlanPath.
 */
export function usePlan(filePathOverride?: string): PlanSessionState & PlanSessionActions {
  const ctxPath = usePlanContextPath();
  const activePath = usePlanStore((s) => s.activePlanPath);
  const filePath = filePathOverride || ctxPath || activePath || "";
  const key = normalizePlanKey(filePath);

  const stored = usePlanStore((s) => s.plans[key]);
  const session = useMemo(() => stored ?? defaultPlanSession(filePath), [stored, filePath]);

  const actions = useMemo<PlanSessionActions>(
    () => ({
      selectChoice: (decision, label) => usePlanStore.getState().selectChoice(filePath, decision, label),
      setDraftAnswer: (k, text) => usePlanStore.getState().setDraftAnswer(filePath, k, text),
      addAnnotation: (text, q) => usePlanStore.getState().addAnnotation(filePath, text, q),
      removeAnnotation: (id) => usePlanStore.getState().removeAnnotation(filePath, id),
      setAgentAnswer: (k, val) => usePlanStore.getState().setAgentAnswer(filePath, k, val),
      setFooterComment: (c) => usePlanStore.getState().setFooterComment(filePath, c),
      setSelectedExecutionMode: (m) => usePlanStore.getState().setSelectedExecutionMode(filePath, m),
      clearLastUpdate: () => usePlanStore.getState().clearLastUpdate(filePath),
      dismissReply: (t) => usePlanStore.getState().dismissReply(filePath, t),
      submitFeedback: (status) => usePlanStore.getState().submitFeedback(filePath, status),
      openModal: () => usePlanStore.getState().openModal(filePath),
      refresh: () => usePlanStore.getState().refresh(filePath),
    }),
    [filePath],
  );

  return { ...session, ...actions };
}
