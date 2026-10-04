import { useEffect, useRef, useState } from "react";

/** Hover-to-peek / click-to-pin popover anchored above a status bar button. */
export function useHoverPopover() {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [pos, setPos] = useState<{ bottom: number; right: number }>({ bottom: 32, right: 16 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updatePos = () => {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    setPos({
      bottom: Math.max(32, window.innerHeight - rect.top + 8),
      right: Math.max(16, window.innerWidth - rect.right),
    });
  };
  const onEnter = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    updatePos();
    setOpen(true);
  };
  const onLeave = () => {
    if (pinned) return;
    closeTimerRef.current = setTimeout(() => setOpen(false), 150);
  };
  const onClick = () => {
    updatePos();
    if (!open) {
      setOpen(true);
      setPinned(true);
    } else {
      setPinned((prev) => !prev);
    }
  };
  const close = () => {
    setPinned(false);
    setOpen(false);
  };

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return { open, pinned, pos, btnRef, onEnter, onLeave, onClick, close };
}
