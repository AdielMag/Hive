import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { Check } from "lucide-react";

export interface PlanMenuItem {
  id: string;
  label: string;
  hint?: string;
  /** Set for radio-style items. */
  checked?: boolean;
  /** Small section heading rendered above this item. */
  group?: string;
  onSelect: () => void;
}

interface Props {
  items: PlanMenuItem[];
  /** Accessible name of the menu. */
  label: string;
  align?: "start" | "end";
  placement?: "below" | "above";
  className?: string;
  renderTrigger: (props: {
    ref: React.Ref<HTMLButtonElement>;
    onClick: () => void;
    onKeyDown: (e: React.KeyboardEvent) => void;
    "aria-haspopup": "menu";
    "aria-expanded": boolean;
    "aria-controls": string;
  }) => React.ReactNode;
}

/** Accessible dropdown menu: arrow keys / Home / End, Enter/Space select, Esc and click-outside close. */
export const PlanMenu: React.FC<Props> = ({ items, label, align = "end", placement = "below", className, renderTrigger }) => {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const focusItem = (i: number) => {
    const n = items.length;
    if (n === 0) return;
    itemRefs.current[((i % n) + n) % n]?.focus();
  };

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const checked = items.findIndex((it) => it.checked);
    requestAnimationFrame(() => focusItem(checked >= 0 ? checked : 0));
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]); // items are read once on open

  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    const idx = itemRefs.current.findIndex((el) => el === document.activeElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusItem(idx + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusItem(idx - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      focusItem(0);
    } else if (e.key === "End") {
      e.preventDefault();
      focusItem(items.length - 1);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    } else if (e.key === "Tab") {
      close(false);
    }
  };

  const onTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
    }
  };

  const hasRadios = items.some((it) => it.checked !== undefined);

  return (
    <div className={`plan-menu-wrap${className ? ` ${className}` : ""}`} ref={wrapRef}>
      {renderTrigger({
        ref: triggerRef,
        onClick: () => setOpen((v) => !v),
        onKeyDown: onTriggerKeyDown,
        "aria-haspopup": "menu",
        "aria-expanded": open,
        "aria-controls": menuId,
      })}
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          className={`plan-menu plan-menu--${align} plan-menu--${placement}`}
          onKeyDown={onMenuKeyDown}
        >
          {items.map((it, i) => (
            <React.Fragment key={it.id}>
              {it.group && (
                <div className="plan-menu__group" role="presentation">
                  {it.group}
                </div>
              )}
              <button
                type="button"
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                role={it.checked !== undefined ? "menuitemradio" : "menuitem"}
                aria-checked={it.checked}
                tabIndex={-1}
                className="plan-menu__item"
                onClick={() => {
                  it.onSelect();
                  close(true);
                }}
              >
                {hasRadios && <span className="plan-menu__check">{it.checked && <Check size={13} />}</span>}
                <span className="plan-menu__text">
                  <span className="plan-menu__label">{it.label}</span>
                  {it.hint && <span className="plan-menu__hint">{it.hint}</span>}
                </span>
              </button>
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
};
