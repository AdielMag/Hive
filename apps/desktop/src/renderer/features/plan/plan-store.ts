import { create } from "zustand";
import type { AgentMode, PlanFeedbackPayload, PlanPreviewData } from "@hive/protocol";
import { extractDecisions, extractPlanViews, summarizeDiff, type DecisionItem } from "./plan-utils.ts";

export type PlanViewMode = "summary" | "full";
export type PlanWidthMode = "comfortable" | "wide" | "full";

export interface PlanAnnotation {
  id: string;
  selectedText: string;
  question: string;
  timestamp: string;
}

export interface PlanChoiceSelection {
  choiceTitle: string;
  selectedText: string;
  isRecommended?: boolean;
}

interface PlanState {
  filePath: string | null;
  planData: PlanPreviewData | null;
  previousContent: string | null;
  diffStats: { additions: number; deletions: number };
  loading: boolean;
  error: string | null;

  viewMode: PlanViewMode;
  widthMode: PlanWidthMode;
  collapseLeft: boolean;
  collapseRight: boolean;

  decisions: DecisionItem[];
  selections: Record<string, PlanChoiceSelection>;
  draftAnswers: Record<string, string>; // for open questions
  annotations: PlanAnnotation[];
  agentAnswers: Record<string, string>; // for agent --ask questions
  footerComment: string;
  selectedExecutionMode: AgentMode; // "auto-edit" | "manual"

  toastMessage: string | null;
  isSubmitting: boolean;
  isApproved: boolean;

  // Actions
  loadPlan: (filePath: string) => Promise<void>;
  updateFromDisk: (content: string, fileVersion: number) => void;
  setViewMode: (mode: PlanViewMode) => void;
  setWidthMode: (mode: PlanWidthMode) => void;
  toggleLeftSidebar: () => void;
  toggleRightSidebar: () => void;

  selectChoice: (decisionId: string, choiceTitle: string, selectedText: string, isRecommended?: boolean) => void;
  clearChoice: (decisionId: string) => void;
  setDraftAnswer: (questionId: string, text: string) => void;

  addAnnotation: (selectedText: string, question: string) => void;
  removeAnnotation: (id: string) => void;

  setAgentAnswer: (questionId: string, value: string) => void;
  setFooterComment: (comment: string) => void;
  setSelectedExecutionMode: (mode: AgentMode) => void;

  clearToast: () => void;
  submitFeedback: (status: "approved" | "changes_requested") => Promise<{ success: boolean; error?: string }>;
}

