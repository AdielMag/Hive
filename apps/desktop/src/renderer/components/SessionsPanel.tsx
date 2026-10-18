import React, { useMemo, useState } from "react";
import {
  Archive,
  Sparkles,
  ArchiveRestore,
  ChevronRight,
  CircleCheck,
  GitBranch,
  Loader2,
  MessageSquarePlus,
  Pencil,
  Trash2,
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import type { SessionCatalogItem } from "@hive/protocol";
import { transcriptAwaitsUser, useSessionStore } from "../store/session-store.ts";
import { sessionDisplayTitle } from "../lib/session-title.ts";
import { AiModelChip } from "./AiModelChip.tsx";
import { resolveFeatureModel, useFeatureModelStore } from "../store/feature-models-store.ts";
import { formatAgo, formatAgoShort } from "../lib/format.ts";
import { ContextMenu, type ContextMenuState } from "./ContextMenu.tsx";
import { worktreeChipLabel, worktreeShortLabel, worktreeTooltipLines } from "../lib/worktree.ts";
import { groupSessions, isSubagentSession, normPath, subagentId, subagentType } from "../lib/subagent-sessions.ts";
import { archiveSession, stopSessionTabs } from "../store/worktree-actions.ts";
import { askTidyWorktrees } from "./TidyWorktreesDialog.tsx";
import { toast } from "../modules/toast-store.ts";

type SessionBadge = "running" | "input" | "done" | "error";

const BADGE_LABEL: Record<SessionBadge, string> = {
  running: "running",
  input: "waiting for your input",
  done: "finished, not viewed yet",
  error: "failed, not viewed yet",
};

const ORPHANS_KEY = "__orphans__";
/** A child counts as running only while its parent is running and it was touched this recently. */
const CHILD_RUNNING_WINDOW_MS = 120_000;

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
    models,
    selectedModel,
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
      models: s.models,
      selectedModel: s.selectedModel,
    })),
  );

  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [editingSessionPath, setEditingSessionPath] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const tidyPref = useFeatureModelStore((s) => s.config.sessionTidy);
  const defaultModel = useSessionStore((s) => s.defaultModel);
  const resolvedTidyModel = useMemo(
    () => resolveFeatureModel(tidyPref, selectedModel, defaultModel, models),
    [tidyPref, selectedModel, defaultModel, models],
  );
  const [tidying, setTidying] = useState(false);
  const [tidyNote, setTidyNote] = useState("");

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

  const archiveOldWithLlm = async () => {
    if (!activeProject || tidying) return;
    const open = new Set(tabs.filter((t) => t.sessionPath).map((t) => normPath(t.sessionPath!)));
    // Oldest first so the model's size cap drops the newest, not the oldest.
    const candidates = projectSessions
      .filter((s) => !s.archived && !s.pending && !s.worktree && !isSubagentSession(s) && !open.has(normPath(s.path)))
      .reverse();
    setTidying(true);
    setTidyNote("");
    let archivedCount = 0;
    try {
      if (candidates.length) {
        const model = resolvedTidyModel.id;
        const paths = await window.studio.pickStaleSessions(
          activeProject.path,
          candidates.map((s) => ({
            path: s.path,
            title: sessionDisplayTitle(s) || "Untitled",
            modified: s.modified,
            messageCount: s.messageCount,
          })),
          model,
        );
        if (!paths) {
          setTidyNote("Model call failed");
        } else {
          for (const p of paths) await setSessionArchived(p, true);
          archivedCount = paths.length;
        }
      }
      let removed = 0;
      try {
        removed = await tidyWorktrees();
      } catch {
        setTidyNote((prev) => prev || "Worktree cleanup failed");
      }
      const parts = [archivedCount ? `Archived ${archivedCount}` : "", removed ? `Cleaned ${removed}` : ""].filter(Boolean);
      setTidyNote((prev) => prev || parts.join(", ") || "Nothing to tidy");
    } catch {
      setTidyNote("Failed");
    } finally {
      setTidying(false);
    }
  };

  /** Offer every unused Hive worktree/branch (local + origin) for deletion, one choice per item. Returns how many were deleted. */
  const tidyWorktrees = async (): Promise<number> => {
    if (!activeProject) return 0;
    const sessions = useSessionStore.getState().allSessions.filter((s) => s.projectId === activeProject.id && s.worktree);
    const live = sessions.filter((s) => !s.archived);
    // Open tabs count as live too: a brand-new session's worktree may not be in the catalog yet.
    const tabWts = useSessionStore.getState().tabs.flatMap((t) => (t.worktree ? [t.worktree] : []));
    const candidates = await window.studio.worktreeTidyScan({
      projectPath: activeProject.path,
      liveBranches: [...live.map((s) => s.worktree!.branch), ...tabWts.map((w) => w.branch)],
      livePaths: [...live.map((s) => s.worktree!.worktreePath), ...tabWts.map((w) => w.worktreePath)],
      archivedBranches: sessions.filter((s) => s.archived).map((s) => s.worktree!.branch),
    });
    if (!candidates.length) return 0;
    const choices = await askTidyWorktrees(candidates);
    if (!choices) return 0;
    const actions = candidates.flatMap((c) => {
      const choice = choices[c.branch];
      if (!choice || choice === "keep") return [];
      return [
        {
          branch: c.branch,
          worktreePath: c.worktreePath,
          deleteLocal: choice !== "all" || c.hasLocalBranch || !!c.worktreePath,
          deleteRemote: choice === "all",
        },
      ];
    });
    if (!actions.length) return 0;
    // A live Pi process (archived session still open) holds its worktree folder; close those first.
    for (const a of actions) {
      const owner = sessions.find((s) => s.worktree?.branch === a.branch);
      if (owner && a.deleteLocal) await stopSessionTabs(owner.path);
    }
    const results = await window.studio.worktreeTidyApply(activeProject.path, actions);
    const failed = results.filter((r) => !r.ok);
    for (const f of failed) toast({ kind: "error", message: `Couldn't clean ${f.branch}: ${f.error ?? "failed"}` });
    return results.length - failed.length;
  };

  const query = search.trim().toLowerCase();

  const { roots, childrenByParent, orphans } = useMemo(() => {
    const visible = projectSessions.filter((s) => showArchived || !s.archived);
    if (!query) return groupSessions(visible);
    const matches = (s: SessionCatalogItem) =>
      (s.title || s.aiTitle || s.firstMessage || "").toLowerCase().includes(query) ||
      (s.name ?? "").toLowerCase().includes(query);
    const hit = new Set(visible.filter(matches).map((s) => s.path));
    // A matching child pulls its parent into the list so the group can be shown expanded.
    const parents = new Set<string>();
    for (const s of visible) {
      if (hit.has(s.path) && isSubagentSession(s)) parents.add(normPath(s.parentSessionPath!));
    }
    return groupSessions(visible.filter((s) => hit.has(s.path) || parents.has(normPath(s.path))));
  }, [projectSessions, showArchived, query]);

  const isExpanded = (key: string) => (query ? true : !!expanded[key]);
  const toggleGroup = (key: string) => setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  const hasSessions = roots.length > 0 || orphans.length > 0;

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

  const renderChild = (child: SessionCatalogItem, parentRunning: boolean, prefixed: boolean) => {
    const modifiedMs = new Date(child.modified).getTime();
    const running = parentRunning && Date.now() - modifiedMs < CHILD_RUNNING_WINDOW_MS;
    const type = subagentType(child) ?? "agent";
    const id = subagentId(child);
    const isCurrent = child.path === activeSessionPath;
    const open = () => void openSessionTab(child.path, activeProject.id);
    return (
      <div
        key={child.path}
        role="button"
        tabIndex={0}
        className={`sessions-panel__child${isCurrent ? " is-active" : ""}`}
        title={`${type}${id ? `#${id}` : ""}${running ? " (running)" : ""}\n${formatAgo(modifiedMs)}`}
        onClick={open}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            open();
          }
        }}
      >
        {running ? (
          <Loader2 size={11} className="spin sessions-panel__child-icon" aria-label="running" />
        ) : (
          <CircleCheck size={11} className="sessions-panel__child-icon sessions-panel__child-icon--done" aria-label="finished" />
        )}
        <span className="sessions-panel__child-type">
          {prefixed ? "↳ " : ""}
          {type}
        </span>
        {id && <span className="sessions-panel__child-id">#{id}</span>}
        <span className="sessions-panel__child-time">{formatAgoShort(modifiedMs)}</span>
      </div>
    );
  };

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
            aria-label="Search sessions"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="sessions-panel__list">
        {!hasSessions ? (
          <div className="sessions-panel__empty">
            <p>No sessions found.</p>
          </div>
        ) : (
          roots.map((s) => {
            const isCurrent = s.path === activeSessionPath;
            const badge = sessionState[s.path];
            const isEditing = editingSessionPath === s.path;
            const display = sessionDisplayTitle(s, 50);
            const groupKey = normPath(s.path);
            const children = childrenByParent.get(groupKey) ?? [];
            const open = children.length > 0 && isExpanded(groupKey);
            const listId = `sessions-agents-${groupKey.replace(/[^a-z0-9]/g, "-")}`;

            return (
              <React.Fragment key={s.path}>
                <div
                  className={`sessions-panel__item${isCurrent ? " is-active" : ""}`}
                  onClick={() => !isEditing && void openSessionTab(s.path, activeProject.id)}
                  title={
                    s.worktree
                      ? `${display}${badge ? ` (${BADGE_LABEL[badge]})` : ""}\n${formatAgo(new Date(s.modified).getTime())}\n${worktreeChipLabel(s.worktree)}\n${worktreeTooltipLines(s.worktree).join("\n")}`
                      : `${display}${badge ? ` (${BADGE_LABEL[badge]})` : ""}\n${formatAgo(new Date(s.modified).getTime())}`
                  }
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
                    {badge === "running" && (
                      <div className="sessions-panel__item-icon">
                        <Loader2 size={12} className="spin sessions-panel__item-busy" />
                      </div>
                    )}
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
                    {badge && badge !== "running" && (
                      <span
                        className={`sessions-panel__badge sessions-panel__badge--${badge}`}
                        title={BADGE_LABEL[badge]}
                      />
                    )}
                  </div>

                  <div className="sessions-panel__item-meta">
                    <span className="sessions-panel__item-time">
                      {formatAgoShort(new Date(s.modified).getTime())}
                    </span>
                    {s.worktree && (
                      <>
                        <span className="sessions-panel__meta-sep">·</span>
                        <span className={`sessions-panel__branch${isCurrent ? " is-active" : ""}`}>
                          <GitBranch size={10} className="sessions-panel__branch-icon" />
                          <span className="sessions-panel__branch-text">
                            {isCurrent ? worktreeChipLabel(s.worktree) : worktreeShortLabel(s.worktree.branch)}
                          </span>
                        </span>
                      </>
                    )}
                  </div>
                </div>
                {children.length > 0 && (
                  <>
                    <button
                      type="button"
                      className="sessions-panel__agents"
                      aria-expanded={open}
                      aria-controls={listId}
                      onClick={() => toggleGroup(groupKey)}
                    >
                      <ChevronRight size={11} className="sessions-panel__agents-chevron" />
                      <span>
                        {children.length} {children.length === 1 ? "agent" : "agents"}
                      </span>
                    </button>
                    <div id={listId} hidden={!open}>
                      {open && children.map((c) => renderChild(c, badge === "running", false))}
                    </div>
                  </>
                )}
              </React.Fragment>
            );
          })
        )}
        {orphans.length > 0 &&
          (query ? (
            orphans.map((c) => renderChild(c, false, true))
          ) : (
            <>
              <button
                type="button"
                className="sessions-panel__agents sessions-panel__agents--orphans"
                aria-expanded={!!expanded[ORPHANS_KEY]}
                aria-controls="sessions-agent-runs"
                onClick={() => toggleGroup(ORPHANS_KEY)}
              >
                <ChevronRight size={11} className="sessions-panel__agents-chevron" />
                <span>Agent runs ({orphans.length})</span>
              </button>
              <div id="sessions-agent-runs" hidden={!expanded[ORPHANS_KEY]}>
                {expanded[ORPHANS_KEY] && orphans.map((c) => renderChild(c, false, false))}
              </div>
            </>
          ))}
      </div>

      <div className="sessions-panel__footer">
        <div className="sessions-panel__tidy">
          <button
            type="button"
            className="sessions-panel__tidy-btn"
            disabled={tidying}
            onClick={() => void archiveOldWithLlm()}
            title={`Let the model pick old sessions and archive them · ${resolvedTidyModel.name || resolvedTidyModel.id} (${resolvedTidyModel.sourceLabel})
Right-click to change the model`}
          >
            {tidying ? (
              <>
                <Loader2 size={12} className="spin" />
                <span>Archiving…</span>
              </>
            ) : (
              <>
                <Sparkles size={12} />
                <span>Archive old</span>
                <AiModelChip model={resolvedTidyModel} clickable={false} feature="sessionTidy" />
              </>
            )}
          </button>
        </div>
        {tidyNote && <div className="sessions-panel__tidy-note" role="status">{tidyNote}</div>}
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
