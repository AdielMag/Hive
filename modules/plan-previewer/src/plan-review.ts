/**
 * Pure review-state helpers (no React / store / DOM): how a decision resolves, progress, and how the feedback
 * payload is built. Selections and answers are keyed by the decision's stable `key` so they survive agent
 * revisions that reorder or insert decisions; the payload still reports the positional `D#` / `Q#` ids.
 */
import type { DecisionItem, PlanChoiceOption } from "./plan-utils.ts";
import type { PlanFeedbackPayload, PlanQuestionRound } from "./shared.ts";

export interface ChoiceSelection {
  /** Decision title at the time of picking (used when the decision is not in the current view). */
  title: string;
  /** Option name; matched against the revised options to keep the pick across revisions. */
  label: string;
  /** Full option text sent to the agent. */
  text: string;
}

/** Explicit user picks, keyed by decision key. `(x)` defaults are not stored here. */
export type ChoiceSelections = Record<string, ChoiceSelection>;
/** Answers to `[!QUESTION]` blocks, keyed by decision key. */
export type DraftAnswers = Record<string, string>;

export interface NoteLike {
  id: string;
  selectedText: string;
  question: string;
}

export interface ResolvedChoice {
  option: PlanChoiceOption;
  source: "user" | "default";
}

export function resolveChoice(d: DecisionItem, selections: ChoiceSelections): ResolvedChoice | null {
  const sel = selections[d.key];
  if (sel) {
    const opt = d.options.find((o) => o.label === sel.label) ?? d.options.find((o) => o.text === sel.text);
    if (opt) return { option: opt, source: "user" };
  }
  const def = d.options.find((o) => o.isPreselected);
  return def ? { option: def, source: "default" } : null;
}

export function isDecisionResolved(d: DecisionItem, selections: ChoiceSelections, answers: DraftAnswers): boolean {
  if (d.type === "choice") return resolveChoice(d, selections) !== null;
  return Boolean(answers[d.key]?.trim());
}

export function decisionProgress(decisions: DecisionItem[], selections: ChoiceSelections, answers: DraftAnswers) {
  const open = decisions.filter((d) => !isDecisionResolved(d, selections, answers));
  return { done: decisions.length - open.length, total: decisions.length, open };
}

/** Drops picks whose option no longer exists after a revision (the decision falls back to its default). */
export function reconcileSelections(decisions: DecisionItem[], selections: ChoiceSelections): ChoiceSelections {
  const next: ChoiceSelections = {};
  for (const [key, sel] of Object.entries(selections)) {
    const d = decisions.find((x) => x.key === key);
    if (d && !d.options.some((o) => o.label === sel.label || o.text === sel.text)) continue;
    next[key] = sel;
  }
  return next;
}

/** True when the user changed something worth sending with "Request changes". */
export function hasReviewActivity(
  decisions: DecisionItem[],
  selections: ChoiceSelections,
  answers: DraftAnswers,
  notes: NoteLike[],
  comment: string,
): boolean {
  if (comment.trim() || notes.length > 0) return true;
  if (Object.values(answers).some((a) => a.trim())) return true;
  return decisions.some((d) => {
    if (d.type !== "choice") return false;
    const r = resolveChoice(d, selections);
    return r?.source === "user" && !r.option.isPreselected;
  });
}

export function buildChoicesPayload(decisions: DecisionItem[], selections: ChoiceSelections): NonNullable<PlanFeedbackPayload["choices"]> {
  const out: NonNullable<PlanFeedbackPayload["choices"]> = [];
  const keys = new Set<string>();
  for (const d of decisions) {
    if (d.type !== "choice") continue;
    keys.add(d.key);
    const r = resolveChoice(d, selections);
    if (r) out.push({ id: d.id, title: d.title, selected: r.option.text });
  }
  // Picks made in the other view (Summary vs Full) for decisions not shown in this one.
  for (const [key, sel] of Object.entries(selections)) {
    if (!keys.has(key)) out.push({ id: key, title: sel.title, selected: sel.text });
  }
  return out;
}

export function buildQuestionsPayload(
  decisions: DecisionItem[],
  answers: DraftAnswers,
  notes: NoteLike[],
): NonNullable<PlanFeedbackPayload["questions"]> {
  const out: NonNullable<PlanFeedbackPayload["questions"]> = [];
  for (const [key, answer] of Object.entries(answers)) {
    if (!answer.trim()) continue;
    const d = decisions.find((x) => x.key === key);
    out.push({ id: d?.id ?? key, question: d?.prompt || d?.title || key, answer: answer.trim() });
  }
  for (const n of notes) out.push({ id: n.id, question: n.question, selectedText: n.selectedText });
  return out;
}

export function pendingRounds(rounds: PlanQuestionRound[] | undefined): PlanQuestionRound[] {
  return (rounds ?? []).filter((r) => r.status === "pending");
}

export function agentAnswerKey(roundId: number, questionId: string): string {
  return `${roundId}:${questionId}`;
}

export function countUnansweredAgentQuestions(rounds: PlanQuestionRound[], agentAnswers: Record<string, string>): number {
  let n = 0;
  for (const r of rounds) for (const q of r.questions) if (!agentAnswers[agentAnswerKey(r.roundId, q.id)]?.trim()) n++;
  return n;
}

export function buildAnswersPayload(
  rounds: PlanQuestionRound[],
  agentAnswers: Record<string, string>,
): NonNullable<PlanFeedbackPayload["answers"]> {
  const out: NonNullable<PlanFeedbackPayload["answers"]> = [];
  for (const r of rounds) {
    for (const q of r.questions) {
      const value = agentAnswers[agentAnswerKey(r.roundId, q.id)]?.trim();
      if (!value) continue;
      out.push({ id: q.id, roundId: r.roundId, title: q.title, selected: value, answer: value });
    }
  }
  return out;
}
