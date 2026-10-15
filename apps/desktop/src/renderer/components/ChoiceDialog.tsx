/** Promise-based confirm dialog with N choices (window.confirm only has two). Mount <ChoiceDialogHost /> once. */
import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { create } from "zustand";
import "../styles/worktree.css";

export interface ChoiceOption {
  id: string;
  label: string;
  tone?: "primary" | "danger";
}

export interface ChoiceRequest {
  title: string;
  /** Plain-text paragraphs. */
  body: string[];
  choices: ChoiceOption[];
}

interface PendingChoice extends ChoiceRequest {
  resolve: (id: string | null) => void;
}

const useChoiceStore = create<{ pending: PendingChoice | null }>(() => ({ pending: null }));

/** Resolves with the chosen option id, or null when dismissed (Escape / click outside). */
export function askChoice(request: ChoiceRequest): Promise<string | null> {
  return new Promise((resolve) => {
    useChoiceStore.getState().pending?.resolve(null);
    useChoiceStore.setState({ pending: { ...request, resolve } });
  });
}

function settle(id: string | null): void {
  const pending = useChoiceStore.getState().pending;
  if (!pending) return;
  useChoiceStore.setState({ pending: null });
  pending.resolve(id);
}

export const ChoiceDialogHost: React.FC = () => {
  const pending = useChoiceStore((s) => s.pending);

  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && settle(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending]);

  if (!pending) return null;
  return createPortal(
    <div className="modal-scrim" onMouseDown={() => settle(null)}>
      <div className="choice-dialog" role="alertdialog" aria-label={pending.title} onMouseDown={(e) => e.stopPropagation()}>
        <div className="choice-dialog__title">{pending.title}</div>
        {pending.body.map((p, i) => (
          <p key={i} className="choice-dialog__body">
            {p}
          </p>
        ))}
        <div className="choice-dialog__actions">
          {pending.choices.map((c) => (
            <button
              key={c.id}
              className={`ui-btn ui-btn--sm${c.tone === "primary" ? " ui-btn--primary" : ""}${c.tone === "danger" ? " choice-dialog__danger" : ""}`}
              onClick={() => settle(c.id)}
              autoFocus={c.tone === "primary"}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
};
