/** Pure helpers behind the question-form modal (bridge capability "ui:form"). */
import type { StudioFormAnswer, StudioFormRequest } from "@hive/protocol";

/** What the user has picked for one question: an option by index, the free-text row, or nothing yet. */
export interface FormSelection {
  choice: number | "other" | null;
  /** Text typed into the "Other" row (kept even while another option is selected). */
  other: string;
}

export const EMPTY_SELECTION: FormSelection = { choice: null, other: "" };

/** Whether a single question has a usable answer. */
export function isAnswered(sel: FormSelection | undefined, optionCount: number): boolean {
  if (!sel || sel.choice === null) return false;
  if (sel.choice === "other") return sel.other.trim().length > 0;
  return sel.choice >= 0 && sel.choice < optionCount;
}

/** Answers for every question, or null while any question is still unanswered. */
export function buildFormAnswers(
  form: StudioFormRequest,
  selections: Record<string, FormSelection>,
): StudioFormAnswer[] | null {
  const answers: StudioFormAnswer[] = [];
  for (const q of form.questions) {
    const sel = selections[q.id];
    if (!isAnswered(sel, q.options.length) || !sel) return null;
    if (sel.choice === "other") {
      const text = sel.other.trim();
      answers.push({ id: q.id, value: text, label: text, wasCustom: true });
    } else {
      const option = q.options[sel.choice as number]!;
      answers.push({ id: q.id, value: option.value, label: option.label, wasCustom: false, index: (sel.choice as number) + 1 });
    }
  }
  return answers;
}

/** Number of answered questions (for the "2 of 3" progress hint). */
export function countAnswered(form: StudioFormRequest, selections: Record<string, FormSelection>): number {
  return form.questions.filter((q) => isAnswered(selections[q.id], q.options.length)).length;
}
