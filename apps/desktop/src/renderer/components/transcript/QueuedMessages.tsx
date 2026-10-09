/**
 * Displays queued messages (steering and follow-up) in the session window.
 * Allows editing, deleting, moving back to composer input, or steering immediately ("Do now").
 */
import React, { useState } from "react";
import {
  ArrowDownToLine,
  Clock,
  CornerDownLeft,
  CornerDownRight,
  Pencil,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useSessionStore } from "../../store/session-store.ts";

const EMPTY_HELD: never[] = [];

export const QueuedMessagesList: React.FC = () => {
  const { queue, clearAllQueued, held, removeHeldMessage, popHeldToEditor } = useSessionStore(
    useShallow((s) => ({
      queue: s.transcript.queue,
      clearAllQueued: s.clearAllQueued,
      held: (s.activeKey ? s.compactionHeld[s.activeKey] : undefined) ?? EMPTY_HELD,
      removeHeldMessage: s.removeHeldMessage,
      popHeldToEditor: s.popHeldToEditor,
    })),
  );

  const steering = queue.steering ?? [];
  const followUp = queue.followUp ?? [];
  const total = steering.length + followUp.length + held.length;

  if (total === 0) return null;

  return (
    <div className="transcript__queue-section" data-testid="queued-messages-section">
      <div className="transcript__queue-head">
        <div className="transcript__queue-head-left">
          <Clock size={13} className="transcript__queue-clock" />
          <span className="ui-section-label">
            Queued messages ({total})
          </span>
        </div>
        {total > 1 && (
          <button
            className="transcript__queue-clear-btn"
            onClick={() => void clearAllQueued()}
            title="Clear all queued messages"
          >
            <Trash2 size={11} /> Clear all
          </button>
        )}
      </div>

      <div className="transcript__queue-items">
        {steering.map((msg, idx) => (
          <QueuedMessageCard
            key={`steer-${idx}`}
            message={msg}
            type="steering"
            index={idx}
          />
        ))}
        {followUp.map((msg, idx) => (
          <QueuedMessageCard
            key={`follow-${idx}`}
            message={msg}
            type="followUp"
            index={idx}
          />
        ))}
        {held.map((h, idx) => (
          <div key={`held-${idx}`} className="msg-queued msg-queued--followUp" data-testid="queued-held-message">
            <div className="msg-queued__bubble">
              <div className="msg-queued__header">
                <span className="msg-queued__badge">
                  <Clock size={10} /> Sends after compaction
                </span>
                <div className="msg-queued__actions">
                  <button
                    className="msg-queued__btn"
                    onClick={() => popHeldToEditor(idx)}
                    title="Move back to the composer"
                  >
                    <CornerDownLeft size={11} />
                  </button>
                  <button className="msg-queued__btn" onClick={() => removeHeldMessage(idx)} title="Remove from queue">
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>
              <div className="msg-queued__text">{h.text}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

interface CardProps {
  message: string;
  type: "steering" | "followUp";
  index: number;
}

const QueuedMessageCard: React.FC<CardProps> = ({ message, type, index }) => {
  const {
    deleteQueuedMessage,
    editQueuedMessage,
    runQueuedNow,
    steerQueuedNext,
    popQueuedToEditor,
    running,
  } = useSessionStore(
    useShallow((s) => ({
      deleteQueuedMessage: s.deleteQueuedMessage,
      editQueuedMessage: s.editQueuedMessage,
      runQueuedNow: s.runQueuedNow,
      steerQueuedNext: s.steerQueuedNext,
      popQueuedToEditor: s.popQueuedToEditor,
      running: s.transcript.running,
    })),
  );

  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(message);
  const [busy, setBusy] = useState(false);
  const isSteering = type === "steering";

  const handleSave = async () => {
    await editQueuedMessage(type, index, editText);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditText(message);
  };

  const handleRunNow = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await runQueuedNow(type, index);
    } finally {
      setBusy(false);
    }
  };

  const handleSteerNext = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await steerQueuedNext(type, index);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`msg-queued msg-queued--${type}`}>
      <div className={`msg-queued__bubble${isSteering ? " msg-queued__bubble--steering" : ""}`}>
        <div className="msg-queued__header">
          <span
            className={`msg-queued__badge${isSteering ? " msg-queued__badge--steering" : ""}`}
            title={
              isSteering
                ? "Steering message: interjects into the agent run at its next step"
                : "Follow-up message: runs as the next turn after the agent finishes"
            }
          >
            {isSteering ? <Zap size={11} /> : <Clock size={11} />}
            {isSteering ? "Steering (next step)" : "Queued (next turn)"}
          </span>

          {!isEditing && (
            <div className="msg-queued__actions">
              <button
                className="msg-queued__btn msg-queued__btn--primary"
                onClick={() => void handleRunNow()}
                disabled={busy}
                title={
                  running
                    ? "Do now: stop current step immediately and send to LLM now"
                    : "Do now: send this message to the LLM immediately"
                }
              >
                <Zap size={11} /> Do now
              </button>

              {!isSteering && (
                <button
                  className="msg-queued__btn"
                  onClick={() => void handleSteerNext()}
                  disabled={busy}
                  title="Next step: wait for current step to finish, then send message (steer)"
                >
                  <CornerDownRight size={11} /> Next step
                </button>
              )}

              <button
                className="msg-queued__btn"
                onClick={() => {
                  setEditText(message);
                  setIsEditing(true);
                }}
                disabled={busy}
                title="Edit this queued message"
              >
                <Pencil size={11} /> Edit
              </button>
              <button
                className="msg-queued__btn"
                onClick={() => void popQueuedToEditor(type, index)}
                disabled={busy}
                title="Move back to composer input"
              >
                <ArrowDownToLine size={11} /> To input
              </button>
              <button
                className="msg-queued__btn msg-queued__btn--danger"
                onClick={() => void deleteQueuedMessage(type, index)}
                disabled={busy}
                title="Cancel and remove from queue"
              >
                <Trash2 size={11} />
              </button>
            </div>
          )}
        </div>

        {isEditing ? (
          <div className="msg-queued__editor">
            <textarea
              autoFocus
              className="msg-queued__textarea"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  void handleSave();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  handleCancel();
                }
              }}
            />
            <div className="msg-queued__editor-actions">
              <button className="ui-btn ui-btn--primary ui-btn--sm" onClick={() => void handleSave()}>
                Save
              </button>
              <button className="ui-btn ui-btn--ghost ui-btn--sm" onClick={handleCancel}>
                Cancel
              </button>
              <span className="msg-queued__hint">Ctrl+Enter to save, Esc to cancel</span>
            </div>
          </div>
        ) : (
          <div className="msg-queued__text">{message}</div>
        )}
      </div>
    </div>
  );
};

