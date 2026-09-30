import React from "react";
import { FolderPlus, Terminal, Sparkles, Link as LinkIcon, Compass, ArrowRight } from "lucide-react";
import { useSessionStore } from "../store/session-store.ts";

export const WelcomeView: React.FC = () => {
  const { addProject, allSessions, bootstrap } = useSessionStore();

  const handleOpenFolder = async () => {
    const folder = await window.studio.pickFolder();
    if (folder) {
      await addProject(folder);
    }
  };

  const recentSessions = allSessions.slice(0, 4);

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 24px",
        background: "radial-gradient(ellipse at 50% 30%, rgba(83, 155, 245, 0.08) 0%, transparent 70%)",
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
        {/* Brand Aura */}
        <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: "linear-gradient(135deg, var(--accent-base), #986ee2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 8px 24px var(--accent-subtle)",
            }}
          >
            <Sparkles size={28} color="#fff" />
          </div>

          <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--text-primary)" }}>
            Pi Studio
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", maxWidth: 440, lineHeight: 1.5 }}>
            Desktop workbench for the Pi coding agent. Independent workspaces, color-coded multi-session tabs, and
            linked-project intelligence.
          </p>
        </div>

        {/* Primary Action Button */}
        <button
          onClick={handleOpenFolder}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 28px",
            borderRadius: 8,
            border: "none",
            background: "var(--accent-base)",
            color: "#fff",
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
                  onClick={async () => {
                    const prj = await addProject(s.cwd);
                    const { openSessionTab } = useSessionStore.getState();
                    await openSessionTab(s.path, prj.id, s.name || s.firstMessage);
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
      </div>
    </div>
  );
};
