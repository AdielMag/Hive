import React, { lazy, Suspense } from "react";
import { isCoreTabKind } from "@hive/protocol";
import { useSessionStore } from "../store/session-store.ts";
import { usePaneLayoutStore, findLeaf, type PaneLeaf } from "../store/pane-layout-store.ts";
import { TabStrip } from "./TabStrip.tsx";
import { PaneDropOverlay, type DropZone } from "./PaneDropOverlay.tsx";
import { SessionView } from "./SessionView.tsx";
import { WelcomeView } from "./WelcomeView.tsx";
import { ModuleTabView } from "../modules/ModuleViews.tsx";
import { ErrorBoundary } from "./ErrorBoundary.tsx";

const named = <T extends string>(loader: () => Promise<Record<T, React.ComponentType<any>>>, key: T) =>
  lazy(() => loader().then((m) => ({ default: m[key] })));

const SubagentTab = named(() => import("./SubagentTab.tsx"), "SubagentTab");

const Loading: React.FC = () => <div className="ui-skeleton" style={{ margin: 16, height: 120, flex: "none" }} />;

export interface WorkbenchPaneProps {
  pane: PaneLeaf;
  isActivePane: boolean;
  onActivate: () => void;
}

export const WorkbenchPane: React.FC<WorkbenchPaneProps> = ({
  pane,
  isActivePane,
  onActivate,
}) => {
  const tabs = useSessionStore((s) => s.tabs);
  const activeTab = tabs.find((t) => t.id === pane.activeTabId);
  const hasSession = activeTab?.kind === "session" || (!activeTab?.kind && !!activeTab);

  const handleSelectTab = (tabId: string) => {
    usePaneLayoutStore.getState().setActiveTabInPane(pane.id, tabId);
    void useSessionStore.getState().switchTab(tabId);
  };

  const handleCloseTab = (tabId: string) => {
    // Prefer a neighbour inside this pane so closing a tab never yanks focus into another pane.
    const live = findLeaf(usePaneLayoutStore.getState().root, pane.id) ?? pane;
    const idx = live.tabIds.indexOf(tabId);
    const neighbour = idx === -1 ? undefined : live.tabIds[idx + 1] ?? live.tabIds[idx - 1];
    usePaneLayoutStore.getState().closeTab(tabId);
    void useSessionStore.getState().closeTab(tabId, neighbour);
  };

  const handleDropTab = (tabId: string, zone: DropZone) => {
    usePaneLayoutStore.getState().setDraggingTab(null);
    if (zone === "center") {
      if (pane.tabIds.includes(tabId)) return;
      usePaneLayoutStore.getState().moveTab(tabId, pane.id);
    } else {
      usePaneLayoutStore.getState().splitPane(tabId, pane.id, zone);
    }
    void useSessionStore.getState().switchTab(tabId);
  };

  return (
    <div
      className={`workbench-pane${isActivePane ? " is-active" : ""}`}
      onPointerDown={(e) => {
        // Tab clicks activate themselves (and pick the right tab); don't pre-empt them.
        if ((e.target as HTMLElement).closest(".tabstrip")) return;
        onActivate();
      }}
    >
      <TabStrip
        paneId={pane.id}
        tabIds={pane.tabIds}
        activeTabId={pane.activeTabId}
        onSelectTab={handleSelectTab}
        onCloseTab={handleCloseTab}
        showSplitControls={true}
      />
      <div className="workbench-pane__content">
        <PaneDropOverlay paneId={pane.id} onDropTab={handleDropTab} />
        <ErrorBoundary label="Editor" resetKey={activeTab?.id ?? pane.id}>
          <Suspense fallback={<Loading />}>
            {activeTab?.kind === "subagent" ? (
              <SubagentTab tab={activeTab} />
            ) : activeTab && !isCoreTabKind(activeTab.kind) ? (
              <ModuleTabView
                tab={activeTab}
                onClose={() => void handleCloseTab(activeTab.id)}
              />
            ) : hasSession ? (
              <SessionView
                tabId={activeTab?.id}
                isActivePane={isActivePane}
                onActivate={onActivate}
              />
            ) : (
              <WelcomeView />
            )}
          </Suspense>
        </ErrorBoundary>
      </div>
    </div>
  );
};
