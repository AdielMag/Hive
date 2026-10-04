import React from "react";
import { MessageCircleQuestion } from "lucide-react";
import type { PlanAgentQuestion, PlanQuestionRound } from "../shared.ts";
import { agentAnswerKey } from "../plan-review.ts";
import { usePlanStore } from "./plan-store.ts";

interface Props {
  rounds: PlanQuestionRound[];
}

/** Agent `--ask` questions, pinned at the top of the document while they are pending. */
export const PlanAskCard: React.FC<Props> = ({ rounds }) => {
  const agentAnswers = usePlanStore((s) => s.agentAnswers);
  const setAgentAnswer = usePlanStore((s) => s.setAgentAnswer);
  const total = rounds.reduce((n, r) => n + r.questions.length, 0);
  if (total === 0) return null;

  return (
    <section className="plan-ask" id="plan-ask" aria-labelledby="plan-ask-title">
      <div className="plan-ask__head">
        <MessageCircleQuestion size={15} aria-hidden="true" />
        <span id="plan-ask-title">
          The agent needs your input {total > 1 ? `(${total} questions)` : ""}
        </span>
      </div>
      {rounds.flatMap((round) =>
        round.questions.map((q) => (
          <AskQuestion
            key={`${round.roundId}-${q.id}`}
            question={q}
            value={agentAnswers[agentAnswerKey(round.roundId, q.id)] ?? ""}
            onChange={(v) => setAgentAnswer(agentAnswerKey(round.roundId, q.id), v)}
            idBase={`ask-${round.roundId}-${q.id}`}
          />
        )),
      )}
    </section>
  );
};

const AskQuestion: React.FC<{
  question: PlanAgentQuestion;
  value: string;
  onChange: (v: string) => void;
  idBase: string;
}> = ({ question: q, value, onChange, idBase }) => {
  const options = q.type === "choice" ? (q.options ?? []) : [];
  const isOption = options.some((o) => o.value === value);
  const labelId = `${idBase}-label`;

  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    const n = options.length;
    let next = -1;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") next = (index + 1) % n;
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") next = (index - 1 + n) % n;
    if (next < 0) return;
    e.preventDefault();
    onChange(options[next]!.value);
    const group = (e.currentTarget as HTMLElement).parentElement;
    group?.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus();
  };

  return (
    <div className="plan-ask__item">
      <p className="plan-ask__prompt" id={labelId}>
        {q.title && <strong>{q.title}. </strong>}
        {q.question}
      </p>
      {options.length > 0 && (
        <div className="plan-decision__options" role="radiogroup" aria-labelledby={labelId}>
          {options.map((opt, i) => {
            const checked = value === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={checked}
                tabIndex={checked || (!isOption && i === 0) ? 0 : -1}
                className="plan-option"
                onClick={() => onChange(opt.value)}
                onKeyDown={(e) => onKeyDown(e, i)}
              >
                <span className="plan-option__radio" aria-hidden="true" />
                <span className="plan-option__body">
                  <span className="plan-option__label">{opt.label}</span>
                  {opt.description && <span className="plan-option__detail">{opt.description}</span>}
                </span>
                {opt.recommended && <span className="plan-option__rec">Recommended</span>}
              </button>
            );
          })}
        </div>
      )}
      {(options.length === 0 || q.allowOther !== false) && (
        <input
          type="text"
          className="plan-input"
          aria-labelledby={labelId}
          placeholder={options.length > 0 ? "Or type another answer…" : "Your answer…"}
          value={isOption ? "" : value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
};
