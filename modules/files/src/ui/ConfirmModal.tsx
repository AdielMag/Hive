import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle } from "lucide-react";

interface ConfirmModalProps {
  title: string;
  message: string;
  itemName: string;
  confirmLabel?: string;
  isDanger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  title,
  message,
  itemName,
  confirmLabel = "Delete",
  isDanger = true,
  onConfirm,
  onCancel,
}) => {
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelBtnRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
      } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        onConfirm();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel, onConfirm]);

  return createPortal(
    <div
      onClick={onCancel}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.6)",
        backdropFilter: "blur(2px)",
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 380,
          maxWidth: "90vw",
          backgroundColor: "var(--bg-card)",
          border: "1px solid var(--border-base)",
          borderRadius: 8,
          boxShadow: "0 12px 36px rgba(0, 0, 0, 0.5)",
          padding: 18,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {isDanger && (
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                backgroundColor: "rgba(239, 68, 68, 0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#ef4444",
                flexShrink: 0,
              }}
            >
              <AlertTriangle size={18} />
            </div>
          )}
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
            {title}
          </span>
        </div>

        <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>
          {message}
          <div
            style={{
              marginTop: 6,
              padding: "4px 8px",
              backgroundColor: "var(--bg-surface)",
              borderRadius: 4,
              fontFamily: "var(--font-mono, monospace)",
              fontSize: 11,
              color: "var(--text-primary)",
              wordBreak: "break-all",
            }}
          >
            {itemName}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
          <button
            ref={cancelBtnRef}
            onClick={onCancel}
            style={{
              padding: "6px 12px",
              borderRadius: 4,
              border: "1px solid var(--border-subtle)",
              backgroundColor: "transparent",
              color: "var(--text-secondary)",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: "6px 14px",
              borderRadius: 4,
              border: "none",
              backgroundColor: isDanger ? "#dc2626" : "var(--accent-base)",
              color: "#ffffff",
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
