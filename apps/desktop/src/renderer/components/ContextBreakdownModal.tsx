import React, { useEffect } from "react";
import { X, PieChart } from "lucide-react";
import { ContextBreakdownView } from "./ContextBreakdownView.tsx";

interface ContextBreakdownModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ContextBreakdownModal: React.FC<ContextBreakdownModalProps> = ({ isOpen, onClose }) => {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "var(--scrim, rgba(0, 0, 0, 0.6))",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 500,
          maxWidth: "calc(100vw - 48px)",
          maxHeight: "calc(100vh - 64px)",
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-prominent)",
          borderRadius: 12,
          boxShadow: "var(--shadow-pop, 0 16px 40px rgba(0,0,0,0.5))",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 18px",
            borderBottom: "1px solid var(--border-subtle)",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <PieChart size={16} color="var(--accent-base)" />
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>Context window</span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              padding: 4,
              borderRadius: 6,
              display: "flex",
            }}
          >
            <X size={16} />
          </button>
        </div>
        <div style={{ padding: 18, overflowY: "auto" }}>
          <ContextBreakdownView />
        </div>
      </div>
    </div>
  );
};
