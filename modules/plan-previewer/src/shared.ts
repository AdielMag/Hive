/**
 * Contract between the plan-previewer module's main and renderer halves (and the only file other modules may
 * import). Transported over the generic module bridge: `mod:plan-previewer:<method>`.
 */

export const MODULE_ID = "plan-previewer";
export const PLAN_TAB_KIND = "plan";

/** Renderer → main methods (`host.ipc.invoke`). */
export const PlanMethods = {
  get: "getPlanData",
  submitFeedback: "submitFeedback",
  save: "savePlanContent",
} as const;

/** Main → renderer events (`host.ipc.on`). */
export const PlanEvents = {
  openTab: "openPlanTab",
  updated: "planUpdated",
} as const;

export interface PlanAgentQuestionOption {
  value: string;
  label: string;
  description?: string;
  recommended?: boolean;
}

export interface PlanAgentQuestion {
  id: string;
  type?: "text" | "choice";
  title?: string;
  question: string;
  options?: PlanAgentQuestionOption[];
  allowOther?: boolean;
}

export interface PlanQuestionRound {
  roundId: number;
  status: "pending" | "answered";
  fileVersion: number;
  questions: PlanAgentQuestion[];
  answers?: Array<{ id: string; selected?: string; answer?: string; title?: string }>;
  timestamp: string;
  answeredAt?: string;
}

export interface PlanAgentResponse {
  text: string;
  timestamp: string;
  fileVersion: number;
}

export interface PlanPreviewData {
  filename: string;
  filePath: string;
  content: string;
  fileVersion: number;
  createdAt: string;
  updatedAt: string;
  callerAgent?: { id: string; name: string };
  sessionContext?: string;
  agentResponses: PlanAgentResponse[];
  agentQuestions: PlanQuestionRound[];
  planApproved: boolean;
}

/** Agent mode chosen on approval ("auto-edit" | "manual"). Mirrors core's AgentMode strings. */
export type PlanExecutionMode = "plan" | "auto-edit" | "manual" | "debug" | "ask";

export interface PlanFeedbackPayload {
  filePath: string;
  status: "approved" | "changes_requested" | "answered";
  comment?: string;
  executionMode?: PlanExecutionMode;
  questions?: Array<{ id: string; question: string; answer?: string; selectedText?: string }>;
  choices?: Array<{ id: string; title: string; selected?: string; answer?: string }>;
  answers?: Array<{ id: string; roundId?: number; selected?: string; answer?: string; title?: string }>;
  content?: string;
}

export interface OpenPlanTabEvent {
  filePath: string;
  context?: string;
}

export interface PlanUpdatedEvent {
  filePath: string;
  fileVersion: number;
  content?: string;
}

export type SubmitFeedbackResult = { success: boolean; error?: string };
export type SavePlanResult = { success: boolean; fileVersion: number; error?: string };
