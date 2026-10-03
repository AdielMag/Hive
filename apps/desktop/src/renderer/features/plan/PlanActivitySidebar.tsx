import React from "react";
import {
  Activity,
  Bot,
  CheckCircle,
  FileDiff,
  MessageSquare,
  Quote,
  Sparkles,
  Trash2,
} from "lucide-react";
import { usePlanStore } from "./plan-store.ts";

export const PlanActivitySidebar: React.FC = () => {
  const {
    planData,
    diffStats,
    selections,
    draftAnswers,
    annotations,
    removeAnnotation,
  } = usePlanStore();

  const choiceList = Object.entries(selections);
  const questionList = Object.entries(draftAnswers).filter(([, ans]) => ans.trim().length > 0);
  const totalCount = choiceList.length + questionList.length + annotations.length;

  const scrollToElement = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("is-highlight-flash");
      setTimeout(() => el.classList.remove("is-highlight-flash"), 1500);
    }
  };

  return (
    <aside className="plan-activity">
      <div className="plan-activity__header">
        <div className="plan-activity__title-group">
          <Activity size={13} />
          <span className="plan-activity__title">Activity</span>
        </div>
        <span className="plan-activity__badge">{totalCount}</span>
      </div>

      <div className="plan-activity__body">
        {/* Agent Revision Response Bubble */}
        {planData?.agentResponses && planData.agentResponses.length > 0 && (
          <div className="plan-activity__agent-responses">
            {planData.agentResponses.map((r, i) => (
              <div key={i} className="plan-activity__agent-bubble">
                <div className="plan-activity__agent-bubble-head">
                  <Bot size={13} className="text-accent" />
                  <span>Agent response (v{r.fileVersion})</span>
                </div>
                <p className="plan-activity__agent-bubble-text">{r.text}</p>
              </div>
            ))}
          </div>
        )}

        {/* Diff stats */}
        {(diffStats.additions > 0 || diffStats.deletions > 0) && (
          <div className="plan-activity__diff-badge">
            <FileDiff size={13} />
            <span>Plan updated:</span>
            {diffStats.additions > 0 && <span className="text-success">+{diffStats.additions} lines</span>}
            {diffStats.deletions > 0 && <span className="text-danger">-{diffStats.deletions} lines</span>}
          </div>
        )}

        {/* Empty state */}
        {totalCount === 0 && (
          <div className="plan-activity__empty">
            <MessageSquare size={24} className="text-muted" />
            <p>Pick an option, answer a question, or highlight text in the plan to start a reply.</p>
          </div>
        )}

        {/* Selected choices */}
        {choiceList.length > 0 && (
          <div className="plan-activity__section">
            <span className="plan-activity__section-label">Design Choices ({choiceList.length})</span>
            {choiceList.map(([id, sel]) => (
              <div
                key={id}
                className="plan-activity__card plan-activity__card--choice"
                onClick={() => scrollToElement(`decision-${id}`)}
              >
                <div className="plan-activity__card-head">
                  <span className="plan-activity__card-tag">{id}</span>
                  <span className="plan-activity__card-title">{sel.choiceTitle}</span>
                </div>
                <div className="plan-activity__card-value">
                  <CheckCircle size={11} className="text-success" />
                  <span>{sel.selectedText}</span>
                  {sel.isRecommended && (
                    <span className="plan-activity__card-rec" title="Recommended option">
                      <Sparkles size={9} />
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Open Question Answers */}
        {questionList.length > 0 && (
          <div className="plan-activity__section">
            <span className="plan-activity__section-label">Answers ({questionList.length})</span>
            {questionList.map(([id, ans]) => (
              <div
                key={id}
                className="plan-activity__card plan-activity__card--question"
                onClick={() => scrollToElement(`decision-${id}`)}
              >
                <div className="plan-activity__card-head">
                  <span className="plan-activity__card-tag">{id}</span>
                  <span className="plan-activity__card-title">Answer</span>
                </div>
                <p className="plan-activity__card-text">{ans}</p>
              </div>
            ))}
          </div>
        )}

        {/* Text Selection Annotations */}
        {annotations.length > 0 && (
          <div className="plan-activity__section">
            <span className="plan-activity__section-label">Notes &amp; Comments ({annotations.length})</span>
            {annotations.map((a) => (
              <div key={a.id} className="plan-activity__card plan-activity__card--annotation">
                <div className="plan-activity__card-head">
                  <Quote size={11} />
                  <span className="plan-activity__card-title">Text Note</span>
                  <button
                    type="button"
                    className="plan-activity__card-delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeAnnotation(a.id);
                    }}
                    title="Remove note"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
                <blockquote className="plan-activity__card-quote">
                  &ldquo;{a.selectedText.length > 60 ? `${a.selectedText.slice(0, 60)}…` : a.selectedText}&rdquo;
                </blockquote>
                <p className="plan-activity__card-text">{a.question}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
};
