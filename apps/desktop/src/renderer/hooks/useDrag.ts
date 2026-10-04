import { useCallback, useRef, useState } from "react";

/** Pointer drag helper that shields iframes/xterm from stealing events with a full-screen overlay. */
export function useDrag(axis: "row" | "col", onMove: (delta: number, start: number) => void, getStart: () => number) {
  const moveRef = useRef(onMove);
  moveRef.current = onMove;
  const [, setDragging] = useState(false);
  return useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const origin = axis === "col" ? e.clientX : e.clientY;
      const start = getStart();
      const overlay = document.createElement("div");
      overlay.className = `drag-overlay drag-overlay--${axis}`;
      document.body.appendChild(overlay);
      setDragging(true);
      let raf = 0;
      const move = (ev: MouseEvent) => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => moveRef.current((axis === "col" ? ev.clientX : ev.clientY) - origin, start));
      };
      const up = () => {
        overlay.remove();
        setDragging(false);
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
      };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
    },
    [axis, getStart],
  );
}
