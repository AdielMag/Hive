/**
 * Multi-question form requested by an extension (e.g. the `questionnaire` tool) over the Studio bridge.
 * All questions are visible at once; every one needs an answer (an option, or free text where allowed).
 */
import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { MessageCircleQuestion } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import type { StudioFormAnswer, StudioFormRequest } from "@hive/protocol";
import { useSessionStore } from "../store/session-store.ts";
import { EMPTY_SELECTION, buildFormAnswers, countAnswered, type FormSelection } from "../lib/question-form.ts";

export const QuestionFormModal: React.FC = () => {
  const { pendingForm, respondForm } = useSessionStore(useShallow((s) => ({ pendingForm: s.pendingForm, respondForm: s.respondForm })));
  if (!pendingForm) return null;
  // Keyed by request id so a new form never inherits the previous form's selections.
  return <FormDialog key={pendingForm.id} form={pendingForm} onRespond={respondForm} />;
};

const FormDialog: React.FC<{ form: StudioFormRequest; onRespond: (r: { id: string; cancelled: boolean; answers: StudioFormAnswer[] }) => void }> = ({ form, onRespond }) => {
  const [selections, setSelections] = useState<Record<string, FormSelection>>({});
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  const answers = useMemo(() => buildFormAnswers(form, selections), [form, selections]);
  const answered = countAnswered(form, selections);

  const cancel = () => onRespond({ id: form.id, cancelled: true, answers: [] });
  const submit = () => {
    if (answers) onRespond({ id: form.id, cancelled: false, answers });
  };

  useEffect(() => {
    dialogRef.current?.querySelector<HTMLElement>("[role=radio]")?.focus();
  }, []);

  // Keys are handled on the dialog (not window) so they never leak to dialogs/overlays underneath.
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
    } else if (e.key === "Tab") {
      // Focus trap: aria-modal does not stop Tab from reaching the app behind the scrim.
      const items = [...(dialogRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input, [tabindex='0']") ?? [])].filter((el) => el.tabIndex >= 0);
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && target === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && target === last) {
        e.preventDefault();
        first.focus();
      }
    } else if ((e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "ArrowRight" || e.key === "ArrowLeft") && target.getAttribute("role") === "radio") {
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
  const stop = (sel: FormSelection, key: number | "other", isFirst: boolean) => (sel.choice === key || (sel.choice === null && isFirst) ? 0 : -1);

  const pick = (qid: string, patch: Partial<FormSelection>) =>
    setSelections((prev) => ({ ...prev, [qid]: { ...(prev[qid] ?? EMPTY_SELECTION), ...patch } }));

  return (
    <div className="qform__scrim">
      <div ref={dialogRef} className="qform" role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={onKeyDown}>
        <div className="qform__head">
          <MessageCircleQuestion size={16} />
          <span id={titleId} className="qform__title">
            {form.title || (form.questions.length > 1 ? "Questions from the agent" : "Question from the agent")}
          </span>
          {form.questions.length > 1 && (
            <span className="qform__progress">
              {answered} of {form.questions.length} answered
            </span>
          )}
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
                    <div className="qform__opt qform__opt--other" data-checked={sel.choice === "other"} onClick={(e) => e.target === e.currentTarget && otherRefs.current[q.id]?.focus()}>
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
    </div>
  );
};
