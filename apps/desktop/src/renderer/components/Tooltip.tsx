/**
 * Small styled tooltip for icon-only controls. First show waits ~300ms; moving to another tooltip target
 * within 400ms of the last one hiding shows instantly (no animation), like native menus/toolbars.
 * The child must be a single element that accepts DOM event props and a ref-able DOM node.
 */
import React, { cloneElement, isValidElement, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type TooltipSide = "right" | "left" | "top" | "bottom";

const SHOW_DELAY = 300;
const WARM_WINDOW = 400;
const GAP = 8;
let lastHiddenAt = 0;

interface TooltipProps {
  label: React.ReactNode;
  shortcut?: string | null;
  side?: TooltipSide;
  /** Skip rendering (e.g. a panel that's already open shows its own header). */
  disabled?: boolean;
  children: React.ReactElement;
}

type ChildProps = {
  onPointerEnter?: (e: React.PointerEvent) => void;
  onPointerLeave?: (e: React.PointerEvent) => void;
  onFocus?: (e: React.FocusEvent) => void;
  onBlur?: (e: React.FocusEvent) => void;
  onPointerDown?: (e: React.PointerEvent) => void;
  "aria-describedby"?: string;
};

export const Tooltip: React.FC<TooltipProps> = ({ label, shortcut, side = "right", disabled, children }) => {
  const id = useId();
  const anchor = useRef<HTMLElement | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [warm, setWarm] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);

  const hide = useCallback(() => {
    window.clearTimeout(timer.current);
    setOpen((was) => {
      if (was) lastHiddenAt = performance.now();
      return false;
    });
  }, []);

  const show = useCallback((target: HTMLElement) => {
    anchor.current = target;
    window.clearTimeout(timer.current);
    const isWarm = performance.now() - lastHiddenAt < WARM_WINDOW;
    setWarm(isWarm);
    if (isWarm) setOpen(true);
    else timer.current = window.setTimeout(() => setOpen(true), SHOW_DELAY);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide();
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("blur", hide);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("blur", hide);
    };
  }, [open, hide]);

  useLayoutEffect(() => {
    if (!open || !anchor.current || !tipRef.current) return;
    const a = anchor.current.getBoundingClientRect();
    const t = tipRef.current.getBoundingClientRect();
    let left = 0;
    let top = 0;
    if (side === "right") [left, top] = [a.right + GAP, a.top + a.height / 2 - t.height / 2];
    else if (side === "left") [left, top] = [a.left - GAP - t.width, a.top + a.height / 2 - t.height / 2];
    else if (side === "top") [left, top] = [a.left + a.width / 2 - t.width / 2, a.top - GAP - t.height];
    else [left, top] = [a.left + a.width / 2 - t.width / 2, a.bottom + GAP];
    const maxX = window.innerWidth - t.width - 4;
    const maxY = window.innerHeight - t.height - 4;
    setPos({ left: Math.max(4, Math.min(left, maxX)), top: Math.max(4, Math.min(top, maxY)) });
  }, [open, side, label]);

  if (disabled || !isValidElement(children)) return children;
  const child = children as React.ReactElement<ChildProps>;
  const p = child.props;

  const cloned = cloneElement(child, {
    "aria-describedby": open ? id : p["aria-describedby"],
    onPointerEnter: (e: React.PointerEvent) => {
      p.onPointerEnter?.(e);
      if (e.pointerType !== "touch") show(e.currentTarget as HTMLElement);
    },
    onPointerLeave: (e: React.PointerEvent) => {
      p.onPointerLeave?.(e);
      hide();
    },
    onPointerDown: (e: React.PointerEvent) => {
      p.onPointerDown?.(e);
      hide();
    },
    onFocus: (e: React.FocusEvent) => {
      p.onFocus?.(e);
      if ((e.currentTarget as HTMLElement).matches(":focus-visible")) show(e.currentTarget as HTMLElement);
    },
    onBlur: (e: React.FocusEvent) => {
      p.onBlur?.(e);
      hide();
    },
  });

  return (
    <>
      {cloned}
      {open &&
        createPortal(
          <div
            ref={tipRef}
            id={id}
            role="tooltip"
            className={`tooltip tooltip--${side}${warm ? " is-warm" : ""}`}
            style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: -9999 }}
          >
            <span className="tooltip__label">{label}</span>
            {shortcut ? <kbd className="tooltip__kbd">{shortcut}</kbd> : null}
          </div>,
          document.body,
        )}
    </>
  );
};
