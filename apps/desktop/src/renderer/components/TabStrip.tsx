/** Tabs across the top of a workbench pane (sessions, files, diffs, usage). Middle-click closes. Supports drag & drop reorder, split controls, and context menu. */
import React, { useMemo, useRef, useState } from "react";
import {
  Bot,
  Columns2,
  FolderOpen,
  Loader2,
  MessageSquare,
  Moon,
  PenLine,
  Plus,
  Rows2,
  X,
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import type { TabItem } from "@hive/protocol";
import { hasDraft, useSessionStore } from "../store/session-store.ts";
import { isCoreTabKind } from "@hive/protocol";
import { ModuleTabIcon, Slot, useModuleTabTitle } from "../modules/ModuleViews.tsx";
import { useShortcut } from "../features/commands/useShortcut.ts";
import { usePaneLayoutStore } from "../store/pane-layout-store.ts";
import { ContextMenu, type ContextMenuEntry, type ContextMenuState } from "./ContextMenu.tsx";

export interface TabStripProps {
  paneId?: string;
  tabIds?: string[];
  activeTabId?: string | null;
  onSelectTab?: (tabId: string) => void;
  onCloseTab?: (tabId: string) => void;
  showSplitControls?: boolean;
}

export const TabStrip: React.FC<TabStripProps> = ({
  paneId,
  tabIds,
  activeTabId: propActiveTabId,
  onSelectTab,
  onCloseTab,
  showSplitControls = true,
}) => {
  const {
    tabs: allTabs,
    activeTabId: storeActiveTabId,
    projects,
    switchTab,
    closeTab: storeCloseTab,
    newSessionTab,
    activeProject,
    running,
    sessionActivity,
    tabUi,
    displayedTabId,
    displayedPendingDialog,
    displayedPendingForm,
  } = useSessionStore(
    useShallow((s) => ({
      tabs: s.tabs,
      activeTabId: s.activeTabId,
      projects: s.projects,
      switchTab: s.switchTab,
      closeTab: s.closeTab,
      newSessionTab: s.newSessionTab,
      activeProject: s.activeProject,
      running: s.transcript.running,
      sessionActivity: s.sessionActivity,
      tabUi: s.tabUi,
      displayedTabId: s.displayedTabId,
      displayedPendingDialog: !!s.pendingUiDialog,
      displayedPendingForm: !!s.pendingForm,
    })),
  );

  const newSessionShortcut = useShortcut("session.new");
  const tabstripRef = useRef<HTMLDivElement>(null);
  const [dropIndicatorLeft, setDropIndicatorLeft] = useState<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);

  const tabs = useMemo(() => {
    if (!tabIds) return allTabs;
    const map = new Map(allTabs.map((t) => [t.id, t]));
    const list: TabItem[] = [];
    for (const id of tabIds) {
      const item = map.get(id);
      if (item) list.push(item);
    }
    return list;
  }, [allTabs, tabIds]);

  const activeTabId = propActiveTabId !== undefined ? propActiveTabId : storeActiveTabId;

  const handleSelect = (tabId: string) => {
    if (onSelectTab) {
      onSelectTab(tabId);
    } else {
      void switchTab(tabId);
    }
  };

  const handleClose = (tabId: string) => {
    if (onCloseTab) {
      onCloseTab(tabId);
    } else {
      void storeCloseTab(tabId);
    }
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, tab: TabItem) => {
    e.dataTransfer.setData("application/x-hive-tab", tab.id);
    e.dataTransfer.setData("text/plain", tab.id);
    e.dataTransfer.effectAllowed = "move";
    // Defer: mounting the drop overlays synchronously inside dragstart can cancel the drag in Chromium.
    const sourcePaneId = paneId ?? "";
    setTimeout(() => usePaneLayoutStore.getState().setDraggingTab({ tabId: tab.id, sourcePaneId }), 0);
  };

  const handleDragEnd = () => {
    usePaneLayoutStore.getState().setDraggingTab(null);
    setDropIndicatorLeft(null);
    setDropTargetIndex(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    const dragging = usePaneLayoutStore.getState().draggingTab;
    if (!e.dataTransfer.types.includes("application/x-hive-tab") && !dragging) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";

    const strip = tabstripRef.current;
    if (!strip) return;

    const stripRect = strip.getBoundingClientRect();
    const tabElements = Array.from(strip.querySelectorAll<HTMLElement>(".tab"));

    if (tabElements.length === 0) {
      setDropIndicatorLeft(8);
      setDropTargetIndex(0);
      return;
    }

    let targetIdx = tabElements.length;
    let indicatorX = stripRect.width - 8;

    for (let i = 0; i < tabElements.length; i++) {
      const el = tabElements[i]!;
      const r = el.getBoundingClientRect();
      const mid = r.left + r.width / 2;
      if (e.clientX < mid) {
        targetIdx = i;
        indicatorX = r.left - stripRect.left;
        break;
      } else if (i === tabElements.length - 1 && e.clientX <= r.right + 20) {
        targetIdx = tabElements.length;
        indicatorX = r.right - stripRect.left;
      }
    }

    setDropIndicatorLeft(indicatorX);
    setDropTargetIndex(targetIdx);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    const strip = tabstripRef.current;
    if (!strip) return;
    const r = strip.getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX >= r.right ||
      e.clientY < r.top ||
      e.clientY >= r.bottom
    ) {
      setDropIndicatorLeft(null);
      setDropTargetIndex(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const draggedTabId =
      e.dataTransfer.getData("application/x-hive-tab") ||
      usePaneLayoutStore.getState().draggingTab?.tabId;
    const targetIdx = dropTargetIndex ?? tabs.length;

    setDropIndicatorLeft(null);
    setDropTargetIndex(null);
    usePaneLayoutStore.getState().setDraggingTab(null);

    if (!draggedTabId) return;

    if (paneId) {
      const fromIndex = tabs.findIndex((t) => t.id === draggedTabId);
      if (fromIndex !== -1) {
        // Reordering within the same pane
        // targetIdx is an insertion point in the current list; removing the tab first shifts it left.
        usePaneLayoutStore.getState().reorderTab(paneId, fromIndex, fromIndex < targetIdx ? targetIdx - 1 : targetIdx);
      } else {
        // Moving from a different pane
        usePaneLayoutStore.getState().moveTab(draggedTabId, paneId, targetIdx);
      }
    } else {
      const fromIndex = allTabs.findIndex((t) => t.id === draggedTabId);
      if (fromIndex !== -1) {
        useSessionStore.getState().reorderTabs(fromIndex, Math.min(fromIndex < targetIdx ? targetIdx - 1 : targetIdx, allTabs.length - 1));
      }
    }

    handleSelect(draggedTabId);
  };

  const handleSplit = (direction: "right" | "bottom") => {
    const currentTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];
    if (!currentTab || !paneId) return;
    usePaneLayoutStore.getState().splitPane(currentTab.id, paneId, direction);
    void switchTab(currentTab.id);
  };

  const openContextMenu = (e: React.MouseEvent, tab: TabItem) => {
    e.preventDefault();
    e.stopPropagation();
    const tabIndex = tabs.findIndex((t) => t.id === tab.id);

    const items: ContextMenuEntry[] = [];

    if (paneId) {
      items.push({
        label: "Split Right",
        icon: <Columns2 size={14} />,
        onSelect: () => {
          usePaneLayoutStore.getState().splitPane(tab.id, paneId, "right");
          void switchTab(tab.id);
        },
      });
      items.push({
        label: "Split Down",
        icon: <Rows2 size={14} />,
        onSelect: () => {
          usePaneLayoutStore.getState().splitPane(tab.id, paneId, "bottom");
          void switchTab(tab.id);
        },
      });
      items.push({ kind: "separator" });
    }

    items.push({
      label: "Close Tab",
      icon: <X size={14} />,
      onSelect: () => handleClose(tab.id),
    });

    if (tabs.length > 1) {
      items.push({
        label: "Close Others",
        onSelect: () => {
          const others = tabs.filter((t) => t.id !== tab.id);
          for (const o of others) handleClose(o.id);
        },
      });
      if (tabIndex < tabs.length - 1) {
        items.push({
          label: "Close to the Right",
          onSelect: () => {
            const rightTabs = tabs.slice(tabIndex + 1);
            for (const r of rightTabs) handleClose(r.id);
          },
        });
      }
    }

    if (tab.filePath) {
      items.push({ kind: "separator" });
      items.push({
        label: "Show in Folder",
        icon: <FolderOpen size={14} />,
        onSelect: () => {
          if (tab.filePath) void window.studio.showItemInFolder(tab.filePath);
        },
      });
    }

    setMenu({
      x: e.clientX,
      y: e.clientY,
      items,
    });
  };

  if (tabs.length === 0 && !activeProject) return null;

  return (
    <>
      <div
        ref={tabstripRef}
        className="tabstrip"
        role="tablist"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {dropIndicatorLeft !== null && (
          <div
            className="tabstrip__drop-indicator"
            style={{ left: dropIndicatorLeft }}
          />
        )}
        {tabs.map((tab) => {
          const active = tab.id === activeTabId;
          const project = projects.find((p) => p.id === tab.projectId);
          const isSession = !tab.kind || tab.kind === "session";
          const isSubagent = tab.kind === "subagent";
          const subagentRunning =
            isSubagent &&
            (tab.subagentView?.status === "running" ||
              tab.subagentView?.status === "queued" ||
              tab.subagentView?.status === "background");
          const subagentStatus = tab.subagentView?.status;
          const subagentUnseen =
            isSubagent &&
            !subagentRunning &&
            (subagentStatus === "completed"
              ? "done"
              : subagentStatus === "error" || subagentStatus === "aborted"
                ? "error"
                : undefined);
          const activity = isSession ? sessionActivity[tab.id] : undefined;
          const isRunning = (isSession && (activity === "running" || (active && tab.id === displayedTabId && running))) || subagentRunning;
          // Parked (non-displayed) session state: a question waiting for you, or an unsent draft.
          const parked = isSession && tab.id !== displayedTabId ? tabUi[tab.id] : undefined;
          // Waiting on you (question form, or a confirm like the bash-guard approval). The agent is still
          // "running" while it waits, so this must win over the spinner or the wait is invisible.
          const needsInput =
            isSession &&
            (tab.id === displayedTabId
              ? displayedPendingDialog || displayedPendingForm
              : !!parked?.pendingUiDialog || !!parked?.pendingForm);
          const busy = isRunning && !needsInput;
          const unseen = !busy && !needsInput && (activity === "done" || activity === "error" ? activity : subagentUnseen);
          const dotKind = needsInput ? "input" : unseen;
          const draft = hasDraft(isSession && !active ? tabUi[tab.id] : undefined);
          const stateLabel =
            (needsInput
              ? " (waiting for your input)"
              : busy
                ? " (running)"
                : unseen === "done"
                  ? " (finished, not viewed yet)"
                  : unseen === "error"
                    ? " (failed, not viewed yet)"
                    : "") +
            (draft ? " (unsent draft)" : "") +
            (tab.kind === "browser" && tab.isSleeping ? " (sleeping to save RAM)" : "");
          return (
            <div
              key={tab.id}
              role="tab"
              aria-selected={active}
              draggable={true}
              onDragStart={(e) => handleDragStart(e, tab)}
              onDragEnd={handleDragEnd}
              onContextMenu={(e) => openContextMenu(e, tab)}
              className={`tab${active ? " is-active" : ""}${busy ? " is-running" : ""}${unseen ? ` has-unseen is-${unseen}` : ""}${needsInput ? " needs-input" : ""}`}
              style={{ ["--tab-color" as string]: project?.color ?? "var(--accent-base)" }}
              onClick={() => handleSelect(tab.id)}
              onAuxClick={(e) => {
                if (e.button === 1) handleClose(tab.id);
              }}
              title={(tab.filePath ?? tab.title) + stateLabel}
              aria-label={tab.title + stateLabel}
            >
              <span className="tab__icon">
                <TabIcon tab={tab} />
              </span>
              <TabTitle tab={tab} />
              {tab.kind === "browser" && tab.isSleeping && (
                <span className="tab__sleep-badge" title="Sleeping to save RAM">
                  <Moon size={10} />
                </span>
              )}
              {draft && (
                <span className="tab__draft" aria-hidden title="Unsent draft">
                  <PenLine size={11} />
                </span>
              )}
              <span className="tab__end">
                {busy && <Loader2 size={12} className="spin tab__busy" aria-hidden />}
                {!busy && dotKind && <span className={`tab__dot tab__dot--${dotKind}`} aria-hidden />}
                <button
                  className="tab__close"
                  aria-label={`Close ${tab.title}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleClose(tab.id);
                  }}
                >
                  <X size={12} />
                </button>
              </span>
            </div>
          );
        })}
        {activeProject && (
          <button
            className="tabstrip__new"
            onClick={() => void newSessionTab(activeProject.id)}
            title={newSessionShortcut ? `New session in ${activeProject.name} (${newSessionShortcut})` : `New session in ${activeProject.name}`}
          >
            <Plus size={14} />
          </button>
        )}

        <div className="tabstrip__spacer" />

        {showSplitControls && paneId && (
          <div className="tabstrip__split-tools">
            <button
              className="tabstrip__split-btn"
              onClick={() => handleSplit("right")}
              title="Split Editor Right (Side by side)"
              disabled={tabs.length === 0}
            >
              <Columns2 size={14} />
            </button>
            <button
              className="tabstrip__split-btn"
              onClick={() => handleSplit("bottom")}
              title="Split Editor Down (Stacked)"
              disabled={tabs.length === 0}
            >
              <Rows2 size={14} />
            </button>
          </div>
        )}

        <Slot name="tabstrip.actions" />
      </div>
      <ContextMenu menu={menu} onClose={() => setMenu(null)} />
    </>
  );
};

const TabIcon: React.FC<{ tab: TabItem }> = ({ tab }) => {
  switch (tab.kind) {
    case "subagent":
      return <Bot size={13} />;

    default:
      return isCoreTabKind(tab.kind) ? <MessageSquare size={13} /> : <ModuleTabIcon tab={tab} />;
  }
};

const TabTitle: React.FC<{ tab: TabItem }> = ({ tab }) => {
  const title = useModuleTabTitle(tab);
  return <span className="tab__title">{isCoreTabKind(tab.kind) ? tab.title : title}</span>;
};
