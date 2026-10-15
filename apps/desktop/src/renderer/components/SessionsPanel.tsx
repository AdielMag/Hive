import React, { useMemo, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  GitBranch,
  MessageSquare,
  MessageSquarePlus,
  Pencil,
  Trash2,
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import type { SessionCatalogItem } from "@hive/protocol";
import { transcriptAwaitsUser, useSessionStore } from "../store/session-store.ts";
import { sessionDisplayTitle } from "../lib/session-title.ts";
import { formatAgo } from "../lib/format.ts";
import { ContextMenu, type ContextMenuState } from "./ContextMenu.tsx";
import { worktreeChipLabel, worktreeTooltipLines } from "../lib/worktree.ts";
import { archiveSession } from "../store/worktree-actions.ts";

type SessionBadge = "running" | "input" | "done" | "error";

const BADGE_LABEL: Record<SessionBadge, string> = {
  running: "running",
  input: "waiting for your input",
  done: "finished, not viewed yet",
  error: "failed, not viewed yet",
};

export const SessionsPanel: React.FC = () => {
  const {
    activeProject,
    allSessions,
    activeSessionPath,
    openSessionTab,
    newSessionTab,
    deleteSessionFile,
    renameSession,
    setSessionArchived,
    tabs,
    activeTabId,
    sessionActivity,
    tabUi,
    displayedTabId,
    displayedNeedsInput,
    sessionAwaitingUser,
  } = useSessionStore(
    useShallow((s) => ({
      activeProject: s.activeProject,
      allSessions: s.allSessions,
      activeSessionPath: s.tabs.find((t) => t.id === s.activeTabId)?.sessionPath,
      openSessionTab: s.openSessionTab,
      newSessionTab: s.newSessionTab,
      deleteSessionFile: s.deleteSessionFile,
      renameSession: s.renameSession,
      setSessionArchived: s.setSessionArchived,
      tabs: s.tabs,
      activeTabId: s.activeTabId,
      sessionActivity: s.sessionActivity,
      tabUi: s.tabUi,
      displayedTabId: s.displayedTabId,
      displayedNeedsInput: !!s.pendingUiDialog || !!s.pendingForm || transcriptAwaitsUser(s.transcript),
      sessionAwaitingUser: s.sessionAwaitingUser,
    })),
  );

  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [editingSessionPath, setEditingSessionPath] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const sessionState = useMemo(() => {
    const out: Record<string, SessionBadge> = {};
    for (const t of tabs) {
      if ((t.kind && t.kind !== "session") || !t.sessionPath) continue;
      const active = t.id === activeTabId;
      const activity = sessionActivity[t.id];
      const needsInput =
        !!sessionAwaitingUser[t.id] ||
        (t.id === displayedTabId
          ? displayedNeedsInput
          : !!tabUi[t.id]?.pendingUiDialog || !!tabUi[t.id]?.pendingForm);
      if (needsInput) {
        out[t.sessionPath] = "input";
      } else if (activity === "running") {
        out[t.sessionPath] = "running";
      } else if (!active && (activity === "done" || activity === "error")) {
        out[t.sessionPath] = activity;
      }
    }
    return out;
  }, [tabs, activeTabId, sessionActivity, sessionAwaitingUser, displayedTabId, displayedNeedsInput, tabUi]);

  const projectSessions = useMemo(() => {
    if (!activeProject) return [];
    return allSessions
      .filter((s) => s.projectId === activeProject.id)
      .sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());
  }, [allSessions, activeProject]);

  const filteredSessions = useMemo(() => {
    return projectSessions.filter((s) => {
      if (!showArchived && s.archived) return false;
      if (search.trim()) {
        const query = search.toLowerCase();
        const title = (s.title || s.aiTitle || s.firstMessage || "").toLowerCase();
        return title.includes(query);
      }
      return true;
    });
  }, [projectSessions, showArchived, search]);

  const handleStartRename = (session: SessionCatalogItem) => {
    setEditingSessionPath(session.path);
    setEditingTitle(session.title || session.aiTitle || session.firstMessage || "");
  };

  const handleCommitRename = (sessionPath: string) => {
    if (editingSessionPath === sessionPath) {
      void renameSession(sessionPath, editingTitle.trim());
      setEditingSessionPath(null);
    }
  };

  if (!activeProject) {
    return (
      <div className="sessions-panel sessions-panel--empty">
        <p className="sessions-panel__muted">No project selected.</p>
      </div>
    );
  }

  return (
    <div className="sessions-panel">
      <div className="sessions-panel__header">
        <div className="sessions-panel__title-row">
          <span className="sessions-panel__title">Sessions</span>
          <button
            type="button"
            className="sessions-panel__new-btn"
            onClick={() => void newSessionTab(activeProject.id)}
            title="Start a new session"
          >
            <MessageSquarePlus size={14} />
            <span>New Session</span>
          </button>
        </div>
        <div className="sessions-panel__search-row">
          <input
            type="text"
            className="sessions-panel__search-input"
            placeholder="Search sessions…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="sessions-panel__list">
        {filteredSessions.length === 0 ? (
          <div className="sessions-panel__empty">
            <p>No sessions found.</p>
          </div>
        ) : (
          filteredSessions.map((s) => {
            const isCurrent = s.path === activeSessionPath;
            const badge = sessionState[s.path];
            const isEditing = editingSessionPath === s.path;
            const display = sessionDisplayTitle(s, 50);

            return (
              <div
                key={s.path}
                className={`sessions-panel__item${isCurrent ? " is-active" : ""}`}
                onClick={() => !isEditing && void openSessionTab(s.path, activeProject.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({
                    x: e.clientX,
                    y: e.clientY,
                    items: [
                      {
                        label: "Rename",
                        icon: <Pencil size={13} />,
                        onSelect: () => handleStartRename(s),
                      },
                      {
                        label: s.archived ? "Restore from archive" : "Archive",
                        icon: s.archived ? <ArchiveRestore size={13} /> : <Archive size={13} />,
                        onSelect: () => {
                          if (s.archived) {
                            void setSessionArchived(s.path, false);
                          } else {
                            void archiveSession(s);
                          }
                        },
                      },
                      { kind: "separator" },
                      {
                        label: "Delete",
                        icon: <Trash2 size={13} />,
                        danger: true,
                        onSelect: () => void deleteSessionFile(s.path),
                      },
                    ],
                  });
                }}
              >
                <div className="sessions-panel__item-main">
                  <div className="sessions-panel__item-icon">
                    <MessageSquare size={13} />
                  </div>
                  {isEditing ? (
                    <input
                      autoFocus
                      type="text"
                      className="sessions-panel__rename-input"
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onBlur={() => handleCommitRename(s.path)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleCommitRename(s.path);
                        if (e.key === "Escape") setEditingSessionPath(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span className="sessions-panel__item-title" title={display}>
                      {display}
                    </span>
                  )}
                  {badge && (
                    <span
                      className={`sessions-panel__badge sessions-panel__badge--${badge}`}
                      title={BADGE_LABEL[badge]}
                    />
                  )}
                </div>

                <div className="sessions-panel__item-meta">
                  <span className="sessions-panel__item-time">{formatAgo(new Date(s.modified).getTime())}</span>
                  {s.worktree && (
                    <span
                      className="sessions-panel__chip"
                      title={worktreeTooltipLines(s.worktree).join("\n")}
                    >
                      <GitBranch size={10} />
                      {worktreeChipLabel(s.worktree)}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="sessions-panel__footer">
        <label className="sessions-panel__toggle-label">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          <span>Show archived</span>
        </label>
      </div>

      {contextMenu && (
        <ContextMenu
          menu={contextMenu}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
};
