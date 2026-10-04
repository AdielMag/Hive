/** Diff viewer tab. Repo-specific actions (e.g. Stage / Unstage) are contributed by other modules via the `diff.actions` slot. */
import React, { useMemo } from "react";
import { Sparkles, X, GitCompare } from "lucide-react";
import type { ModuleHost, ModuleTab } from "@hive/module-sdk/renderer";
import { DIFF_ACTIONS_SLOT, fileBaseName, type DiffTabData } from "../shared.ts";

export const DiffViewerTab: React.FC<{ tab: ModuleTab; host: ModuleHost }> = ({ tab, host }) => {
  const { project: activeProject } = host.hooks.useActiveSession();
  const activeModel = host.hooks.useFeatureModel("session");
  const { AiModelChip, DiffView, Slot } = host.ui;
  const data = (tab.data ?? {}) as Partial<DiffTabData>;

  const fileName = tab.title || (tab.filePath ? fileBaseName(tab.filePath) : "Diff");
  const content = data.content ?? "";
  const isStaged = Boolean(data.staged);

  // Compute addition and deletion counts
  const stats = useMemo(() => {
    let added = 0;
    let deleted = 0;
    for (const l of content.split("\n")) {
      if (l.startsWith("+") && !l.startsWith("+++")) added++;
      else if (l.startsWith("-") && !l.startsWith("---")) deleted++;
    }
    return { added, deleted };
  }, [content]);

  const handleAskPi = async () => {
    if (!activeProject) return;
    const relPath = tab.filePath?.replace(activeProject.path, "").replace(/^[/\\]/, "") || fileName;
    host.sessions.setPrompt(
      `Please review and explain the ${isStaged ? "staged" : "unstaged"} changes in ${relPath}:\n\n\`\`\`diff\n${content}\n\`\`\`\n`,
    );
    await host.sessions.newSession(activeProject.id);
  };

  const empty = !content.trim() || content === "No differences detected.";

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
                  background: isStaged ? "rgba(16, 185, 129, 0.15)" : "rgba(var(--accent-rgb), 0.15)",
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
          {/* Contributed by other modules (git: Stage / Unstage) */}
          <Slot name={DIFF_ACTIONS_SLOT} props={{ tab }} />

          {/* Ask Pi about diff */}
          <button
            onClick={handleAskPi}
            title={`Ask Pi to explain these changes · Model: ${activeModel.name || activeModel.id} (${activeModel.sourceLabel})`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "4px 9px",
              background: "rgba(var(--accent-rgb), 0.12)",
              border: "1px solid rgba(var(--accent-rgb), 0.3)",
              borderRadius: 4,
              color: "var(--accent-base)",
              fontSize: 11,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            <Sparkles size={12} />
            <span>Ask Pi</span>
            <AiModelChip model={activeModel} clickable={false} feature="session" />
          </button>

          {/* Close Tab Button */}
          <button
            onClick={() => host.tabs.close(tab.id)}
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
      <div className="viewer__body">
        {empty ? <div className="ui-empty">No differences detected.</div> : <DiffView diff={content} language={host.languages.fromPath(tab.filePath)} />}
      </div>
    </div>
  );
};
