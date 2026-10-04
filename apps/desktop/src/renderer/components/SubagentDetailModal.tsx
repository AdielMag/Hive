import React, { useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { useSessionStore } from "../store/session-store.ts";
import { SubagentViewer } from "./SubagentViewer.tsx";

export const SubagentDetailModal: React.FC = () => {
  const { target, closeModal, openTab } = useSessionStore(
    useShallow((s) => ({
      target: s.subagentModal,
      closeModal: s.closeSubagentModal,
      openTab: s.openSubagentTab,
    })),
  );

  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!target) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closeModal();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [target, closeModal]);

  if (!target) return null;

  return (
    <div
      className="modal-scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          closeModal();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`Subagent details: ${target.view.description || target.view.type}`}
    >
      <div ref={cardRef} className="subagent-modal-card" onClick={(e) => e.stopPropagation()}>
        <SubagentViewer
          view={target.view}
          sessionPath={target.parentSessionPath}
          activeKey={target.parentActiveKey}
          onOpenTab={() => {
            openTab(target.view, target);
            closeModal();
          }}
          onClose={closeModal}
          isModal
        />
      </div>
    </div>
  );
};
