import React, { useState } from "react";
import { Check, ChevronDown, ChevronRight, HelpCircle, Layers, RotateCcw, Sparkles } from "lucide-react";
import { usePlanStore } from "./plan-store.ts";
import type { DecisionItem } from "../plan-utils.ts";

export const PlanDecisions: React.FC = () => {
  const { decisions, selections, draftAnswers, selectChoice, clearChoice, setDraftAnswer } = usePlanStore();
  const [collapsedTray, setCollapsedTray] = useState(false);
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});

  if (decisions.length === 0) return null;

  const total = decisions.length;
  const answered = decisions.filter((d) => {
    if (d.type === "choice") return Boolean(selections[d.id]);
    if (d.type === "question") return Boolean(draftAnswers[d.id]?.trim());
    return false;
  }).length;

  const toggleCard = (id: string) => {
    setExpandedCards((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="plan-decisions-tray">
      <div className="plan-decisions-tray__head" onClick={() => setCollapsedTray((prev) => !prev)}>
        <div className="plan-decisions-tray__title-group">
          <button type="button" className="plan-decisions-tray__toggle">
            {collapsedTray ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          </button>
          <Layers size={14} className="plan-decisions-tray__icon" />
          <span className="plan-decisions-tray__title">Decisions &amp; Choices</span>
          <span className="plan-decisions-tray__badge">
            {answered} of {total} resolved
          </span>
        </div>
      </div>

      {!collapsedTray && (
        <div className="plan-decisions-tray__body">
          {decisions.map((item) => (
            <DecisionCard
              key={item.id}
              item={item}
              selectedOption={selections[item.id]?.selectedText}
              draftAnswer={draftAnswers[item.id] || ""}
              isExpanded={expandedCards[item.id] ?? true}
              onToggle={() => toggleCard(item.id)}
              onSelectChoice={(opt, isRec) => selectChoice(item.id, item.title, opt, isRec)}
              onClearChoice={() => clearChoice(item.id)}
              onAnswerQuestion={(val) => setDraftAnswer(item.id, val)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

interface CardProps {
  item: DecisionItem;
  selectedOption?: string;
  draftAnswer: string;
  isExpanded: boolean;
  onToggle: () => void;
  onSelectChoice: (opt: string, isRecommended: boolean) => void;
  onClearChoice: () => void;
  onAnswerQuestion: (val: string) => void;
}

const DecisionCard: React.FC<CardProps> = ({
  item,
  selectedOption,
  draftAnswer,
  isExpanded,
  onToggle,
  onSelectChoice,
  onClearChoice,
  onAnswerQuestion,
}) => {
  const isChoice = item.type === "choice";
  const isResolved = isChoice ? Boolean(selectedOption) : Boolean(draftAnswer.trim());

  return (
    <div className={`plan-decision-card${isResolved ? " is-resolved" : ""}`} id={`decision-${item.id}`}>
      <div className="plan-decision-card__head" onClick={onToggle}>
        <div className="plan-decision-card__tag">
          <span className={`plan-decision-card__badge plan-decision-card__badge--${item.type}`}>
            {item.id}
          </span>
          <span className="plan-decision-card__title">{item.title}</span>
        </div>

        <div className="plan-decision-card__meta">
          {isResolved ? (
            <span className="plan-decision-card__chip plan-decision-card__chip--resolved">
              <Check size={10} />
              <span>Resolved</span>
            </span>
          ) : (
            <span className="plan-decision-card__chip plan-decision-card__chip--unresolved">
              <HelpCircle size={10} />
              <span>Needs Decision</span>
            </span>
          )}
          <button type="button" className="plan-decision-card__chevron">
            {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="plan-decision-card__body">
          {item.prompt && <p className="plan-decision-card__prompt">{item.prompt}</p>}

          {isChoice ? (
            <div className="plan-decision-card__options" role="radiogroup">
              {item.options.map((opt, i) => {
                const isSelected = selectedOption === opt.label;
                return (
                  <div
                    key={i}
                    role="radio"
                    aria-checked={isSelected}
                    className={`plan-decision-opt${isSelected ? " is-selected" : ""}${opt.isRecommended ? " is-recommended" : ""}`}
                    onClick={() => onSelectChoice(opt.label, opt.isRecommended)}
                  >
                    <div className="plan-decision-opt__radio">
                      <div className="plan-decision-opt__dot" />
                    </div>
                    <div className="plan-decision-opt__content">
                      <span className="plan-decision-opt__label">{opt.label}</span>
                      {opt.isRecommended && (
                        <span className="plan-decision-opt__rec-tag">
                          <Sparkles size={9} />
                          <span>Recommended</span>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}

              {selectedOption && (
                <div className="plan-decision-card__footer">
                  <button type="button" className="plan-decision-card__clear-btn" onClick={onClearChoice}>
                    <RotateCcw size={11} />
                    <span>Clear selection</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="plan-decision-card__question">
              <textarea
                className="plan-decision-card__input"
                placeholder="Type your answer or requirement here..."
                rows={2}
                value={draftAnswer}
                onChange={(e) => onAnswerQuestion(e.target.value)}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};
