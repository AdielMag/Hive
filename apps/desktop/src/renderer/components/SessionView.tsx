import React from "react";
import { Transcript } from "./Transcript.tsx";
import { Composer } from "./Composer.tsx";
import { WorktreeBar } from "./WorktreeBar.tsx";
import { useUi } from "../store/ui-store.ts";
import { useDrag } from "../hooks/useDrag.ts";
import { useSessionStore, useSessionWorktree } from "../store/session-store.ts";
import { Slot } from "../modules/ModuleViews.tsx";

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
  const activeTabId = useSessionStore((s) => s.activeTabId);
  const targetTabId = tabId ?? activeTabId;
  const wt = useSessionWorktree(targetTabId);

  // An inactive pane's composer is covered, so its pending dialog (e.g. the bash-guard approval) must surface here.
  const parkedDialog = useSessionStore((s) => (!isActivePane && targetTabId ? s.tabUi[targetTabId]?.pendingUiDialog ?? null : null));
  const respondTabDialog = useSessionStore((s) => s.respondTabDialog);
  const respondParked = React.useCallback(
    (response: Parameters<typeof respondTabDialog>[1]) => (targetTabId ? respondTabDialog(targetTabId, response) : Promise.resolve()),
    [respondTabDialog, targetTabId],
  );

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
      {wt && <WorktreeBar tabId={tabId} />}
      <Transcript tabId={tabId} />
      <div className="resizer resizer--row" onMouseDown={startDrag} title="Drag to resize" />
      <div className="session-view__composer-wrap">
        {isActivePane ? (
          <Composer height={composerHeight} tabId={targetTabId} />
        ) : (
          <>
            {parkedDialog && (
              <Slot
                name="composer.above"
                props={{ pendingUiDialog: parkedDialog, respondDialog: respondParked, activeKey: null, shortcuts: false }}
              />
            )}
            <button className="composer-inactive-overlay composer-inactive-overlay--static" onClick={onActivate} title="Click to activate session">
              <span className="composer-inactive-badge">
                {parkedDialog ? "Waiting for your input: click to answer" : "Click to reply in this session"}
              </span>
            </button>
          </>
        )}
      </div>
    </div>
  );
};
