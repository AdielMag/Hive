/** Tabs across the top of the content card (sessions, files, diffs, usage). Middle-click closes. */
import React from "react";
import { BarChart3, FileCode, GitCompare, Loader2, MessageSquare, Plus, X } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import type { TabItem } from "@pi-studio/protocol";
import { useSessionStore } from "../store/session-store.ts";

export const TabStrip: React.FC = () => {
  const { tabs, activeTabId, projects, switchTab, closeTab, newSessionTab, activeProject, running } = useSessionStore(
    useShallow((s) => ({
      tabs: s.tabs,
      activeTabId: s.activeTabId,
      projects: s.projects,
      switchTab: s.switchTab,
      closeTab: s.closeTab,
      newSessionTab: s.newSessionTab,
      activeProject: s.activeProject,
      running: s.transcript.running,
    })),
  );

  if (tabs.length === 0 && !activeProject) return null;

  return (
    <div className="tabstrip" role="tablist">
      {tabs.map((tab) => {
        const active = tab.id === activeTabId;
        const project = projects.find((p) => p.id === tab.projectId);
        const busy = active && running && (!tab.kind || tab.kind === "session");
        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={active}
            className={`tab${active ? " is-active" : ""}`}
            style={{ ["--tab-color" as string]: project?.color ?? "var(--accent-base)" }}
            onClick={() => void switchTab(tab.id)}
            onAuxClick={(e) => {
              if (e.button === 1) void closeTab(tab.id);
            }}
            title={tab.filePath ?? tab.title}
          >
            <span className="tab__icon">
              <TabIcon tab={tab} />
            </span>
            <span className="tab__title">{tab.title}</span>
            {busy ? (
              <Loader2 size={12} className="spin tab__busy" />
            ) : (
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
            )}
          </div>
        );
      })}
      {activeProject && (
        <button className="tabstrip__new" onClick={() => void newSessionTab(activeProject.id)} title={`New session in ${activeProject.name} (Ctrl+N)`}>
          <Plus size={14} />
        </button>
      )}
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
      return <MessageSquare size={13} />;
  }
};
