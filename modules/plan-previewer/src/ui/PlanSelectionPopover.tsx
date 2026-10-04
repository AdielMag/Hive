import React, { useEffect, useRef, useState } from "react";
import { MessageSquarePlus } from "lucide-react";
import { usePlanStore } from "./plan-store.ts";

interface Props {
  containerRef: React.RefObject<HTMLDivElement | null>;
  disabled: boolean;
}

/** Areas where selecting text should not offer a note (interactive cards, inputs). */
const IGNORE = ".plan-decision, .plan-ask, .plan-reply, input, textarea, button";

/**
 * Two steps: selecting text in the document shows a small "Comment" pill; clicking it opens a compact input.
 * Saved notes stay highlighted in the text (see PlanPreviewerTab) and are listed in the review bar's notes chip.
 */
export const PlanSelectionPopover: React.FC<Props> = ({ containerRef, disabled }) => {
  const addAnnotation = usePlanStore((s) => s.addAnnotation);
  const [anchor, setAnchor] = useState<{ x: number; y: number; text: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState("");
  const popRef = useRef<HTMLDivElement>(null);

  const close = () => {
    setAnchor(null);
    setEditing(false);
    setNote("");
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container || disabled) return;

    const onMouseUp = () => {
      setTimeout(() => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
        const text = sel.toString().replace(/\s+/g, " ").trim();
        if (text.length < 3) return;
        const range = sel.getRangeAt(0);
        if (!container.contains(range.commonAncestorContainer)) return;
        const startEl = range.startContainer.parentElement;
        if (startEl?.closest(IGNORE)) return;

        const rect = range.getBoundingClientRect();
        const box = container.getBoundingClientRect();
        const x = Math.max(8, Math.min(container.clientWidth - 300, rect.left - box.left + rect.width / 2 - 40));
        const y = Math.max(0, rect.top - box.top - 36);
        setAnchor({ x, y, text });
        setEditing(false);
      }, 10);
    };

    const onMouseDown = (e: MouseEvent) => {
      if (popRef.current?.contains(e.target as Node)) return;
      if (!editing || !note.trim()) close();
    };

    container.addEventListener("mouseup", onMouseUp);
    document.addEventListener("mousedown", onMouseDown);
    return () => {
      container.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [containerRef, disabled, editing, note]);

  useEffect(() => {
    if (disabled) close();
  }, [disabled]);

  if (!anchor || disabled) return null;

  const save = () => {
    if (!note.trim()) return;
    addAnnotation(anchor.text, note.trim());
    window.getSelection()?.removeAllRanges();
    close();
  };

  if (!editing) {
    return (
      <div ref={popRef} className="plan-pop" style={{ left: anchor.x, top: anchor.y }}>
        <button
          type="button"
          className="ui-btn ui-btn--sm plan-pop__pill"
          // Keep the text selection while clicking the pill.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setEditing(true)}
        >
          <MessageSquarePlus size={12} aria-hidden="true" />
          Comment
        </button>
      </div>
    );
  }

  return (
    <div
      ref={popRef}
      className="plan-pop plan-pop--editing"
      style={{ left: anchor.x, top: anchor.y }}
      role="dialog"
      aria-label="Add a note on the selected text"
    >
      <div className="plan-pop__quote" title={anchor.text}>
        “{anchor.text.length > 80 ? `${anchor.text.slice(0, 80)}…` : anchor.text}”
      </div>
      <textarea
        className="plan-input"
        rows={2}
        autoFocus
        placeholder="Question or change request…"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            save();
          } else if (e.key === "Escape") {
            e.preventDefault();
            close();
          }
        }}
      />
      <div className="plan-pop__actions">
        <span className="plan-pop__hint">Enter to save</span>
        <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={close}>
          Cancel
        </button>
        <button type="button" className="ui-btn ui-btn--primary ui-btn--sm" disabled={!note.trim()} onClick={save}>
          Add note
        </button>
      </div>
    </div>
  );
};