/** Compact banner rendered above composer textarea when messages are queued. */
export const QueuedMessagesBar: React.FC = () => {
  const { queue, clearAllQueued, heldCount } = useSessionStore(
    useShallow((s) => ({
      queue: s.transcript.queue,
      clearAllQueued: s.clearAllQueued,
      heldCount: (s.activeKey ? s.compactionHeld[s.activeKey]?.length : 0) ?? 0,
    })),
  );

  const steeringCount = queue.steering?.length ?? 0;
  const followUpCount = (queue.followUp?.length ?? 0) + heldCount;
  const total = steeringCount + followUpCount;

  if (total === 0) return null;

  const scrollToQueue = () => {
    const el = document.querySelector(".transcript__queue-section");
    el?.scrollIntoView({ behavior: "smooth", block: "end" });
  };

  return (
    <div className="composer-queue-bar">
      <Clock size={12} className="composer-queue-bar__icon" />
      <span className="composer-queue-bar__label">
        {total} message{total === 1 ? "" : "s"} queued
      </span>
      <span className="composer-queue-bar__hint">
        {steeringCount > 0 && `${steeringCount} steering`}
        {steeringCount > 0 && followUpCount > 0 && ", "}
        {followUpCount > 0 && `${followUpCount} follow-up`}
      </span>
      <div style={{ flex: 1 }} />
      <button className="composer-queue-bar__btn" onClick={scrollToQueue} title="Scroll down to queued messages">
        <CornerDownLeft size={11} /> View
      </button>
      <button
        className="composer-queue-bar__btn composer-queue-bar__btn--ghost"
        onClick={() => void clearAllQueued()}
        title="Clear all queued messages"
      >
        <X size={11} /> Clear
      </button>
    </div>
  );
};
