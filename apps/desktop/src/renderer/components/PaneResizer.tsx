import React, { useCallback, useRef } from "react";
import type { SplitDirection } from "../store/pane-layout-store.ts";

interface PaneResizerProps {
  direction: SplitDirection;
  splitId: string;
  index: number; // resizer is between child[index] and child[index + 1]
  sizes: number[];
  onResize: (newSizes: number[]) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export const PaneResizer: React.FC<PaneResizerProps> = ({
  direction,
  index,
  sizes,
  onResize,
  containerRef,
}) => {
  const isCol = direction === "horizontal"; // side-by-side: horizontal direction, vertical divider (col-resize)
  const sizesRef = useRef(sizes);
  sizesRef.current = sizes;

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const totalPx = isCol ? rect.width : rect.height;
      if (totalPx <= 0) return;

      const startCoord = isCol ? e.clientX : e.clientY;
      const startSizes = [...sizesRef.current];
      const startSizeA = startSizes[index] ?? 50;
      const startSizeB = startSizes[index + 1] ?? 50;
      const combined = startSizeA + startSizeB;

      // Overlay to prevent iframe/webview events stealing pointer
      const overlay = document.createElement("div");
      overlay.className = `drag-overlay ${isCol ? "drag-overlay--col" : "drag-overlay--row"}`;
      document.body.appendChild(overlay);

      let raf = 0;

      const onPointerMove = (ev: PointerEvent) => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          const curCoord = isCol ? ev.clientX : ev.clientY;
          const deltaPx = curCoord - startCoord;
          const deltaPct = (deltaPx / totalPx) * 100;

          const minPct = 10;
          let newA = startSizeA + deltaPct;
          let newB = startSizeB - deltaPct;

          if (newA < minPct) {
            newA = minPct;
            newB = combined - minPct;
          } else if (newB < minPct) {
            newB = minPct;
            newA = combined - minPct;
          }

          const nextSizes = [...startSizes];
          nextSizes[index] = newA;
          nextSizes[index + 1] = newB;
          onResize(nextSizes);
        });
      };

      const onPointerUp = () => {
        cancelAnimationFrame(raf);
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        overlay.remove();
      };

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    },
    [containerRef, index, isCol, onResize],
  );

  return (
    <div
      className={`pane-resizer ${isCol ? "pane-resizer--col" : "pane-resizer--row"}`}
      onPointerDown={onPointerDown}
      title="Drag to resize panes"
    />
  );
};
