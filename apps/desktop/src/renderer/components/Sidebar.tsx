import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  FolderPlus,
  Link2,
  Loader2,
  MessageSquare,
  MessageSquarePlus,
  Pencil,
  Plus,
  Settings2,
  Trash2,
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import type { ProjectEntry, SessionCatalogItem } from "@hive/protocol";
import { useSessionStore } from "../store/session-store.ts";
import { sessionDisplayTitle } from "../lib/session-title.ts";
import { formatAgo } from "../lib/format.ts";
import { ContextMenu, type ContextMenuState } from "./ContextMenu.tsx";
import { ProjectSettingsModal, type ProjectSettingsSection } from "./ProjectSettingsModal.tsx";

const VISIBLE_SESSIONS = 5;

type SessionBadge = "running" | "input" | "done" | "error";

const BADGE_LABEL: Record<SessionBadge, string> = {
  running: "running",
  input: "waiting for your input",
  done: "finished, not viewed yet",
  error: "failed, not viewed yet",
};

export const Sidebar: React.FC = () => {
  const {
    projects,
    allSessions,
    activeSessionPath,
    addProject,
    openSessionTab,
    newSessionTab,
    deleteSessionFile,
    renameSession,
    setSessionArchived,
    tabs,
    activeTabId,
    sessionActivity,
    tabUi,
    activeRunning,
  } = useSessionStore(
    useShallow((s) => ({
      projects: s.projects,
      allSessions: s.allSessions,
      activeSessionPath: s.tabs.find((t) => t.id === s.activeTabId)?.sessionPath,
      addProject: s.addProject,
      openSessionTab: s.openSessionTab,
      newSessionTab: s.newSessionTab,
      deleteSessionFile: s.deleteSessionFile,
      renameSession: s.renameSession,
      setSessionArchived: s.setSessionArchived,
      tabs: s.tabs,
      activeTabId: s.activeTabId,
      sessionActivity: s.sessionActivity,
      tabUi: s.tabUi,
      activeRunning: s.transcript.running,
    })),
  );

  // Live agent state per session file, mirroring the tab strip: running / waiting for input / unseen result.
  const sessionState = useMemo(() => {
    const out: Record<string, SessionBadge> = {};
    for (const t of tabs) {
      if ((t.kind && t.kind !== "session") || !t.sessionPath) continue;
      const active = t.id === activeTabId;
      const activity = sessionActivity[t.id];
      if (activity === "running" || (active && activeRunning)) out[t.sessionPath] = "running";
      else if (!active && tabUi[t.id]?.pendingUiDialog) out[t.sessionPath] = "input";
      else if (activity === "done" || activity === "error") out[t.sessionPath] = activity;
    }
    return out;
  }, [tabs, activeTabId, sessionActivity, tabUi, activeRunning]);

  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});
  const [showAllSessions, setShowAllSessions] = useState<Record<string, boolean>>({});
  const [showArchived, setShowArchived] = useState<Record<string, boolean>>({});
  const [showAllUnsorted, setShowAllUnsorted] = useState(false);
  const [hideOtherSessions, setHideOtherSessions] = useState(() => {
    try {
      return localStorage.getItem("pi-studio.sidebar.hide-other-sessions") === "true";
    } catch {
      return false;
    }
  });
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [settingsFor, setSettingsFor] = useState<{ id: string; section: ProjectSettingsSection } | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);

  const toggleHideOtherSessions = () => {
    setHideOtherSessions((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("pi-studio.sidebar.hide-other-sessions", String(next));
      } catch {}
      return next;
    });
  };

  const toggleExpand = (id: string) => setExpandedProjects((s) => ({ ...s, [id]: !(s[id] ?? true) }));

  const handlePickFolder = async () => {
    const folder = await window.studio.pickFolder();
    if (folder) {
      const p = await addProject(folder);
      await newSessionTab(p.id);
    }
  };

  const confirmDelete = async (sess: SessionCatalogItem) => {
    const title = sessionDisplayTitle(sess) || "this session";
    if (confirm(`Delete "${title}"?\n\nThe session file will be moved to the system trash.`)) {
      await deleteSessionFile(sess.path);
    }
  };

  const openSessionMenu = (e: React.MouseEvent, sess: SessionCatalogItem, projectId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          label: "Open",
          icon: <MessageSquare size={13} />,
          onSelect: () => void openSessionTab(sess.path, projectId, sessionDisplayTitle(sess, 40)),
        },
        { label: "Rename", icon: <Pencil size={13} />, hint: "F2", onSelect: () => setRenaming(sess.path) },
        sess.archived
          ? { label: "Unarchive", icon: <ArchiveRestore size={13} />, onSelect: () => void setSessionArchived(sess.path, false) }
          : { label: "Archive", icon: <Archive size={13} />, onSelect: () => void setSessionArchived(sess.path, true) },
        { kind: "separator" },
        { label: "Delete", icon: <Trash2 size={13} />, danger: true, onSelect: () => void confirmDelete(sess) },
      ],
    });
  };

  const openProjectMenu = (e: React.MouseEvent, project: ProjectEntry) => {
    e.preventDefault();
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: "New session", icon: <MessageSquarePlus size={13} />, onSelect: () => void newSessionTab(project.id) },
        { kind: "separator" },
        { label: "Project settings…", icon: <Settings2 size={13} />, onSelect: () => setSettingsFor({ id: project.id, section: "general" }) },
        { label: "Linked folders…", icon: <Link2 size={13} />, onSelect: () => setSettingsFor({ id: project.id, section: "links" }) },
      ],
    });
  };

  // Group sessions by projectId (archived ones are kept aside, not hidden from memory).
  const sessionsByProject: Record<string, { active: SessionCatalogItem[]; archived: SessionCatalogItem[] }> = {};
  const unsortedSessions: SessionCatalogItem[] = [];
  for (const s of allSessions) {
    if (s.projectId) {
      const bucket = (sessionsByProject[s.projectId] ??= { active: [], archived: [] });
      (s.archived ? bucket.archived : bucket.active).push(s);
    } else {
      unsortedSessions.push(s);
    }
  }

  // "Other" sessions are only useful per folder (to add it as a project), so collapse them by cwd.
  const otherFolders: Array<{ cwd: string; count: number }> = [];
  {
    const seen = new Map<string, { cwd: string; count: number }>();
    for (const s of unsortedSessions) {
      const key = s.cwd.replace(/\\/g, "/").toLowerCase();
      const entry = seen.get(key);
      if (entry) entry.count++;
      else {
        const created = { cwd: s.cwd, count: 1 };
        seen.set(key, created);
        otherFolders.push(created);
      }
    }
  }

  const renderSession = (sess: SessionCatalogItem, project: ProjectEntry) => {
    const title = sessionDisplayTitle(sess) || "Empty session";
    const isActive = sess.path === activeSessionPath;
    const isRenaming = renaming === sess.path;
    const modified = Date.parse(sess.modified);
    const badge = sessionState[sess.path];
    return (
      <div
        key={sess.id}
        className={`sb-session${isActive ? " is-active" : ""}${sess.archived ? " is-archived" : ""}${badge === "running" ? " is-running" : ""}`}
        onClick={() => !isRenaming && void openSessionTab(sess.path, project.id, sessionDisplayTitle(sess, 40))}
        onContextMenu={(e) => openSessionMenu(e, sess, project.id)}
        onKeyDown={(e) => {
          if (e.key === "F2") {
            e.preventDefault();
            setRenaming(sess.path);
          } else if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (!isRenaming) void openSessionTab(sess.path, project.id, sessionDisplayTitle(sess, 40));
          }
        }}
        tabIndex={0}
        title={
          isRenaming
            ? undefined
            : `${title}${badge ? ` (${BADGE_LABEL[badge]})` : ""}${Number.isFinite(modified) ? `\n${formatAgo(modified)}` : ""}`
        }
      >
        {badge === "running" ? (
          <Loader2 size={12} className="spin sb-session__icon sb-session__busy" />
        ) : (
          <MessageSquare size={12} className="sb-session__icon" />
        )}
        {isRenaming ? (
          <RenameInput
            initial={sess.title || title}
            onDone={(value) => {
              setRenaming(null);
              if (value !== null && value.trim() !== (sess.title || title)) void renameSession(sess.path, value);
            }}
          />
        ) : (
          <span className="sb-session__title">{title}</span>
        )}
        {!isRenaming && (
          <>
            {badge && badge !== "running" && <span className={`sb-session__dot sb-session__dot--${badge}`} aria-hidden />}
            {sess.messageCount > 0 && <span className="sb-session__count">{sess.messageCount}</span>}
            <button
              className="sb-icon-btn sb-session__action"
              onClick={(e) => {
                e.stopPropagation();
                void setSessionArchived(sess.path, !sess.archived);
              }}
              title={sess.archived ? "Unarchive session" : "Archive session (right-click for more)"}
            >
              {sess.archived ? <ArchiveRestore size={12} /> : <Archive size={12} />}
            </button>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="sb">
      {/* Header */}
      <div className="sb-header">
        <span className="ui-section-label">Projects</span>
        <button className="sb-icon-btn" onClick={handlePickFolder} title="Open project folder">
          <FolderPlus size={14} />
        </button>
      </div>

      {projects.length === 0 && (
        <div className="sb-empty">
          <span>No projects yet.</span>
          <button className="ui-btn ui-btn--sm" onClick={handlePickFolder}>
            <Plus size={12} /> Open folder
          </button>
        </div>
      )}

      {/* Project list */}
      <div className="sb-projects">
        {projects.map((project) => {
          const isExpanded = expandedProjects[project.id] ?? true;
          const bucket = sessionsByProject[project.id] ?? { active: [], archived: [] };
          const sessions = bucket.active;
          const isAll = showAllSessions[project.id] ?? false;
          const visible = isAll ? sessions : sessions.slice(0, VISIBLE_SESSIONS);
          const remaining = sessions.length - VISIBLE_SESSIONS;
          const archivedOpen = showArchived[project.id] ?? false;
          const links = project.links ?? [];

          return (
            <div key={project.id} className="sb-project" style={{ ["--prj-color" as string]: project.color }}>
              <div
                className="sb-project__row"
                onClick={() => toggleExpand(project.id)}
                onContextMenu={(e) => openProjectMenu(e, project)}
                title={project.path}
              >
                <span className="sb-project__chevron">
                  {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                </span>
                <span className="sb-project__avatar">{project.name.slice(0, 1).toUpperCase()}</span>
                <span className="sb-project__name">{project.name}</span>

                {links.length > 0 && (
                  <button
                    className="sb-link-chip"
                    title={`Linked: ${links.map((l) => l.alias || l.path).join(", ")}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSettingsFor({ id: project.id, section: "links" });
                    }}
                  >
                    <Link2 size={10} />
                    {links.length}
                  </button>
                )}

                <span className="sb-project__actions">
                  <button
                    className="sb-icon-btn"
                    title="Project settings"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSettingsFor({ id: project.id, section: "general" });
                    }}
                  >
                    <Settings2 size={13} />
                  </button>
                  <button
                    className="sb-icon-btn"
                    title="New session"
                    onClick={(e) => {
                      e.stopPropagation();
                      void newSessionTab(project.id);
                    }}
                  >
                    <Plus size={14} />
                  </button>
                </span>
              </div>

              {isExpanded && (
                <div className="sb-project__body">
                  {sessions.length === 0 && <div className="sb-muted-line">No sessions yet</div>}
                  {visible.map((sess) => renderSession(sess, project))}

                  {remaining > 0 && (
                    <button
                      className="sb-text-btn"
                      onClick={() => setShowAllSessions((s) => ({ ...s, [project.id]: !isAll }))}
                    >
                      {isAll ? "Show less" : `Show ${remaining} more`}
                    </button>
                  )}

                  {bucket.archived.length > 0 && (
                    <>
                      <button
                        className="sb-text-btn sb-text-btn--muted"
                        onClick={() => setShowArchived((s) => ({ ...s, [project.id]: !archivedOpen }))}
                      >
                        {archivedOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                        <Archive size={11} /> Archived ({bucket.archived.length})
                      </button>
                      {archivedOpen && bucket.archived.map((sess) => renderSession(sess, project))}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Unsorted / Discovered from Pi CLI */}
        {otherFolders.length > 0 && (
          <div className="sb-other">
            <div className="sb-other__head" onClick={toggleHideOtherSessions} title="Folders with Pi sessions that aren't projects yet">
              {hideOtherSessions ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
              <span className="ui-section-label" style={{ flex: 1 }}>
                Other Pi folders ({otherFolders.length})
              </span>
              <span className="sb-icon-btn" aria-hidden>
                {hideOtherSessions ? <EyeOff size={12} /> : <Eye size={12} />}
              </span>
            </div>

            {!hideOtherSessions && (
              <>
                {(showAllUnsorted ? otherFolders : otherFolders.slice(0, VISIBLE_SESSIONS)).map((s) => (
                  <div key={s.cwd} className="sb-other__row">
                    <span className="sb-other__name" title={s.cwd}>
                      {s.cwd.split(/[/\\]/).pop()}
                    </span>
                    <span className="sb-session__count" title={`${s.count} session${s.count === 1 ? "" : "s"}`}>
                      {s.count}
                    </span>
                    <button className="sb-add-chip" onClick={() => void addProject(s.cwd)}>
                      <Plus size={10} /> Add
                    </button>
                  </div>
                ))}

                {otherFolders.length > VISIBLE_SESSIONS && (
                  <button className="sb-text-btn" style={{ marginLeft: 8 }} onClick={() => setShowAllUnsorted(!showAllUnsorted)}>
                    {showAllUnsorted ? "Show less" : `Show ${otherFolders.length - VISIBLE_SESSIONS} more`}
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <ContextMenu menu={menu} onClose={closeMenu} />
      {settingsFor && (
        <ProjectSettingsModal
          projectId={settingsFor.id}
          initialSection={settingsFor.section}
          onClose={() => setSettingsFor(null)}
        />
      )}
    </div>
  );
};

/** Inline title editor. Enter/blur commits, Escape cancels (onDone(null)). */
const RenameInput: React.FC<{ initial: string; onDone: (value: string | null) => void }> = ({ initial, onDone }) => {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  const finish = (v: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(v);
  };

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  return (
    <input
      ref={ref}
      className="sb-rename"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onBlur={() => finish(value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") finish(value);
        else if (e.key === "Escape") finish(null);
      }}
    />
  );
};