export const usePlanStore = create<PlanState>((set, get) => ({
  filePath: null,
  planData: null,
  previousContent: null,
  diffStats: { additions: 0, deletions: 0 },
  loading: false,
  error: null,

  viewMode: (localStorage.getItem("hive-plan-view-mode") as PlanViewMode) || "full",
  widthMode: (localStorage.getItem("hive-plan-width-mode") as PlanWidthMode) || "wide",
  collapseLeft: localStorage.getItem("hive-plan-collapse-left") === "true",
  collapseRight: localStorage.getItem("hive-plan-collapse-right") === "true",

  decisions: [],
  selections: {},
  draftAnswers: {},
  annotations: [],
  agentAnswers: {},
  footerComment: "",
  selectedExecutionMode: "auto-edit",

  toastMessage: null,
  isSubmitting: false,
  isApproved: false,

  loadPlan: async (filePath: string) => {
    set({ loading: true, error: null, filePath });
    try {
      const data = await window.studio.getPlanData(filePath);
      if (!data) {
        set({ loading: false, error: `Plan file not found: ${filePath}` });
        return;
      }

      const views = extractPlanViews(data.content);
      // Auto-default to summary view if summary section exists
      let preferredView: PlanViewMode = get().viewMode;
      if (views.summary && !localStorage.getItem("hive-plan-view-mode")) {
        preferredView = "summary";
      }

      const decisions = extractDecisions(data.content);
      // Pre-select any decisions that had (x) in markdown
      const initialSelections: Record<string, PlanChoiceSelection> = {};
      decisions.forEach((d) => {
        if (d.type === "choice") {
          const pre = d.options.find((o) => o.isPreselected);
          if (pre) {
            initialSelections[d.id] = {
              choiceTitle: d.title,
              selectedText: pre.label,
              isRecommended: pre.isRecommended,
            };
          }
        }
      });

      set({
        loading: false,
        planData: data,
        previousContent: data.content,
        decisions,
        selections: initialSelections,
        viewMode: preferredView,
        isApproved: data.planApproved,
      });
    } catch (err: any) {
      set({ loading: false, error: err.message || "Failed to load plan" });
    }
  },

  updateFromDisk: (content: string, fileVersion: number) => {
    const prev = get().planData;
    if (!prev) return;

    const diff = summarizeDiff(prev.content, content);
    const updatedDecisions = extractDecisions(content);

    set({
      planData: {
        ...prev,
        content,
        fileVersion,
        updatedAt: new Date().toISOString(),
      },
      decisions: updatedDecisions,
      diffStats: diff,
      toastMessage: "✨ Plan updated live by agent",
    });
  },

  setViewMode: (viewMode) => {
    localStorage.setItem("hive-plan-view-mode", viewMode);
    set({ viewMode });
  },

  setWidthMode: (widthMode) => {
    localStorage.setItem("hive-plan-width-mode", widthMode);
    set({ widthMode });
  },

  toggleLeftSidebar: () => {
    set((s) => {
      const next = !s.collapseLeft;
      localStorage.setItem("hive-plan-collapse-left", String(next));
      return { collapseLeft: next };
    });
  },

  toggleRightSidebar: () => {
    set((s) => {
      const next = !s.collapseRight;
      localStorage.setItem("hive-plan-collapse-right", String(next));
      return { collapseRight: next };
    });
  },

  selectChoice: (decisionId, choiceTitle, selectedText, isRecommended) => {
    set((s) => ({
      selections: {
        ...s.selections,
        [decisionId]: { choiceTitle, selectedText, isRecommended },
      },
    }));
  },

  clearChoice: (decisionId) => {
    set((s) => {
      const next = { ...s.selections };
      delete next[decisionId];
      return { selections: next };
    });
  },

  setDraftAnswer: (questionId, text) => {
    set((s) => ({
      draftAnswers: { ...s.draftAnswers, [questionId]: text },
    }));
  },

  addAnnotation: (selectedText, question) => {
    const item: PlanAnnotation = {
      id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      selectedText,
      question,
      timestamp: new Date().toISOString(),
    };
    set((s) => ({
      annotations: [item, ...s.annotations],
      collapseRight: false, // reveal activity sidebar
    }));
  },

  removeAnnotation: (id) => {
    set((s) => ({
      annotations: s.annotations.filter((a) => a.id !== id),
    }));
  },

  setAgentAnswer: (questionId, value) => {
    set((s) => ({
      agentAnswers: { ...s.agentAnswers, [questionId]: value },
    }));
  },

  setFooterComment: (footerComment) => set({ footerComment }),

  setSelectedExecutionMode: (selectedExecutionMode) => set({ selectedExecutionMode }),

  clearToast: () => set({ toastMessage: null }),

  submitFeedback: async (status) => {
    const state = get();
    if (!state.filePath) return { success: false, error: "No active plan" };

    set({ isSubmitting: true });

    // Format choices
    const choices = Object.entries(state.selections).map(([id, sel]) => ({
      id,
      title: sel.choiceTitle,
      selected: sel.selectedText,
    }));

    // Format questions & answers
    const questions = [
      ...Object.entries(state.draftAnswers).map(([id, ans]) => ({
        id,
        question: state.decisions.find((d) => d.id === id)?.prompt || id,
        answer: ans,
      })),
      ...state.annotations.map((a) => ({
        id: a.id,
        question: a.question,
        selectedText: a.selectedText,
      })),
    ];

    // Format agent questions answers
    const answers = Object.entries(state.agentAnswers).map(([qid, val]) => ({
      id: qid,
      selected: val,
      answer: val,
    }));

    const payload: PlanFeedbackPayload = {
      filePath: state.filePath,
      status,
      comment: state.footerComment.trim(),
      executionMode: status === "approved" ? state.selectedExecutionMode : undefined,
      choices,
      questions,
      answers,
    };

    try {
      const res = await window.studio.submitPlanFeedback(payload);
      if (res.success && status === "approved") {
        set({ isApproved: true });
      }
      set({ isSubmitting: false });
      return res;
    } catch (err: any) {
      set({ isSubmitting: false });
      return { success: false, error: err.message };
    }
  },
}));
