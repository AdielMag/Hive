/** Tabs across the top of a workbench pane (sessions, files, diffs, usage). Middle-click closes. Supports drag & drop reorder, split controls, and context menu. */
import React, { useMemo, useRef, useState } from "react";
import {
  Bot,
  Columns2,
  FolderOpen,
  GitBranch,
  Loader2,
  MessageSquare,
  Moon,
  PenLine,
  Plus,
  Rows2,
  Sparkles,
  X,
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import type { TabItem } from "@hive/protocol";
import { hasDraft, transcriptAwaitsUser, useSessionStore } from "../store/session-store.ts";
import { getFileManagerLabel } from "../lib/platform.ts";
import { playUiSound } from "../store/sound-store.ts";
import { isCoreTabKind } from "@hive/protocol";
import { ModuleTabIcon, Slot, useModuleTabTitle } from "../modules/ModuleViews.tsx";
import { useShortcut } from "../features/commands/useShortcut.ts";
import { usePaneLayoutStore } from "../store/pane-layout-store.ts";
import { askChoice } from "./ChoiceDialog.tsx";
import { ContextMenu, type ContextMenuEntry, type ContextMenuState } from "./ContextMenu.tsx";

const DOT_LABELS: Record<"input" | "done" | "error", string> = {
  input: "Waiting for you",
  done: "Done",
  error: "Error",
};

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
    switchTab,
    closeTab: storeCloseTab,
    newSessionTab,
    activeProject,
    runningNow,
    sessionActivity,
    tabUi,
    displayedTabId,
    displayedPendingDialog,
    displayedPendingForm,
    sessionAwaitingUser,
    displayedAwaitingTool,
    newSessionInMainTree,
    setNewSessionInMainTree,
    catalog,
    projects,
  } = useSessionStore(
    useShallow((s) => ({
      tabs: s.tabs,
      activeTabId: s.activeTabId,
      switchTab: s.switchTab,
      closeTab: s.closeTab,
      newSessionTab: s.newSessionTab,
      activeProject: s.activeProject,
      runningNow: s.transcript.running,
      sessionActivity: s.sessionActivity,
      tabUi: s.tabUi,
      displayedTabId: s.displayedTabId,
      displayedPendingDialog: !!s.pendingUiDialog,
      displayedPendingForm: !!s.pendingForm,
      sessionAwaitingUser: s.sessionAwaitingUser,
      displayedAwaitingTool: transcriptAwaitsUser(s.transcript),
      newSessionInMainTree: s.newSessionInMainTree,
      setNewSessionInMainTree: s.setNewSessionInMainTree,
      catalog: s.allSessions,
      projects: s.projects,
    })),
  );

  const displayedHasDraft = useSessionStore((s) => s.promptText.trim().length > 0 || s.attachments.length > 0);
  const newSessionShortcut = useShortcut("session.new");
  const tabstripRef = useRef<HTMLDivElement>(null);
  const [dropIndicatorLeft, setDropIndicatorLeft] = useState<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);

  const projectsById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

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
    if (tabId !== activeTabId) {
      playUiSound("tab_switch");
    }
    if (onSelectTab) {
      onSelectTab(tabId);
    } else {
      void switchTab(tabId);
    }
  };

  const closeNow = (tabId: string) => {
    if (onCloseTab) {
      onCloseTab(tabId);
    } else {
      void storeCloseTab(tabId);
    }
  };

  /** Close one or many tabs; confirm first when a session tab has a running agent or an unsent draft. */
  const requestClose = async (tabIds: string[]) => {
    const list = tabIds.map((id) => tabs.find((t) => t.id === id)).filter((t): t is TabItem => !!t);
    let running = 0;
    let drafts = 0;
    for (const t of list) {
      if (t.kind && t.kind !== "session") continue;
      const isRunning = sessionActivity[t.id] === "running" || (t.id === displayedTabId && runningNow);
      const isDraft = t.id === displayedTabId ? displayedHasDraft : hasDraft(tabUi[t.id]);
      if (isRunning) running++;
      if (isDraft) drafts++;
    }
    if (running > 0 || drafts > 0) {
      const body: string[] = [];
      if (list.length === 1) {
        if (running > 0) body.push(`"${list[0]!.title}" is still running. Closing the tab stops the agent.`);
        if (drafts > 0) body.push("It has an unsent draft that will be lost.");
      } else {
        body.push(`You're closing ${list.length} tabs.`);
        if (running > 0) body.push(`${running} ${running === 1 ? "has an agent that is" : "have agents that are"} still running and will be stopped.`);
        if (drafts > 0) body.push(`${drafts} ${drafts === 1 ? "has an unsent draft" : "have unsent drafts"} that will be lost.`);
      }
      const choice = await askChoice({
        title: list.length === 1 ? "Close this tab?" : `Close ${list.length} tabs?`,
        body,
        choices: [
          { id: "cancel", label: "Cancel" },
          { id: "close", label: list.length === 1 ? "Close tab" : `Close ${list.length} tabs`, tone: "danger" },
        ],
      });
      if (choice !== "close") return;
    }
    for (const t of list) closeNow(t.id);
  };

  const handleClose = (tabId: string) => void requestClose([tabId]);

  const onTabKeyDown = (e: React.KeyboardEvent<HTMLDivElement>, tabId: string) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleSelect(tabId);
      return;
    }
    const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
    if (!keys.includes(e.key)) return;
    const els = Array.from(tabstripRef.current?.querySelectorAll<HTMLElement>('[role="tab"]') ?? []);
    const i = els.indexOf(e.currentTarget);
    if (i < 0 || els.length === 0) return;
    e.preventDefault();
    const next =
      e.key === "Home" ? 0 : e.key === "End" ? els.length - 1 : (i + (e.key === "ArrowRight" ? 1 : -1) + els.length) % els.length;
    els[next]?.focus();
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
    const tabProject = tab.projectId ? projectsById.get(tab.projectId) : undefined;

    const items: ContextMenuEntry[] = [];

    if (tabProject) {
      items.push({
        label: `Project: ${tabProject.name}`,
        icon: tabProject.icon ? (
          <span style={{ fontSize: 13, lineHeight: 1 }}>{tabProject.icon}</span>
        ) : (
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: tabProject.color,
              display: "inline-block",
            }}
          />
        ),
        disabled: true,
      });
      items.push({ kind: "separator" });
    }

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
          void requestClose(tabs.filter((t) => t.id !== tab.id).map((t) => t.id));
        },
      });
      if (tabIndex < tabs.length - 1) {
        items.push({
          label: "Close to the Right",
          onSelect: () => {
            void requestClose(tabs.slice(tabIndex + 1).map((t) => t.id));
          },
        });
      }
    }

    if (tab.filePath) {
      items.push({ kind: "separator" });
      items.push({
        label: getFileManagerLabel(),
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

  const focusableTabId = tabs.some((t) => t.id === activeTabId) ? activeTabId : tabs[0]?.id;

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
          const isSession = !tab.kind || tab.kind === "session";
          const isSubagent = tab.kind === "subagent";
          const subagentRunning =
            isSubagent &&
            (tab.subagentView?.status === "running" ||
              tab.subagentView?.status === "queued" ||
              tab.subagentView?.status === "background");
          const subagentStatus = tab.subagentView?.status;
          const tabWorktree = isSession ? (tab.worktree ?? catalog.find((x) => x.path === tab.sessionPath)?.worktree) : undefined;
          const subagentUnseen =
            isSubagent &&
            !subagentRunning &&
            (subagentStatus === "completed"
              ? "done"
              : subagentStatus === "error" || subagentStatus === "aborted"
                ? "error"
                : undefined);
          const activity = isSession ? sessionActivity[tab.id] : undefined;
          const isRunning = (isSession && (activity === "running" || (active && tab.id === displayedTabId && runningNow))) || subagentRunning;
          // Parked (non-displayed) session state: a question waiting for you, or an unsent draft.
          const parked = isSession && tab.id !== displayedTabId ? tabUi[tab.id] : undefined;
          // Waiting on you (question form, or a confirm like the bash-guard approval). The agent is still
          // "running" while it waits, so this must win over the spinner or the wait is invisible.
          const needsInput =
            isSession &&
            (!!sessionAwaitingUser[tab.id] ||
              (tab.id === displayedTabId
                ? displayedPendingDialog || displayedPendingForm || displayedAwaitingTool
                : !!parked?.pendingUiDialog || !!parked?.pendingForm));
          const busy = isRunning && !needsInput;
          const unseen = !busy && !needsInput && (activity === "done" || activity === "error" ? activity : subagentUnseen);
          const dotKind = needsInput ? "input" : unseen;
          const draft = hasDraft(isSession && !active ? tabUi[tab.id] : undefined);
          const tabProject = tab.projectId ? projectsById.get(tab.projectId) : undefined;
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
              tabIndex={tab.id === focusableTabId ? 0 : -1}
              onKeyDown={(e) => onTabKeyDown(e, tab.id)}
              draggable={true}
              onDragStart={(e) => handleDragStart(e, tab)}
              onDragEnd={handleDragEnd}
              onContextMenu={(e) => openContextMenu(e, tab)}
              className={`tab${active ? " is-active" : ""}${busy ? " is-running" : ""}${unseen ? ` has-unseen is-${unseen}` : ""}${needsInput ? " needs-input" : ""}${tabProject ? " has-project" : ""}`}
              style={{ "--tab-pcolor": tabProject?.color } as React.CSSProperties}
              onClick={() => handleSelect(tab.id)}
              onAuxClick={(e) => {
                if (e.button === 1) handleClose(tab.id);
              }}
              title={(tab.filePath ?? tab.title) + stateLabel + (tabWorktree ? `\nBranch: ${tabWorktree.branch}` : "")}
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
                {busy && (
                  <span className="tab__busy" aria-hidden>
                    <Loader2 size={12} className="spin" />
                  </span>
                )}
                {!busy && dotKind && <span
                    className={`tab__dot tab__dot--${dotKind}`}
                    role="img"
                    aria-label={DOT_LABELS[dotKind]}
                    title={DOT_LABELS[dotKind]}
                  />}
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
            className={`tabstrip__new${newSessionInMainTree ? " is-main-tree" : ""}`}
            onClick={() => {
              if (paneId) {
                usePaneLayoutStore.getState().setActivePaneId(paneId);
              }
              void newSessionTab(activeProject.id, paneId);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu({
                x: e.clientX,
                y: e.clientY,
                items: [
                  {
                    label: "Work in main tree",
                    icon: <GitBranch size={13} />,
                    hint: newSessionInMainTree ? "on" : "off",
                    onSelect: () => setNewSessionInMainTree(!newSessionInMainTree),
                  },
                ],
              });
            }}
            title={
              (newSessionShortcut ? `New session in ${activeProject.name} (${newSessionShortcut})` : `New session in ${activeProject.name}`) +
              (newSessionInMainTree ? "\nRuns in the main tree (no worktree). Right-click to change." : "\nGets its own git worktree. Right-click to work in the main tree.")
            }
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
    case "tidy":
      return <Sparkles size={13} />;

    default:
      return isCoreTabKind(tab.kind) ? <MessageSquare size={13} /> : <ModuleTabIcon tab={tab} />;
  }
};

const TabTitle: React.FC<{ tab: TabItem }> = ({ tab }) => {
  const title = useModuleTabTitle(tab);
  return <span className="tab__title">{isCoreTabKind(tab.kind) ? tab.title : title}</span>;
};
