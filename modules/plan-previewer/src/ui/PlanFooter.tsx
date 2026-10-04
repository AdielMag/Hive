import React, { useState } from "react";
import {
  Check,
  CheckCircle,
  ChevronDown,
  HelpCircle,
  Loader2,
  RotateCcw,
  Sparkles,
  UserCheck,
} from "lucide-react";
import { usePlanStore } from "./plan-store.ts";
import { planHost } from "./plan-host.ts";

export const PlanFooter: React.FC = () => {
  const {
    planData,
    selections,
    draftAnswers,
    annotations,
    agentAnswers,
    footerComment,
    selectedExecutionMode,
    isSubmitting,
    isApproved,
    setAgentAnswer,
    setFooterComment,
    setSelectedExecutionMode,
    submitFeedback,
  } = usePlanStore();

  const [modeDropdownOpen, setModeDropdownOpen] = useState(false);

  const hasActivity =
    Object.keys(selections).length > 0 ||
    Object.values(draftAnswers).some((v) => v.trim().length > 0) ||
    annotations.length > 0 ||
    footerComment.trim().length > 0;

  // Pending agent --ask questions
  const pendingAskRounds = planData?.agentQuestions?.filter((r) => r.status === "pending") ?? [];

  const handleApprove = async () => {
    // Also switch Hive's active session mode to the selected execution mode
    planHost().sessions.setMode(selectedExecutionMode);
    await submitFeedback("approved");
  };

  const handleRequestChanges = async () => {
    await submitFeedback("changes_requested");
  };

  return (
    <footer className="plan-footer">
      {/* Agent --ask questionnaire takeover strip if present */}
      {pendingAskRounds.length > 0 && (
        <div className="plan-footer__ask-panel">
          <div className="plan-footer__ask-head">
            <HelpCircle size={14} className="text-accent" />
            <span className="plan-footer__ask-title">The agent needs your input before proceeding:</span>
          </div>

          <div className="plan-footer__ask-body">
            {pendingAskRounds.flatMap((round) =>
              round.questions.map((q) => {
                const currentVal = agentAnswers[q.id] || "";
                return (
                  <div key={`${round.roundId}-${q.id}`} className="plan-footer__ask-item">
                    <p className="plan-footer__ask-prompt">
                      <strong>{q.title || "Question"}:</strong> {q.question}
                    </p>

                    {q.type === "choice" && q.options && q.options.length > 0 ? (
                      <div className="plan-footer__ask-options" role="radiogroup">
                        {q.options.map((opt) => {
                          const isPicked = currentVal === opt.value;
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              role="radio"
                              aria-checked={isPicked}
                              className={`plan-footer__ask-opt${isPicked ? " is-picked" : ""}`}
                              onClick={() => setAgentAnswer(q.id, opt.value)}
                            >
                              <span className="plan-footer__ask-opt-dot" />
                              <span>{opt.label}</span>
                              {opt.recommended && <span className="plan-footer__ask-rec">[Recommended]</span>}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <input
                        type="text"
                        className="plan-footer__ask-input"
                        placeholder="Type your answer here..."
                        value={currentVal}
                        onChange={(e) => setAgentAnswer(q.id, e.target.value)}
                      />
                    )}
                  </div>
                );
              }),
            )}
          </div>
        </div>
      )}

      {/* Main feedback row */}
      <div className="plan-footer__row">
        <textarea
          className="plan-footer__comment"
          placeholder="Overall comments for the agent — feedback, questions, or specific adjustments needed…"
          rows={2}
          value={footerComment}
          onChange={(e) => setFooterComment(e.target.value)}
        />

        <div className="plan-footer__actions">
          {/* Request changes button */}
          <button
            type="button"
            className="plan-footer__btn plan-footer__btn--changes"
            disabled={!hasActivity || isSubmitting || isApproved}
            onClick={handleRequestChanges}
            title={hasActivity ? "Transmit changes back to agent" : "Pick an option or add a comment first"}
          >
            {isSubmitting ? (
              <Loader2 size={13} className="spin" />
            ) : (
              <RotateCcw size={13} />
            )}
            <span>Request changes</span>
          </button>

          {/* Mode selector & Approve button */}
          <div className="plan-footer__approve-group">
            <div className="plan-footer__mode-select">
              <span className="plan-footer__mode-label">Mode on approval:</span>
              <button
                type="button"
                className="plan-footer__mode-btn"
                onClick={() => setModeDropdownOpen((v) => !v)}
                title="Select execution mode the agent should transition to"
              >
                {selectedExecutionMode === "auto-edit" ? (
                  <>
                    <Sparkles size={12} className="text-success" />
                    <span>Auto Edit</span>
                  </>
                ) : (
                  <>
                    <UserCheck size={12} className="text-info" />
                    <span>Manual</span>
                  </>
                )}
                <ChevronDown size={11} />
              </button>

              {modeDropdownOpen && (
                <div className="plan-footer__mode-dropdown">
                  <div
                    className={`plan-footer__mode-item${selectedExecutionMode === "auto-edit" ? " is-active" : ""}`}
                    onClick={() => {
                      setSelectedExecutionMode("auto-edit");
                      setModeDropdownOpen(false);
                    }}
                  >
                    <div className="plan-footer__mode-item-title">
                      <Sparkles size={12} className="text-success" />
                      <strong>Auto Edit</strong>
                    </div>
                    <span className="plan-footer__mode-item-desc">Autonomous agent execution and file edits</span>
                  </div>

                  <div
                    className={`plan-footer__mode-item${selectedExecutionMode === "manual" ? " is-active" : ""}`}
                    onClick={() => {
                      setSelectedExecutionMode("manual");
                      setModeDropdownOpen(false);
                    }}
                  >
                    <div className="plan-footer__mode-item-title">
                      <UserCheck size={12} className="text-info" />
                      <strong>Manual</strong>
                    </div>
                    <span className="plan-footer__mode-item-desc">Propose diffs and request confirmation for each step</span>
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              className={`plan-footer__btn plan-footer__btn--approve${isApproved ? " is-approved" : ""}`}
              disabled={isSubmitting || isApproved}
              onClick={handleApprove}
            >
              {isSubmitting ? (
                <Loader2 size={14} className="spin" />
              ) : isApproved ? (
                <CheckCircle size={14} />
              ) : (
                <Check size={14} />
              )}
              <span>{isApproved ? "Plan Approved" : "Approve plan"}</span>
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
};
