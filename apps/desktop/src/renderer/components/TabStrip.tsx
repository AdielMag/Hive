/** Tabs across the top of the content card (sessions, files, diffs, usage). Middle-click closes. */
import React from "react";
import { BarChart3, FileCode, GitCompare, Loader2, MessageSquare, Moon, PenLine, Plus, X } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import type { TabItem } from "@hive/protocol";
import { hasDraft, useSessionStore } from "../store/session-store.ts";
import { isCoreTabKind } from "@hive/protocol";
import { ModuleTabIcon, Slot, useModuleTabTitle } from "../modules/ModuleViews.tsx";
import { useShortcut } from "../features/commands/useShortcut.ts";

export const TabStrip: React.FC = () => {
  const { tabs, activeTabId, projects, switchTab, closeTab, newSessionTab, activeProject, running, sessionActivity, tabUi } = useSessionStore(
    useShallow((s) => ({
      tabs: s.tabs,
      activeTabId: s.activeTabId,
      projects: s.projects,
      switchTab: s.switchTab,
      closeTab: s.closeTab,
      newSessionTab: s.newSessionTab,
      openBrowserTab: s.openBrowserTab,
      activeProject: s.activeProject,
      running: s.transcript.running,
      sessionActivity: s.sessionActivity,
      tabUi: s.tabUi,
    })),
  );
  const newSessionShortcut = useShortcut("session.new");

  if (tabs.length === 0 && !activeProject) return null;

  return (
    <div className="tabstrip" role="tablist">
      {tabs.map((tab) => {
        const active = tab.id === activeTabId;
        const project = projects.find((p) => p.id === tab.projectId);
        const isSession = !tab.kind || tab.kind === "session";
        const activity = isSession ? sessionActivity[tab.id] : undefined;
        const busy = isSession && (activity === "running" || (active && running));
        const unseen = !busy && (activity === "done" || activity === "error") ? activity : undefined;
        // Parked (non-displayed) session state: a question waiting for you, or an unsent draft.
        const parked = isSession && !active ? tabUi[tab.id] : undefined;
        const needsInput = !!parked?.pendingUiDialog || !!parked?.pendingForm;
        const dotKind = needsInput ? "input" : unseen;
        const draft = hasDraft(parked);
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
            className={`tab${active ? " is-active" : ""}${busy ? " is-running" : ""}${unseen ? ` has-unseen is-${unseen}` : ""}${needsInput ? " needs-input" : ""}`}
            style={{ ["--tab-color" as string]: project?.color ?? "var(--accent-base)" }}
            onClick={() => void switchTab(tab.id)}
            onAuxClick={(e) => {
              if (e.button === 1) void closeTab(tab.id);
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
            {busy ? (
              <Loader2 size={12} className="spin tab__busy" />
            ) : (
              <span className="tab__end">
                {dotKind && <span className={`tab__dot tab__dot--${dotKind}`} aria-hidden />}
                <button
                  className="tab__close"
                  aria-label={`Close ${tab.title}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    void closeTab(tab.id);
                  }}
                >
                  <X size={12} />
                </button>
              </span>
            )}
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
      <Slot name="tabstrip.actions" />
    </div>
  );
};

const TabIcon: React.FC<{ tab: TabItem }> = ({ tab }) => {
  switch (tab.kind) {
    case "file":
      return <FileCode size={13} />;
    case "diff":
      return <GitCompare size={13} />;
    case "usage":
      return <BarChart3 size={13} />;

    default:
      return isCoreTabKind(tab.kind) ? <MessageSquare size={13} /> : <ModuleTabIcon tab={tab} />;
  }
};

const TabTitle: React.FC<{ tab: TabItem }> = ({ tab }) => {
  const title = useModuleTabTitle(tab);
  return <span className="tab__title">{isCoreTabKind(tab.kind) ? tab.title : title}</span>;
};
