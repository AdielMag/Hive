import React, { useEffect, useState } from "react";
import { Move, ArrowLeft, ArrowRight, ArrowUp, ArrowDown } from "lucide-react";
import { usePaneLayoutStore } from "../store/pane-layout-store.ts";

export type DropZone = "left" | "right" | "top" | "bottom" | "center";

interface PaneDropOverlayProps {
  paneId: string;
  onDropTab: (tabId: string, zone: DropZone) => void;
}

export const PaneDropOverlay: React.FC<PaneDropOverlayProps> = ({ onDropTab }) => {
  const draggingTab = usePaneLayoutStore((s) => s.draggingTab);
  const [activeZone, setActiveZone] = useState<DropZone | null>(null);

  useEffect(() => {
    if (!draggingTab) setActiveZone(null);
  }, [draggingTab]);

  // If no tab is currently being dragged, keep overlay inactive
  if (!draggingTab) return null;

  const handleDragOver = (e: React.DragEvent) => {
    // Only respond to Hive tabs
    if (!e.dataTransfer.types.includes("application/x-hive-tab") && !draggingTab) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const w = rect.width;
    const h = rect.height;

    // Edge margin is 25% of width/height (or min 60px)
    const edgeX = Math.min(w * 0.28, Math.max(50, w * 0.2));
    const edgeY = Math.min(h * 0.28, Math.max(50, h * 0.2));

    let zone: DropZone = "center";
    if (x < edgeX) {
      zone = "left";
    } else if (x > w - edgeX) {
      zone = "right";
    } else if (y < edgeY) {
      zone = "top";
    } else if (y > h - edgeY) {
      zone = "bottom";
    } else {
      zone = "center";
    }

    if (zone !== activeZone) {
      setActiveZone(zone);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // Check if truly leaving the container
    const rect = e.currentTarget.getBoundingClientRect();
    if (
      e.clientX < rect.left ||
      e.clientX >= rect.right ||
      e.clientY < rect.top ||
      e.clientY >= rect.bottom
    ) {
      setActiveZone(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const tabId = e.dataTransfer.getData("application/x-hive-tab") || draggingTab?.tabId;
    const zone = activeZone || "center";
    setActiveZone(null);
    if (tabId) {
      onDropTab(tabId, zone);
    }
  };

  return (
    <div
      className="pane-drop-overlay"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {activeZone && (
        <div className={`pane-drop-preview pane-drop-preview--${activeZone}`}>
          <div className="pane-drop-preview__badge">
            {activeZone === "left" && <><ArrowLeft size={16} /><span>Split Left</span></>}
            {activeZone === "right" && <><ArrowRight size={16} /><span>Split Right</span></>}
            {activeZone === "top" && <><ArrowUp size={16} /><span>Split Top</span></>}
            {activeZone === "bottom" && <><ArrowDown size={16} /><span>Split Bottom</span></>}
            {activeZone === "center" && <><Move size={16} /><span>Add to Pane</span></>}
          </div>
        </div>
      )}
    </div>
  );
};
