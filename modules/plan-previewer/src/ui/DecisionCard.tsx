import React, { useRef, useState } from "react";
import { Check } from "lucide-react";
import type { DecisionItem } from "../plan-utils.ts";
import { resolveChoice } from "../plan-review.ts";
import { usePlanStore } from "./plan-store.ts";
import { InlineText } from "./InlineText.tsx";

interface Props {
  item: DecisionItem;
  readOnly: boolean;
  /** Prefix for DOM ids, so the inline card and the popup never share one. */
  scope?: string;
}

/** One inline decision ([!CHOICE] radio group or [!QUESTION] answer). Resolved cards fold to a single line. */
export const DecisionCard: React.FC<Props> = ({ item, readOnly, scope = "" }) => {
  const selections = usePlanStore((s) => s.selections);
  const answer = usePlanStore((s) => s.draftAnswers[item.key] ?? "");
  const selectChoice = usePlanStore((s) => s.selectChoice);
  const setDraftAnswer = usePlanStore((s) => s.setDraftAnswer);

  const [editing, setEditing] = useState(false);
  const rootRef = useRef<HTMLElement>(null);
  const changeRef = useRef<HTMLButtonElement>(null);
  const radioRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const isChoice = item.type === "choice";
  const resolved = isChoice ? resolveChoice(item, selections) : null;
  const isResolved = isChoice ? resolved !== null : answer.trim().length > 0;
  const expanded = !readOnly && (!isResolved || editing);
  const titleId = `${scope}decision-${item.key}-title`;

  const fold = () => {
    setEditing(false);
    requestAnimationFrame(() => changeRef.current?.focus());
  };

  const openEditor = () => {
    setEditing(true);
    requestAnimationFrame(() => {
      const root = rootRef.current;
      const target = root?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"], [role="radio"], textarea');
      target?.focus();
    });
  };

  const onBlurCard = (e: React.FocusEvent) => {
    if (!rootRef.current?.contains(e.relatedTarget as Node | null)) setEditing(false);
  };

  // Roving radio group: arrows move + select, digits pick, Enter/Space confirm and fold.
  const onRadioKeyDown = (e: React.KeyboardEvent, index: number) => {
    const n = item.options.length;
    let next = -1;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") next = (index + 1) % n;
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") next = (index - 1 + n) % n;
    else if (/^[1-9]$/.test(e.key) && Number(e.key) <= n) next = Number(e.key) - 1;
    if (next >= 0) {
      e.preventDefault();
      setEditing(true);
      selectChoice(item, item.options[next]!.label);
      radioRefs.current[next]?.focus();
    }
  };

  const meta = (
    <span className="plan-decision__tag" aria-hidden="true">
      {item.id}
    </span>
  );

  if (!expanded) {
    const value = isChoice ? resolved?.option.label : answer.trim();
    return (
      <section ref={rootRef} className="plan-decision is-folded" id={`${scope}decision-${item.key}`} data-decision-key={item.key}>
        <div className="plan-decision__line">
          {isResolved ? <Check size={13} className="plan-decision__ok" aria-hidden="true" /> : <span className="plan-decision__dot" />}
          {meta}
          <span className="plan-decision__title" id={titleId}>
            <InlineText text={item.title} />
          </span>
          {isResolved && (
            <>
              <span className="plan-decision__arrow" aria-hidden="true">
                →
              </span>
              <span className="plan-decision__value" title={value}>
                {isChoice ? <InlineText text={value ?? ""} /> : value}
              </span>
              {resolved?.source === "default" && <span className="plan-decision__hint">agent default</span>}
            </>
          )}
          {!isResolved && <span className="plan-decision__hint">Not decided</span>}
          {!readOnly && (
            <button
              ref={changeRef}
              type="button"
              className="ui-btn ui-btn--ghost ui-btn--sm plan-decision__change"
              onClick={openEditor}
              aria-label={`Change ${item.title}`}
            >
              Change
            </button>
          )}
        </div>
      </section>
    );
  }

  return (
    <section
      ref={rootRef}
      className={`plan-decision${isResolved ? " is-resolved" : " is-open"}`}
      id={`${scope}decision-${item.key}`}
      data-decision-key={item.key}
      aria-labelledby={titleId}
      onFocus={() => setEditing(true)}
      onBlur={onBlurCard}
    >
      <div className="plan-decision__head">
        {meta}
        <span className="plan-decision__title" id={titleId}>
          <InlineText text={item.title} />
        </span>
        <span className={`plan-decision__state${isResolved ? " is-done" : ""}`}>
          {isResolved ? "Decided" : isChoice ? "Needs decision" : "Needs answer"}
        </span>
      </div>
      {item.prompt && (
        <p className="plan-decision__prompt">
          <InlineText text={item.prompt} />
        </p>
      )}

      {isChoice ? (
        <div className="plan-decision__options" role="radiogroup" aria-labelledby={titleId}>
          {item.options.map((opt, i) => {
            const checked = resolved?.option.label === opt.label;
            const tabbable = resolved ? checked : i === 0;
            return (
              <button
                key={`${opt.label}-${i}`}
                ref={(el) => {
                  radioRefs.current[i] = el;
                }}
                type="button"
                role="radio"
                aria-checked={checked}
                tabIndex={tabbable ? 0 : -1}
                className="plan-option"
                onClick={() => {
                  selectChoice(item, opt.label);
                  fold();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    selectChoice(item, opt.label);
                    fold();
                  } else onRadioKeyDown(e, i);
                }}
              >
                <span className="plan-option__radio" aria-hidden="true" />
                <span className="plan-option__body">
                  <span className="plan-option__label">
                    <InlineText text={opt.label} />
                  </span>
                  {opt.detail && (
                    <span className="plan-option__detail">
                      <InlineText text={opt.detail} />
                    </span>
                  )}
                </span>
                {opt.isRecommended && <span className="plan-option__rec">Recommended</span>}
              </button>
            );
          })}
          {resolved?.source === "default" && (
            <p className="plan-decision__note">The agent pre-selected its default; pick another option to override it.</p>
          )}
        </div>
      ) : (
        <textarea
          className="plan-input"
          rows={2}
          placeholder="Your answer…"
          aria-labelledby={titleId}
          value={answer}
          onChange={(e) => setDraftAnswer(item.key, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && answer.trim()) {
              e.preventDefault();
              fold();
            }
          }}
        />
      )}
    </section>
  );
};
