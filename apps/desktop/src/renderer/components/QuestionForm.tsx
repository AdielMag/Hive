/**
 * Inline multi-question form requested by an extension (e.g. the `questionnaire` tool) over the Studio bridge.
 * Rendered inline in the session (above the composer) rather than in a modal dialog popup.
 */
import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { MessageCircleQuestion, X } from "lucide-react";
import type { StudioFormAnswer, StudioFormRequest } from "@hive/protocol";
import { useSessionStore } from "../store/session-store.ts";
import { EMPTY_SELECTION, buildFormAnswers, countAnswered, type FormSelection } from "../lib/question-form.ts";

export interface QuestionFormProps {
  tabId?: string | null;
}

export const QuestionForm: React.FC<QuestionFormProps> = ({ tabId }) => {
  const activeTabId = useSessionStore((s) => s.activeTabId);
  const targetTabId = tabId ?? activeTabId;
  const isCur = useSessionStore((s) => !targetTabId || s.activeTabId === targetTabId);
  const pendingForm = useSessionStore((s) =>
    (targetTabId && !isCur ? s.tabUi[targetTabId]?.pendingForm : s.pendingForm) ?? null,
  );
  const respondForm = useSessionStore((s) => s.respondForm);
  const respondTabForm = useSessionStore((s) => s.respondTabForm);

  const onRespond = React.useCallback(
    (result: { id: string; cancelled: boolean; answers: StudioFormAnswer[] }) => {
      if (targetTabId && !isCur) {
        respondTabForm(targetTabId, result);
      } else {
        respondForm(result);
      }
    },
    [targetTabId, isCur, respondTabForm, respondForm],
  );

  if (!pendingForm) return null;
  // Keyed by request id so a new form never inherits the previous form's selections.
  return <FormDialog key={pendingForm.id} form={pendingForm} onRespond={onRespond} />;
};

export const QuestionFormModal = QuestionForm;

const FormDialog: React.FC<{
  form: StudioFormRequest;
  onRespond: (r: { id: string; cancelled: boolean; answers: StudioFormAnswer[] }) => void;
}> = ({ form, onRespond }) => {
  const [selections, setSelections] = useState<Record<string, FormSelection>>({});
  const titleId = useId();
  const formRef = useRef<HTMLDivElement>(null);

  const answers = useMemo(() => buildFormAnswers(form, selections), [form, selections]);
  const answered = countAnswered(form, selections);

  const cancel = () => onRespond({ id: form.id, cancelled: true, answers: [] });
  const submit = () => {
    if (answers) onRespond({ id: form.id, cancelled: false, answers });
  };

  useEffect(() => {
    // Only focus first option if the user isn't currently typing in an input/textarea
    const active = document.activeElement;
    const isTyping = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement;
    if (!isTyping) {
      formRef.current?.querySelector<HTMLElement>("[role=radio]")?.focus();
    }
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, []);

  // Keys are handled on the form container
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      // Escape inside a filled text box just leaves the box, so typed text isn't thrown away by accident.
      if (target instanceof HTMLInputElement && target.value) target.blur();
      else cancel();
    } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      e.stopPropagation();
      submit();
    } else if (
      (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "ArrowRight" || e.key === "ArrowLeft") &&
      target.getAttribute("role") === "radio"
    ) {
      // Roving focus inside a radio group; selecting follows focus like native radios.
      const group = target.closest<HTMLElement>("[role=radiogroup]");
      const radios = [...(group?.querySelectorAll<HTMLElement>("[role=radio]") ?? [])];
      const at = radios.indexOf(target);
      if (at < 0) return;
      e.preventDefault();
      const next = radios[(at + (e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : radios.length - 1)) % radios.length]!;
      next.focus();
      next.click();
    }
  };

  const otherRefs = useRef<Record<string, HTMLInputElement | null>>({});
  // Roving tabindex: one tab stop per group (the selected radio, or the first when nothing is selected).
  const stop = (sel: FormSelection, key: number | "other", isFirst: boolean) =>
    sel.choice === key || (sel.choice === null && isFirst) ? 0 : -1;

  const pick = (qid: string, patch: Partial<FormSelection>) =>
    setSelections((prev) => ({ ...prev, [qid]: { ...(prev[qid] ?? EMPTY_SELECTION), ...patch } }));

  return (
    <div
      ref={formRef}
      className="qform"
      role="region"
      aria-labelledby={titleId}
      onKeyDown={onKeyDown}
    >
      <div className="qform__head">
        <MessageCircleQuestion size={16} className="qform__icon" />
        <span id={titleId} className="qform__title">
          {form.title || (form.questions.length > 1 ? "Questions from the agent" : "Question from the agent")}
        </span>
        {form.questions.length > 1 && (
          <span className="qform__progress">
            {answered} of {form.questions.length} answered
          </span>
        )}
        <button
          type="button"
          className="ui-btn ui-btn--ghost ui-btn--icon qform__close-btn"
          onClick={cancel}
          title="Cancel questionnaire (Esc)"
          aria-label="Cancel questionnaire"
        >
          <X size={14} />
        </button>
      </div>

      <div className="qform__body">
        {form.questions.map((q, qi) => {
          const sel = selections[q.id] ?? EMPTY_SELECTION;
          return (
            <fieldset key={q.id} className="qform__q">
              <legend className="qform__legend">
                {form.questions.length > 1 && <span className="qform__tag">{q.label || `Q${qi + 1}`}</span>}
                <span className="qform__prompt">{q.prompt}</span>
              </legend>
              <div className="qform__options" role="radiogroup" aria-label={q.prompt}>
                {q.options.map((o, oi) => (
                  <button
                    key={`${o.value}-${oi}`}
                    type="button"
                    role="radio"
                    aria-checked={sel.choice === oi}
                    tabIndex={stop(sel, oi, oi === 0)}
                    className="qform__opt"
                    onClick={() => pick(q.id, { choice: oi })}
                  >
                    <span className="qform__dot" />
                    <span className="qform__opt-text">
                      <span className="qform__opt-label">{o.label}</span>
                      {o.description && <span className="qform__opt-desc">{o.description}</span>}
                    </span>
                  </button>
                ))}
                {q.allowOther && (
                  <div
                    className="qform__opt qform__opt--other"
                    data-checked={sel.choice === "other"}
                    onClick={(e) => e.target === e.currentTarget && otherRefs.current[q.id]?.focus()}
                  >
                    <button
                      type="button"
                      role="radio"
                      aria-checked={sel.choice === "other"}
                      aria-label="Something else"
                      tabIndex={stop(sel, "other", q.options.length === 0)}
                      className="qform__dotbtn"
                      onClick={() => {
                        pick(q.id, { choice: "other" });
                        otherRefs.current[q.id]?.focus();
                      }}
                    >
                      <span className="qform__dot" />
                    </button>
                    <input
                      ref={(el) => {
                        otherRefs.current[q.id] = el;
                      }}
                      type="text"
                      className="qform__input"
                      placeholder="Something else…"
                      aria-label={`Other answer for: ${q.prompt}`}
                      value={sel.other}
                      onChange={(e) => pick(q.id, { choice: "other", other: e.target.value })}
                    />
                  </div>
                )}
              </div>
            </fieldset>
          );
        })}
      </div>

      <div className="qform__foot">
        <span className="qform__hint">Esc to cancel · Ctrl+Enter to send</span>
        <button type="button" className="ui-btn ui-btn--ghost" onClick={cancel}>
          Cancel
        </button>
        <button type="button" className="ui-btn ui-btn--primary" onClick={submit} disabled={!answers}>
          Send answers
        </button>
      </div>
    </div>
  );
};
