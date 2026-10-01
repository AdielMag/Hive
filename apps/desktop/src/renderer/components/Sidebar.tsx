import React, { useState } from "react";
import {
  Plus,
  ChevronDown,
  ChevronRight,
  MessageSquare,
  Trash2,
  Link as LinkIcon,
  Eye,
  EyeOff,
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useSessionStore } from "../store/session-store.ts";
import { DEFAULT_PROJECT_HUES } from "@pi-studio/protocol";

export const Sidebar: React.FC = () => {
  const { projects, allSessions, addProject, updateProject, openSessionTab, newSessionTab, deleteSessionFile } = useSessionStore(useShallow((s) => ({ projects: s.projects, allSessions: s.allSessions, addProject: s.addProject, updateProject: s.updateProject, openSessionTab: s.openSessionTab, newSessionTab: s.newSessionTab, deleteSessionFile: s.deleteSessionFile })));

  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});
  const [showAllSessions, setShowAllSessions] = useState<Record<string, boolean>>({});
  const [showAllUnsorted, setShowAllUnsorted] = useState(false);
  const [hideOtherSessions, setHideOtherSessions] = useState(() => {
    try {
      return localStorage.getItem("pi-studio.sidebar.hide-other-sessions") === "true";
    } catch {
      return false;
    }
  });
  const [colorPickerPrj, setColorPickerPrj] = useState<string | null>(null);

  const toggleHideOtherSessions = () => {
    setHideOtherSessions((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("pi-studio.sidebar.hide-other-sessions", String(next));
      } catch {}
      return next;
    });
  };

  const toggleExpand = (id: string) => {
    setExpandedProjects((s) => ({ ...s, [id]: !(s[id] ?? true) }));
  };

  const handlePickFolder = async () => {
    const folder = await window.studio.pickFolder();
    if (folder) {
      const p = await addProject(folder);
      await newSessionTab(p.id);
    }
  };

  const handleAddLink = async (projectId: string) => {
    const folder = await window.studio.pickFolder();
    if (!folder) return;
    const project = projects.find((p) => p.id === projectId);
    if (!project) return;
    const existing = project.links || [];
    if (existing.some((l) => l.path === folder)) return;

    const newLinks = [
      ...existing,
      {
        path: folder,
        alias: folder.split(/[/\\]/).pop() || folder,
        access: "read-only" as const,
      },
    ];
    await updateProject(projectId, { links: newLinks });
  };

  // Group sessions by projectId
  const sessionsByProject: Record<string, typeof allSessions> = {};
  const unsortedSessions: typeof allSessions = [];

  for (const s of allSessions) {
    if (s.projectId) {
      if (!sessionsByProject[s.projectId]) sessionsByProject[s.projectId] = [];
      sessionsByProject[s.projectId]!.push(s);
    } else {
      unsortedSessions.push(s);
    }
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "var(--bg-sidebar)",
        fontSize: 12,
        userSelect: "none",
        overflowY: "auto",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 14px",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.05em" }}>
          PROJECTS
        </span>
        <button
          onClick={handlePickFolder}
          title="Open project folder"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            background: "var(--accent-subtle)",
            border: "1px solid var(--accent-base)",
            color: "var(--accent-hover)",
            borderRadius: 4,
            padding: "2px 8px",
            fontSize: 11,
            cursor: "pointer",
            fontWeight: 500,
          }}
        >
          <Plus size={12} /> Add
        </button>
      </div>

      {/* Project list */}
      <div style={{ display: "flex", flexDirection: "column", padding: "6px 0" }}>
        {projects.map((project) => {
          const isExpanded = expandedProjects[project.id] ?? true;
          const sessions = sessionsByProject[project.id] || [];

          return (
            <div key={project.id} style={{ display: "flex", flexDirection: "column" }}>
              {/* Project Row */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "6px 12px",
                  gap: 6,
                  cursor: "pointer",
                  borderRadius: 4,
                  margin: "1px 6px",
                  background: "transparent",
                }}
                className="project-row"
              >
                <span onClick={() => toggleExpand(project.id)} style={{ display: "flex" }}>
                  {isExpanded ? <ChevronDown size={14} color="var(--text-muted)" /> : <ChevronRight size={14} color="var(--text-muted)" />}
                </span>

                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    backgroundColor: project.color,
                    flexShrink: 0,
                  }}
                  onClick={() => setColorPickerPrj(colorPickerPrj === project.id ? null : project.id)}
                  title="Change project color"
                />

                <span
                  style={{ flex: 1, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  onClick={() => toggleExpand(project.id)}
                  title={project.path}
                >
                  {project.name}
                </span>

                {/* Color swatches popup */}
                {colorPickerPrj === project.id && (
                  <div
                    style={{
                      position: "absolute",
                      left: 40,
                      zIndex: 1000,
                      background: "var(--bg-elevated)",
                      border: "1px solid var(--border-prominent)",
                      borderRadius: 6,
                      padding: 6,
                      display: "flex",
                      gap: 4,
                      boxShadow: "0 8px 16px rgba(0,0,0,0.4)",
                    }}
                  >
                    {DEFAULT_PROJECT_HUES.map((c) => (
                      <div
                        key={c}
                        onClick={async (e) => {
                          e.stopPropagation();
                          await updateProject(project.id, { color: c });
                          setColorPickerPrj(null);
                        }}
                        style={{
                          width: 16,
                          height: 16,
                          borderRadius: "50%",
                          background: c,
                          cursor: "pointer",
                          border: project.color === c ? "2px solid #fff" : "none",
                        }}
                      />
                    ))}
                  </div>
                )}

                <button
                  onClick={() => newSessionTab(project.id)}
                  title="New Session"
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    padding: 2,
                    display: "flex",
                  }}
                >
                  <Plus size={14} />
                </button>
              </div>

              {/* Sessions list */}
              {isExpanded && (
                <div style={{ display: "flex", flexDirection: "column", paddingLeft: 22, paddingRight: 6 }}>
                  {sessions.length === 0 && (
                    <div style={{ fontSize: 11, color: "var(--text-muted)", padding: "4px 8px" }}>
                      No sessions yet
                    </div>
                  )}

                  {(() => {
                    const isAll = showAllSessions[project.id] ?? false;
                    const visibleSessions = isAll ? sessions : sessions.slice(0, 5);
                    const remaining = sessions.length - 5;

                    return (
                      <>
                        {visibleSessions.map((sess) => (
                          <div
                            key={sess.id}
                            onClick={() => openSessionTab(sess.path, project.id, sess.name || sess.firstMessage)}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                              padding: "5px 8px",
                              borderRadius: 4,
                              cursor: "pointer",
                              margin: "1px 0",
                            }}
                            className="session-row"
                          >
                            <MessageSquare size={12} color="var(--text-muted)" />
                            <span
                              style={{
                                flex: 1,
                                fontSize: 11,
                                color: "var(--text-secondary)",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                              title={sess.name || sess.firstMessage || "Session"}
                            >
                              {sess.name || sess.firstMessage || "Empty session"}
                            </span>

                            {sess.messageCount > 0 && (
                              <span
                                style={{
                                  fontSize: 10,
                                  padding: "1px 5px",
                                  borderRadius: 10,
                                  background: "rgba(var(--fg-rgb), 0.06)",
                                  color: "var(--text-muted)",
                                }}
                              >
                                {sess.messageCount}
                              </span>
                            )}

                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (confirm("Move this session to trash?")) {
                                  await deleteSessionFile(sess.path);
                                }
                              }}
                              title="Delete session"
                              style={{
                                background: "transparent",
                                border: "none",
                                color: "var(--text-muted)",
                                cursor: "pointer",
                                padding: 2,
                                display: "flex",
                              }}
                            >
                              <Trash2 size={11} />
                            </button>
                          </div>
                        ))}

                        {remaining > 0 && (
                          <button
                            onClick={() =>
                              setShowAllSessions((s) => ({ ...s, [project.id]: !isAll }))
                            }
                            style={{
                              background: "transparent",
                              border: "none",
                              color: "var(--accent-hover)",
                              fontSize: 10,
                              cursor: "pointer",
                              textAlign: "left",
                              padding: "4px 8px",
                              fontWeight: 500,
                            }}
                          >
                            {isAll ? "Show less" : `+ Show all (${remaining} more)`}
                          </button>
                        )}
                      </>
                    );
                  })()}

                  {/* Linked projects subsection */}
                  <div style={{ marginTop: 4, marginBottom: 6, paddingLeft: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "var(--text-muted)", fontSize: 10 }}>
                      <span style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                        <LinkIcon size={10} /> LINKED ({project.links?.length || 0})
                      </span>
                      <button
                        onClick={() => handleAddLink(project.id)}
                        style={{ background: "transparent", border: "none", color: "var(--accent-hover)", cursor: "pointer", fontSize: 10 }}
                      >
                        + Link
                      </button>
                    </div>
                    {project.links?.map((lnk) => (
                      <div
                        key={lnk.path}
                        style={{
                          fontSize: 10,
                          color: "var(--text-secondary)",
                          padding: "2px 4px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        <span title={lnk.path}>../{lnk.alias || lnk.path.split(/[/\\]/).pop()}</span>
                        <span style={{ color: "var(--text-muted)" }}>{lnk.access}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Unsorted / Discovered from Pi CLI */}
        {unsortedSessions.length > 0 && (
          <div style={{ marginTop: 12, borderTop: "1px solid var(--border-subtle)", paddingTop: 8 }}>
            <div
              onClick={toggleHideOtherSessions}
              style={{
                padding: "4px 14px",
                fontSize: 10,
                fontWeight: 700,
                color: "var(--text-muted)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                cursor: "pointer",
                userSelect: "none",
              }}
              title="Click to toggle visibility of other Pi sessions"
            >
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                {hideOtherSessions ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                <span>OTHER PI SESSIONS ({unsortedSessions.length})</span>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleHideOtherSessions();
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  padding: 2,
                }}
                title={hideOtherSessions ? "Show other sessions" : "Hide other sessions"}
              >
                {hideOtherSessions ? <EyeOff size={12} /> : <Eye size={12} />}
              </button>
            </div>

            {!hideOtherSessions && (
              <>
                {(showAllUnsorted ? unsortedSessions : unsortedSessions.slice(0, 5)).map((s) => (
                  <div
                    key={s.id}
                    style={{
                      padding: "4px 14px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      fontSize: 11,
                      color: "var(--text-muted)",
                    }}
                  >
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }} title={s.cwd}>
                      {s.cwd.split(/[/\\]/).pop()}
                    </span>
                    <button
                      onClick={() => addProject(s.cwd)}
                      style={{
                        background: "var(--accent-subtle)",
                        border: "none",
                        color: "var(--accent-base)",
                        fontSize: 10,
                        borderRadius: 3,
                        padding: "1px 5px",
                        cursor: "pointer",
                      }}
                    >
                      + Add
                    </button>
                  </div>
                ))}

                {unsortedSessions.length > 5 && (
                  <button
                    onClick={() => setShowAllUnsorted(!showAllUnsorted)}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "var(--accent-hover)",
                      fontSize: 10,
                      cursor: "pointer",
                      textAlign: "left",
                      padding: "6px 14px",
                      fontWeight: 500,
                    }}
                  >
                    {showAllUnsorted ? "Show less" : `+ Show all (${unsortedSessions.length - 5} more)`}
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
