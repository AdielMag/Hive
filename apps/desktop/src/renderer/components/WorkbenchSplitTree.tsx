import React, { useRef } from "react";
import {
  usePaneLayoutStore,
  type PaneNode,
} from "../store/pane-layout-store.ts";
import { WorkbenchPane } from "./WorkbenchPane.tsx";
import { PaneResizer } from "./PaneResizer.tsx";

interface WorkbenchSplitTreeProps {
  node: PaneNode;
  activePaneId: string;
  setActivePaneId: (paneId: string) => void;
}

export const WorkbenchSplitTree: React.FC<WorkbenchSplitTreeProps> = ({
  node,
  activePaneId,
  setActivePaneId,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  if (node.type === "leaf") {
    return (
      <WorkbenchPane
        pane={node}
        isActivePane={activePaneId === node.id}
        onActivate={() => setActivePaneId(node.id)}
      />
    );
  }

  return (
    <div
      ref={containerRef}
      className={`pane-split-container pane-split-container--${node.direction}`}
    >
      {node.children.map((child, i) => {
        const size = node.sizes[i] ?? 100 / node.children.length;
        return (
          <React.Fragment key={child.id}>
            <div
              className="pane-split-item"
              style={{
                flex: `${size} 1 0%`,
                minWidth: node.direction === "horizontal" ? 80 : undefined,
                minHeight: node.direction === "vertical" ? 80 : undefined,
              }}
            >
              <WorkbenchSplitTree
                node={child}
                activePaneId={activePaneId}
                setActivePaneId={setActivePaneId}
              />
            </div>
            {i < node.children.length - 1 && (
              <PaneResizer
                direction={node.direction}
                splitId={node.id}
                index={i}
                sizes={node.sizes}
                containerRef={containerRef}
                onResize={(newSizes) => {
                  usePaneLayoutStore.getState().resizeSplit(node.id, newSizes);
                }}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};
