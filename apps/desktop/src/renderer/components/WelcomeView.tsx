import React, { useMemo } from "react";
import {
  FolderPlus,
  Terminal,
  Link as LinkIcon,
  ArrowRight,
  MessageSquarePlus,
  MessageSquare,
  Clock,
  GitBranch,
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useSessionStore } from "../store/session-store.ts";
import { sessionDisplayTitle } from "../lib/session-title.ts";
import { formatAgo } from "../lib/format.ts";
import { useShortcut } from "../features/commands/useShortcut.ts";
import hiveIcon from "../assets/hive-icon.png";

export const WelcomeView: React.FC = () => {
  const { activeProject, addProject, allSessions, bootstrap, newSessionTab, openSessionTab } =
    useSessionStore(
      useShallow((s) => ({
        activeProject: s.activeProject,
        addProject: s.addProject,
        allSessions: s.allSessions,
        bootstrap: s.bootstrap,
        newSessionTab: s.newSessionTab,
        openSessionTab: s.openSessionTab,
      })),
    );

  const newSessionShortcut = useShortcut("session.new");

  const handleOpenFolder = async () => {
    const folder = await window.studio.pickFolder();
    if (folder) {
      await addProject(folder);
    }
  };

  const projectSessions = useMemo(() => {
    if (!activeProject) return [];
    return allSessions
      .filter((s) => s.projectId === activeProject.id || (!s.projectId && s.cwd === activeProject.path))
      .sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime())
      .slice(0, 8);
  }, [allSessions, activeProject]);

  const recentSessions = useMemo(() => {
    return allSessions.slice(0, 4);
  }, [allSessions]);

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 24px",
        background: "radial-gradient(ellipse at 50% 30%, rgba(var(--accent-rgb), 0.08) 0%, transparent 70%)",
        userSelect: "none",
        overflowY: "auto",
        boxSizing: "border-box",
        width: "100%",
      }}
    >
      <div
        style={{
          maxWidth: 640,
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 28,
          boxSizing: "border-box",
        }}
      >
        {activeProject ? (
          /* Active Project Hub */
          <>
            <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 50,
                  height: 50,
                  borderRadius: 12,
                  background: activeProject.color || "var(--accent-base)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: 22,
                  boxShadow: "0 6px 20px rgba(0, 0, 0, 0.35)",
                }}
              >
                {activeProject.name.slice(0, 1).toUpperCase()}
              </div>

              <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--text-primary)", margin: 0 }}>
                {activeProject.name}
              </h1>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-muted)",
                  fontFamily: "var(--font-mono, monospace)",
                  maxWidth: 520,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={activeProject.path}
              >
                {activeProject.path}
              </div>
            </div>

            {/* Primary Action Button */}
            <button
              type="button"
              onClick={() => void newSessionTab(activeProject.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "12px 28px",
                borderRadius: 8,
                border: "none",
                background: "var(--accent-base)",
                color: "var(--accent-contrast)",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                boxShadow: "0 4px 16px var(--accent-subtle)",
                transition: "transform 0.15s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-1px)")}
              onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0)")}
            >
              <MessageSquarePlus size={18} />
              <span>Start a New Session</span>
              {newSessionShortcut && (
                <kbd
                  style={{
                    fontSize: 10.5,
                    fontFamily: "var(--font-mono, monospace)",
                    padding: "2px 6px",
                    borderRadius: 4,
                    background: "rgba(0, 0, 0, 0.2)",
                    marginLeft: 4,
                  }}
                >
                  {newSessionShortcut}
                </kbd>
              )}
            </button>

            {/* Previous sessions in this project */}
            {projectSessions.length > 0 ? (
              <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: "var(--text-muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    Previous Sessions in this Project
                  </span>
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    {projectSessions.length} {projectSessions.length === 1 ? "session" : "sessions"}
                  </span>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                    gap: 10,
                    width: "100%",
                    boxSizing: "border-box",
                  }}
                >
                  {projectSessions.map((s) => {
                    const title = sessionDisplayTitle(s, 50) || "Untitled Session";
                    const time = s.modified ? formatAgo(new Date(s.modified).getTime()) : "";
                    return (
                      <div
                        key={s.id || s.path}
                        role="button"
                        tabIndex={0}
                        onClick={() => void openSessionTab(s.path, activeProject.id, title)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            void openSessionTab(s.path, activeProject.id, title);
                          }
                        }}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 6,
                          padding: "12px 14px",
                          background: "var(--bg-card)",
                          border: "1px solid var(--border-subtle)",
                          borderRadius: 8,
                          cursor: "pointer",
                          minWidth: 0,
                          overflow: "hidden",
                          boxSizing: "border-box",
                          transition: "border-color 0.2s, background 0.2s, transform 0.15s ease",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = "var(--border-prominent)";
                          e.currentTarget.style.background = "var(--bg-card-hover)";
                          e.currentTarget.style.transform = "translateY(-1px)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = "var(--border-subtle)";
                          e.currentTarget.style.background = "var(--bg-card)";
                          e.currentTarget.style.transform = "translateY(0)";
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                            <MessageSquare size={13} style={{ flexShrink: 0, color: "var(--text-muted)" }} />
                            <span
                              style={{
                                fontWeight: 600,
                                color: "var(--text-primary)",
                                fontSize: 12.5,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {title}
                            </span>
                          </div>
                          <ArrowRight size={12} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11, color: "var(--text-muted)" }}>
                          {time && (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                              <Clock size={11} />
                              {time}
                            </span>
                          )}
                          {s.worktree?.branch && (
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 3,
                                padding: "1px 5px",
                                borderRadius: 4,
                                background: "rgba(255, 255, 255, 0.06)",
                              }}
                            >
                              <GitBranch size={10} />
                              {s.worktree.branch}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div
                style={{
                  padding: "20px 24px",
                  background: "var(--bg-card)",
                  border: "1px dashed var(--border-subtle)",
                  borderRadius: 8,
                  textAlign: "center",
                  width: "100%",
                  boxSizing: "border-box",
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>
                  No previous sessions in this project yet.
                </div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                  Click &ldquo;Start a New Session&rdquo; above to begin chatting with Pi.
                </div>
              </div>
            )}

            {/* Switch / Open Folder secondary option */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 4 }}>
              <button
                type="button"
                onClick={handleOpenFolder}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 12px",
                  borderRadius: 6,
                  border: "1px solid var(--border-subtle)",
                  background: "transparent",
                  color: "var(--text-secondary)",
                  fontSize: 12,
                  cursor: "pointer",
                  transition: "background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "var(--border-prominent)";
                  e.currentTarget.style.color = "var(--text-primary)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--border-subtle)";
                  e.currentTarget.style.color = "var(--text-secondary)";
                }}
              >
                <FolderPlus size={13} />
                <span>Open another project folder…</span>
              </button>
            </div>
          </>
        ) : (
          /* Generic Onboarding (No project selected) */
          <>
            <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              <img src={hiveIcon} alt="Hive" draggable={false} style={{ width: 64, height: 64, objectFit: "contain" }} />

              <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--text-primary)" }}>
                Hive
              </h1>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", maxWidth: 440, lineHeight: 1.5 }}>
                Desktop workbench for the Pi coding agent. Independent workspaces, color-coded multi-session tabs, and
                linked-project intelligence.
              </p>
            </div>

            {/* Primary Action Button */}
            <button
              type="button"
              onClick={handleOpenFolder}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "12px 28px",
                borderRadius: 8,
                border: "none",
                background: "var(--accent-base)",
                color: "var(--accent-contrast)",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                boxShadow: "0 4px 16px var(--accent-subtle)",
                transition: "transform 0.15s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-1px)")}
              onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0)")}
            >
              <FolderPlus size={18} />
              <span>Open a Project Folder</span>
            </button>

            {/* Recent sessions if available from CLI */}
            {recentSessions.length > 0 && (
              <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 8 }}>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--text-muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  Resume Recent Pi CLI Sessions
                </span>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                    gap: 10,
                    width: "100%",
                    boxSizing: "border-box",
                  }}
                >
                  {recentSessions.map((s) => (
                    <div
                      key={s.id}
                      role="button"
                      tabIndex={0}
                      onClick={async () => {
                        const prj = await addProject(s.cwd);
                        const { openSessionTab: openTab } = useSessionStore.getState();
                        await openTab(s.path, prj.id, s.name || s.firstMessage);
                      }}
                      onKeyDown={async (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          const prj = await addProject(s.cwd);
                          const { openSessionTab: openTab } = useSessionStore.getState();
                          await openTab(s.path, prj.id, s.name || s.firstMessage);
                        }
                      }}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                        padding: "10px 14px",
                        background: "var(--bg-card)",
                        border: "1px solid var(--border-subtle)",
                        borderRadius: 6,
                        cursor: "pointer",
                        minWidth: 0,
                        overflow: "hidden",
                        boxSizing: "border-box",
                        transition: "border-color 0.2s, background 0.2s",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = "var(--border-prominent)";
                        e.currentTarget.style.background = "var(--bg-card-hover)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = "var(--border-subtle)";
                        e.currentTarget.style.background = "var(--bg-card)";
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, minWidth: 0 }}>
                        <span
                          style={{
                            fontWeight: 600,
                            color: "var(--text-primary)",
                            fontSize: 12,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            minWidth: 0,
                          }}
                        >
                          {s.cwd.split(/[/\\]/).pop()}
                        </span>
                        <ArrowRight size={12} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                      </div>

                      <span
                        style={{
                          fontSize: 11,
                          color: "var(--text-muted)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          display: "block",
                          minWidth: 0,
                        }}
                      >
                        {s.name || s.firstMessage || "Session"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Feature Cards Grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: 12,
                width: "100%",
                marginTop: 6,
                boxSizing: "border-box",
              }}
            >
              <div
                style={{
                  padding: "12px 14px",
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: 6,
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  minWidth: 0,
                  overflow: "hidden",
                  boxSizing: "border-box",
                }}
              >
                <LinkIcon size={16} color="var(--accent-base)" style={{ flexShrink: 0, marginTop: 2 }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 12, color: "var(--text-primary)" }}>Linked Projects</div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2, lineHeight: 1.4 }}>
                    Reference sibling repositories or documentation with automatic system-prompt injection.
                  </div>
                </div>
              </div>

              <div
                style={{
                  padding: "12px 14px",
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: 6,
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  minWidth: 0,
                  overflow: "hidden",
                  boxSizing: "border-box",
                }}
              >
                <Terminal size={16} color="var(--accent-base)" style={{ flexShrink: 0, marginTop: 2 }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 12, color: "var(--text-primary)" }}>Installed Pi Runtime</div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2, lineHeight: 1.4 }}>
                    Pi version {bootstrap?.pi.ok ? bootstrap.pi.info.version : "0.87.1"}. Your extensions and models load
                    directly.
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
