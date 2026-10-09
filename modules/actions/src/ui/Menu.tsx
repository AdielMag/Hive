import React, { useEffect, useRef, useState } from "react";

/** Minimal popover: closes on outside click and Escape. */
export const Menu: React.FC<{
  trigger: (p: { open: boolean; toggle: () => void }) => React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  align?: "start" | "end";
}> = ({ trigger, children, align = "start" }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div className="ga-menu" ref={ref}>
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      {open && <div className={`ga-menu__pop ga-menu__pop--${align}`}>{children(() => setOpen(false))}</div>}
    </div>
  );
};
