import React, { useMemo } from "react";
import {
  FileCode,
  Plus,
  Minus,
  Sparkles,
  X,
  GitCompare,
} from "lucide-react";
import type { TabItem } from "@pi-studio/protocol";
import { useSessionStore } from "../store/session-store.ts";

export const DiffViewerTab: React.FC<{ tab: TabItem }> = ({ tab }) => {
  const { setPromptText, closeTab, newSessionTab, activeProject } = useSessionStore();

  const fileName = tab.title || tab.filePath?.split(/[/\\]/).pop() || "Diff";
  const content = tab.diffContent || "";
  const isStaged = Boolean(tab.diffStaged);

  const lines = useMemo(() => content.split("\n"), [content]);

  // Compute addition and deletion counts
  const stats = useMemo(() => {
    let added = 0;
    let deleted = 0;
    lines.forEach((l) => {
      if (l.startsWith("+") && !l.startsWith("+++")) added++;
      else if (l.startsWith("-") && !l.startsWith("---")) deleted++;
    });
    return { added, deleted };
  }, [lines]);

  const handleStageToggle = async () => {
    if (!activeProject || !tab.filePath) return;
    try {
      if (isStaged) {
        await window.studio.unstageFile(activeProject.path, tab.filePath);
      } else {
        await window.studio.stageFile(activeProject.path, tab.filePath);
      }
      // Refresh diff content
      const updated = await window.studio.getGitDiff(activeProject.path, {
        staged: !isStaged,
        filePath: tab.filePath,
      });
      useSessionStore.setState((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === tab.id
            ? {
                ...t,
                diffStaged: !isStaged,
                title: `${!isStaged ? "[Staged] " : ""}${fileName.replace(/^\[Staged\]\s*/, "")}`,
                diffContent: updated || "No differences detected.",
              }
            : t,
        ),
      }));
    } catch (err: any) {
      alert(`Operation failed: ${err.message || String(err)}`);
    }
  };

  const handleAskPi = async () => {
    if (!activeProject) return;
    const relPath = tab.filePath?.replace(activeProject.path, "").replace(/^[/\\]/, "") || fileName;
    setPromptText(
      `Please review and explain the ${isStaged ? "staged" : "unstaged"} changes in ${relPath}:\n\n\`\`\`diff\n${content}\n\`\`\`\n`,
    );
    await newSessionTab(activeProject.id);
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        backgroundColor: "var(--bg-app)",
      }}
    >
      {/* Diff Header Bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 16px",
          background: "var(--bg-card)",
          borderBottom: "1px solid var(--border-subtle)",
          flexShrink: 0,
          gap: 12,
        }}
      >
        {/* Left: Diff Info */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <GitCompare size={16} color={isStaged ? "#10b981" : "#539bf5"} style={{ flexShrink: 0 }} />

          <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={tab.filePath}
              >
                {fileName}
              </span>
              <span
                style={{
                  padding: "1px 5px",
                  borderRadius: 3,
                  fontSize: 9,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  background: isStaged ? "rgba(16, 185, 129, 0.15)" : "rgba(83, 155, 245, 0.15)",
                  color: isStaged ? "var(--success)" : "var(--accent-base)",
                  flexShrink: 0,
                }}
              >
                {isStaged ? "Staged" : "Working"}
              </span>
            </div>
            <span
              style={{
                fontSize: 10,
                color: "var(--text-muted)",
                fontFamily: "var(--font-mono)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={tab.filePath}
            >
              {tab.filePath}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontFamily: "var(--font-mono)", flexShrink: 0 }}>
            <span style={{ color: "var(--success)", fontWeight: 600 }}>+{stats.added}</span>
            <span style={{ color: "var(--danger)", fontWeight: 600 }}>-{stats.deleted}</span>
          </div>
        </div>

        {/* Right: Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {/* Stage / Unstage Action Button */}
          <button
            onClick={handleStageToggle}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "4px 9px",
              background: isStaged ? "rgba(229, 83, 75, 0.12)" : "rgba(16, 185, 129, 0.12)",
              border: `1px solid ${isStaged ? "rgba(229, 83, 75, 0.3)" : "rgba(16, 185, 129, 0.3)"}`,
              borderRadius: 4,
              color: isStaged ? "var(--danger)" : "var(--success)",
              fontSize: 11,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            {isStaged ? (
              <>
                <Minus size={12} />
                <span>Unstage</span>
              </>
            ) : (
              <>
                <Plus size={12} />
                <span>Stage</span>
              </>
            )}
          </button>

          {/* Ask Pi about diff */}
          <button
            onClick={handleAskPi}
            title="Ask Pi to explain these changes"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "4px 9px",
              background: "rgba(83, 155, 245, 0.12)",
              border: "1px solid rgba(83, 155, 245, 0.3)",
              borderRadius: 4,
              color: "var(--accent-base)",
              fontSize: 11,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            <Sparkles size={12} />
            <span>Ask Pi</span>
          </button>

          {/* Close Tab Button */}
          <button
            onClick={() => closeTab(tab.id)}
            title="Close diff tab"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              display: "flex",
              padding: 4,
              borderRadius: 3,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Diff Content View */}
      <div
        style={{
          flex: 1,
          overflow: "auto",
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          lineHeight: 1.5,
          padding: "10px 0",
          backgroundColor: "var(--bg-app)",
        }}
      >
        {lines.length === 0 || !content.trim() ? (
          <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", fontStyle: "italic" }}>
            No differences detected.
          </div>
        ) : (
          lines.map((line, idx) => {
            let color = "var(--text-primary)";
            let bg = "transparent";
            let prefix = " ";

            if (line.startsWith("+") && !line.startsWith("+++")) {
              color = "#34d399";
              bg = "rgba(16, 185, 129, 0.12)";
              prefix = "+";
            } else if (line.startsWith("-") && !line.startsWith("---")) {
              color = "#f87171";
              bg = "rgba(239, 68, 68, 0.12)";
              prefix = "-";
            } else if (line.startsWith("@@")) {
              color = "var(--accent-base)";
              bg = "rgba(83, 155, 245, 0.08)";
            }

            return (
              <div
                key={idx}
                style={{
                  display: "flex",
                  backgroundColor: bg,
                  padding: "0 16px",
                  minWidth: "fit-content",
                }}
              >
                <div
                  style={{
                    width: 44,
                    textAlign: "right",
                    paddingRight: 16,
                    color: "var(--text-muted)",
                    userSelect: "none",
                    borderRight: "1px solid var(--border-subtle)",
                    flexShrink: 0,
                    opacity: 0.6,
                  }}
                >
                  {idx + 1}
                </div>
                <div
                  style={{
                    paddingLeft: 12,
                    color,
                    whiteSpace: "pre",
                    flex: 1,
                  }}
                >
                  {line}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
