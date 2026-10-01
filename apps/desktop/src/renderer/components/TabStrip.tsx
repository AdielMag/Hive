import React from "react";
import { FolderKanban, X, Plus, Loader2, FileCode, GitCompare } from "lucide-react";
import { useSessionStore } from "../store/session-store.ts";

export const TabStrip: React.FC = () => {
  const {
    tabs,
    activeTabId,
    projects,
    switchTab,
    closeTab,
    newSessionTab,
    activeProject,
    transcript,
  } = useSessionStore();

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        height: 38,
        background: "var(--bg-sidebar)",
        borderBottom: "1px solid var(--border-subtle)",
        padding: "0 8px",
        gap: 4,
        userSelect: "none",
        overflowX: "auto",
      }}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        const project = projects.find((p) => p.id === tab.projectId);
        const color = project?.color || "var(--accent-base)";
        const isRunning = isActive && transcript.running;

        return (
          <div
            key={tab.id}
            onClick={() => switchTab(tab.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: isActive ? "var(--bg-app)" : "rgba(255, 255, 255, 0.03)",
              padding: "4px 10px 4px 12px",
              borderRadius: "6px 6px 0 0",
              borderTop: `3px solid ${color}`,
              borderLeft: isActive ? "1px solid var(--border-subtle)" : "1px solid transparent",
              borderRight: isActive ? "1px solid var(--border-subtle)" : "1px solid transparent",
              height: 34,
              marginTop: 4,
              fontSize: 12,
              fontWeight: isActive ? 600 : 400,
              color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
              cursor: "pointer",
              maxWidth: 200,
              minWidth: 100,
            }}
          >
            {tab.kind === "file" ? (
              <FileCode size={13} color="#38bdf8" style={{ flexShrink: 0 }} />
            ) : tab.kind === "diff" ? (
              <GitCompare size={13} color={tab.diffStaged ? "#10b981" : "#539bf5"} style={{ flexShrink: 0 }} />
            ) : (
              <FolderKanban size={13} color={color} style={{ flexShrink: 0 }} />
            )}
            <span
              style={{
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={tab.title}
            >
              {tab.title}
            </span>

            {isRunning ? (
              <Loader2
                size={12}
                color="var(--accent-base)"
                style={{ animation: "spin 1s linear infinite", flexShrink: 0 }}
              />
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  void closeTab(tab.id);
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  display: "flex",
                  padding: 2,
                  borderRadius: 2,
                }}
              >
                <X size={12} />
              </button>
            )}
          </div>
        );
      })}

      {/* New Session in active project */}
      {activeProject && (
        <button
          onClick={() => newSessionTab(activeProject.id)}
          title={`New session in ${activeProject.name}`}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "transparent",
            border: "1px dashed var(--border-subtle)",
            color: "var(--text-muted)",
            borderRadius: 4,
            width: 24,
            height: 24,
            cursor: "pointer",
            marginLeft: 4,
          }}
        >
          <Plus size={14} />
        </button>
      )}
    </div>
  );
};
