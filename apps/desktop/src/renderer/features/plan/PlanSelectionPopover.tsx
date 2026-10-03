import React, { useEffect, useRef, useState } from "react";
import { MessageSquarePlus, Send, X } from "lucide-react";
import { usePlanStore } from "./plan-store.ts";

interface Props {
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export const PlanSelectionPopover: React.FC<Props> = ({ containerRef }) => {
  const addAnnotation = usePlanStore((s) => s.addAnnotation);
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [selectedText, setSelectedText] = useState("");
  const [question, setQuestion] = useState("");
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseUp = () => {
      // Delay check slightly so selection finishes settling
      setTimeout(() => {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed) return;

        const text = selection.toString().trim();
        if (text.length < 3) return;

        // Check if selection is within the document container
        const container = containerRef.current;
        if (!container) return;

        const range = selection.getRangeAt(0);
        if (!container.contains(range.commonAncestorContainer)) return;

        const rect = range.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();

        // Calculate position relative to document container
        const x = Math.max(16, Math.min(container.clientWidth - 320, rect.left - containerRect.left + rect.width / 2 - 150));
        const y = Math.max(10, rect.top - containerRect.top - 120);

        setSelectedText(text);
        setCoords({ x, y });
        setVisible(true);
      }, 50);
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener("mouseup", handleMouseUp);
      return () => container.removeEventListener("mouseup", handleMouseUp);
    }
    return undefined;
  }, [containerRef]);

  const handleClose = () => {
    setVisible(false);
    setSelectedText("");
    setQuestion("");
    window.getSelection()?.removeAllRanges();
  };

  const handleAsk = () => {
    if (!question.trim() || !selectedText) return;
    addAnnotation(selectedText, question.trim());
    handleClose();
  };

  if (!visible) return null;

  return (
    <div
      ref={popoverRef}
      className="plan-popover"
      style={{ left: `${coords.x}px`, top: `${coords.y}px` }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="plan-popover__head">
        <MessageSquarePlus size={13} />
        <span className="plan-popover__title">Add note on selection</span>
        <button type="button" className="plan-popover__close" onClick={handleClose}>
          <X size={12} />
        </button>
      </div>

      <div className="plan-popover__quote" title={selectedText}>
        &ldquo;{selectedText.length > 80 ? `${selectedText.slice(0, 80)}…` : selectedText}&rdquo;
      </div>

      <textarea
        className="plan-popover__input"
        placeholder="Ask a question or request a change on this..."
        rows={2}
        autoFocus
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            handleAsk();
          } else if (e.key === "Escape") {
            e.preventDefault();
            handleClose();
          }
        }}
      />

      <div className="plan-popover__actions">
        <button type="button" className="plan-popover__btn-cancel" onClick={handleClose}>
          Cancel
        </button>
        <button
          type="button"
          className="plan-popover__btn-ask"
          disabled={!question.trim()}
          onClick={handleAsk}
        >
          <span>Ask</span>
          <Send size={11} />
        </button>
      </div>
    </div>
  );
};
