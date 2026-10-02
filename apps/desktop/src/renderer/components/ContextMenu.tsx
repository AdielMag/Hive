/** Lightweight right-click menu rendered in a portal at the cursor. Closes on outside click, Escape, blur, scroll. */
import React, { useLayoutEffect, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type ContextMenuEntry =
  | {
      kind?: "item";
      label: string;
      icon?: React.ReactNode;
      onSelect: () => void;
      danger?: boolean;
      disabled?: boolean;
      hint?: string;
    }
  | { kind: "separator" };

export interface ContextMenuState {
  x: number;
  y: number;
  items: ContextMenuEntry[];
}

export const ContextMenu: React.FC<{ menu: ContextMenuState | null; onClose: () => void }> = ({ menu, onClose }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // Clamp to the viewport once we know the rendered size.
  useLayoutEffect(() => {
    if (!menu || !ref.current) {
      setPos(null);
      return;
    }
    const { width, height } = ref.current.getBoundingClientRect();
    const pad = 6;
    setPos({
      left: Math.max(pad, Math.min(menu.x, window.innerWidth - width - pad)),
      top: Math.max(pad, Math.min(menu.y, window.innerHeight - height - pad)),
    });
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const close = () => onClose();
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", close);
    window.addEventListener("resize", close);
    window.addEventListener("wheel", close, { passive: true });
    return () => {
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("wheel", close);
    };
  }, [menu, onClose]);

  if (!menu) return null;

  return createPortal(
    <div
      ref={ref}
      className="menu-pop ctx-menu"
      role="menu"
      style={{ position: "fixed", left: pos?.left ?? menu.x, top: pos?.top ?? menu.y, visibility: pos ? "visible" : "hidden" }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {menu.items.map((item, i) =>
        item.kind === "separator" ? (
          <div key={`sep-${i}`} className="menu-pop__sep" />
        ) : (
          <button
            key={item.label}
            role="menuitem"
            className={`menu-pop__item ctx-menu__item${item.danger ? " is-danger" : ""}`}
            disabled={item.disabled}
            onClick={() => {
              onClose();
              item.onSelect();
            }}
          >
            <span className="ctx-menu__label">
              {item.icon && <span className="ctx-menu__icon">{item.icon}</span>}
              {item.label}
            </span>
            {item.hint && <span className="menu-pop__kbd">{item.hint}</span>}
          </button>
        ),
      )}
    </div>,
    document.body,
  );
};
