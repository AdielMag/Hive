import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, MessageSquare, Trash2 } from "lucide-react";
import { countUnansweredAgentQuestions, decisionProgress, hasReviewActivity, pendingRounds } from "../plan-review.ts";
import { usePlanStore, type FeedbackStatus, type PlanAnnotation } from "./plan-store.ts";
import { PlanMenu } from "./PlanMenu.tsx";
import { planHost } from "./plan-host.ts";

interface Props {
  onJumpToDecision: (key: string) => void;
  onJumpToNote: (note: PlanAnnotation) => void;
  onJumpToAsk: () => void;
}

const MODE_LABEL = { "auto-edit": "Auto Edit", manual: "Manual" } as Record<string, string>;
const MAX_ROWS = 6;

/** The single action surface: comment, progress, notes, Request changes, Approve / Send answers, and states. */
export const PlanReviewBar: React.FC<Props> = ({ onJumpToDecision, onJumpToNote, onJumpToAsk }) => {
  const s = usePlanStore();
  const { phase, isSubmitting, footerComment, selectedExecutionMode } = s;
  const commentRef = useRef<HTMLTextAreaElement>(null);

  const progress = decisionProgress(s.decisions, s.selections, s.draftAnswers);
  const rounds = pendingRounds(s.planData?.agentQuestions);
  const unanswered = countUnansweredAgentQuestions(rounds, s.agentAnswers);
  const canRequest = hasReviewActivity(s.decisions, s.selections, s.draftAnswers, s.annotations, footerComment);

  useLayoutEffect(() => {
    const el = commentRef.current;
    if (!el) return;
    const cs = getComputedStyle(el);
    const line = parseFloat(cs.lineHeight) || 20;
    const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const border = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight + border, line * MAX_ROWS + pad + border)}px`;
  }, [footerComment, phase]);

  const submit = async (status: FeedbackStatus) => {
    if (status === "approved") planHost().sessions.setMode(selectedExecutionMode);
    const res = await s.submitFeedback(status);
    if (!res.success) planHost().toast({ message: res.error || "Could not send feedback", kind: "error" });
  };

  if (phase === "sent") {
    return (
      <footer className="plan-bar plan-bar--state" role="status">
        <Loader2 size={14} className="spin" aria-hidden="true" />
        <span>
          {s.sentKind === "answers" ? "Answers sent" : "Changes sent"} · waiting for the agent to revise the plan…
        </span>
      </footer>
    );
  }

  if (phase === "approved") {
    return (
      <footer className="plan-bar plan-bar--state plan-bar--approved" role="status">
        <Check size={14} aria-hidden="true" />
        <span>Approved · agent running in {MODE_LABEL[selectedExecutionMode] ?? selectedExecutionMode}</span>
      </footer>
    );
  }

  if (phase === "answering") {
    return (
      <footer className="plan-bar">
        <button type="button" className="plan-bar__msg" onClick={onJumpToAsk}>
          {unanswered > 0
            ? `Answer ${unanswered} question${unanswered === 1 ? "" : "s"} above`
            : "All questions answered"}
        </button>
        <span className="plan-bar__spacer" />
        <button
          type="button"
          className="ui-btn ui-btn--primary"
          disabled={unanswered > 0 || isSubmitting}
          onClick={() => void submit("answered")}
        >
          {isSubmitting && <Loader2 size={13} className="spin" aria-hidden="true" />}
          Send answers
        </button>
      </footer>
    );
  }

  const nextOpen = progress.open[0];

  return (
    <footer className="plan-bar">
      <textarea
        ref={commentRef}
        className="plan-input plan-bar__comment"
        rows={1}
        placeholder="Comment for the agent…"
        aria-label="Comment for the agent"
        value={footerComment}
        onChange={(e) => s.setFooterComment(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            if (canRequest && !isSubmitting) void submit("changes_requested");
          }
        }}
      />

      <div className="plan-bar__chips">
        {progress.total > 0 && (
          <button
            type="button"
            className={`ui-chip plan-bar__chip${progress.open.length === 0 ? " ui-chip--ok" : ""}`}
            disabled={!nextOpen}
            onClick={() => nextOpen && onJumpToDecision(nextOpen.key)}
            title={nextOpen ? `Jump to ${nextOpen.id}: ${nextOpen.title}` : "All decisions made"}
          >
            {progress.done}/{progress.total} decided
          </button>
        )}
        {s.annotations.length > 0 && (
          <NotesChip notes={s.annotations} onJump={onJumpToNote} onRemove={s.removeAnnotation} />
        )}
      </div>

      <div className="plan-bar__actions">
        <button
          type="button"
          className="ui-btn ui-btn--ghost"
          disabled={!canRequest || isSubmitting}
          onClick={() => void submit("changes_requested")}
          title={canRequest ? "Send your comment, notes and picks back (Ctrl+Enter)" : "Add a comment, a note or a pick first"}
        >
          Request changes
        </button>

        <div className="plan-split">
          <button
            type="button"
            className="ui-btn ui-btn--primary plan-split__main"
            disabled={isSubmitting}
            onClick={() => void submit("approved")}
            title={`Approve and let the agent run in ${MODE_LABEL[selectedExecutionMode]}`}
          >
            {isSubmitting ? <Loader2 size={13} className="spin" aria-hidden="true" /> : <Check size={13} aria-hidden="true" />}
            {selectedExecutionMode === "manual" ? "Approve · Manual" : "Approve"}
          </button>
          <PlanMenu
            label="Approval mode"
            placement="above"
            items={[
              {
                id: "auto-edit",
                label: "Auto Edit",
                hint: "Agent edits files without asking",
                checked: selectedExecutionMode === "auto-edit",
                onSelect: () => s.setSelectedExecutionMode("auto-edit"),
              },
              {
                id: "manual",
                label: "Manual",
                hint: "Confirm each step",
                checked: selectedExecutionMode === "manual",
                onSelect: () => s.setSelectedExecutionMode("manual"),
              },
            ]}
            renderTrigger={({ ref, ...props }) => (
              <button
                ref={ref}
                type="button"
                className="ui-btn ui-btn--primary plan-split__more"
                disabled={isSubmitting}
                aria-label="Choose how the agent runs after approval"
                {...props}
              >
                <ChevronDown size={13} />
              </button>
            )}
          />
        </div>
      </div>
    </footer>
  );
};

const NotesChip: React.FC<{
  notes: PlanAnnotation[];
  onJump: (note: PlanAnnotation) => void;
  onRemove: (id: string) => void;
}> = ({ notes, onJump, onRemove }) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div
      className="plan-menu-wrap"
      ref={wrapRef}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          setOpen(false);
          btnRef.current?.focus();
        }
      }}
    >
      <button
        ref={btnRef}
        type="button"
        className="ui-chip plan-bar__chip"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
      >
        <MessageSquare size={11} aria-hidden="true" />
        {notes.length} note{notes.length === 1 ? "" : "s"}
      </button>
      {open && (
        <div className="plan-menu plan-menu--above plan-menu--start plan-notes" role="dialog" aria-label="Notes">
          {notes.map((n) => (
            <div key={n.id} className="plan-notes__item">
              <button
                type="button"
                className="plan-notes__jump"
                onClick={() => {
                  onJump(n);
                  setOpen(false);
                }}
              >
                <span className="plan-notes__quote">“{n.selectedText.length > 70 ? `${n.selectedText.slice(0, 70)}…` : n.selectedText}”</span>
                <span className="plan-notes__text">{n.question}</span>
              </button>
              <button
                type="button"
                className="ui-btn ui-btn--ghost ui-btn--sm ui-btn--icon"
                aria-label="Delete note"
                title="Delete note"
                onClick={() => {
                  onRemove(n.id);
                  if (notes.length === 1) setOpen(false);
                }}
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
