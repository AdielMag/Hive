import React from "react";
import { Transcript } from "./Transcript.tsx";
import { Composer } from "./Composer.tsx";
import { useUi } from "../store/ui-store.ts";
import { useDrag } from "../hooks/useDrag.ts";

export interface SessionViewProps {
  tabId?: string;
  isActivePane?: boolean;
  onActivate?: () => void;
}

export const SessionView: React.FC<SessionViewProps> = ({
  tabId,
  isActivePane = true,
  onActivate,
}) => {
  const composerHeight = useUi((s) => s.composerHeight);
  const setSize = useUi((s) => s.setSize);
  const startDrag = useDrag(
    "row",
    (dy, start) => setSize({ composerHeight: start - dy }),
    () => composerHeight,
  );

  return (
    <div
      className={`session-view${isActivePane ? " is-active" : " is-inactive"}`}
      onClick={!isActivePane ? onActivate : undefined}
    >
      <Transcript tabId={tabId} />
      <div className="resizer resizer--row" onMouseDown={startDrag} title="Drag to resize" />
      <div className="session-view__composer-wrap">
        {isActivePane ? (
          <Composer height={composerHeight} />
        ) : (
          <button className="composer-inactive-overlay composer-inactive-overlay--static" onClick={onActivate} title="Click to activate session">
            <span className="composer-inactive-badge">Click to reply in this session</span>
          </button>
        )}
      </div>
    </div>
  );
};
