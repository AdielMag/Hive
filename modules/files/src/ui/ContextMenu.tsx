import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export interface ContextMenuItem {
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  separator?: boolean;
  onClick?: () => void;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, items, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("mousedown", handleMouseDown, true);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handleMouseDown, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  // Adjust for viewport boundaries
  const menuWidth = 190;
  const menuHeight = items.length * 28 + 16;
  const posX = Math.max(8, Math.min(x, window.innerWidth - menuWidth - 8));
  const posY = Math.max(8, Math.min(y, window.innerHeight - menuHeight - 8));

  return createPortal(
    <div
      ref={menuRef}
      style={{
        position: "fixed",
        top: posY,
        left: posX,
        zIndex: 9999,
        minWidth: menuWidth,
        backgroundColor: "var(--bg-card)",
        border: "1px solid var(--border-base)",
        borderRadius: 6,
        padding: "4px 0",
        boxShadow: "0 8px 24px rgba(0, 0, 0, 0.45)",
        fontSize: 12,
        userSelect: "none",
      }}
    >
      {items.map((item, idx) => {
        if (item.separator) {
          return (
            <div
              key={`sep-${idx}`}
              style={{
                height: 1,
                backgroundColor: "var(--border-subtle)",
                margin: "4px 0",
              }}
            />
          );
        }

        return (
          <div
            key={item.label}
            onClick={(e) => {
              e.stopPropagation();
              if (!item.disabled && item.onClick) {
                item.onClick();
                onClose();
              }
            }}
            onMouseEnter={(e) => {
              if (!item.disabled) {
                e.currentTarget.style.backgroundColor = item.danger
                  ? "rgba(239, 68, 68, 0.15)"
                  : "var(--bg-card-hover)";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "5px 10px",
              cursor: item.disabled ? "not-allowed" : "pointer",
              color: item.disabled
                ? "var(--text-disabled)"
                : item.danger
                ? "#ef4444"
                : "var(--text-primary)",
              opacity: item.disabled ? 0.5 : 1,
              gap: 8,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, overflow: "hidden" }}>
              {item.icon && (
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    color: item.danger ? "#ef4444" : "var(--text-muted)",
                  }}
                >
                  {item.icon}
                </span>
              )}
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {item.label}
              </span>
            </div>
            {item.shortcut && (
              <span
                style={{
                  fontSize: 10,
                  color: "var(--text-muted)",
                  marginLeft: 12,
                  fontFamily: "var(--font-mono, monospace)",
                }}
              >
                {item.shortcut}
              </span>
            )}
          </div>
        );
      })}
    </div>,
    document.body,
  );
};
