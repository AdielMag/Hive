import React, { useEffect, useState } from "react";
import { GitBranch, Plus, Minus, RotateCcw, Check, RefreshCw, ArrowUp, ArrowDown } from "lucide-react";
import { useSessionStore } from "../store/session-store.ts";

export const GitPanel: React.FC = () => {
  const { activeProject } = useSessionStore();
  const [status, setStatus] = useState<any>(null);
  const [commitMsg, setCommitMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const refreshGit = async () => {
    if (!activeProject?.path) return;
    setLoading(true);
    try {
      const s = await window.studio.getGitStatus(activeProject.path);
      setStatus(s);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshGit();
  }, [activeProject?.path]);

  const handleStage = async (file: string) => {
    if (!activeProject) return;
    await window.studio.stageFile(activeProject.path, file);
    await refreshGit();
  };

  const handleUnstage = async (file: string) => {
    if (!activeProject) return;
    await window.studio.unstageFile(activeProject.path, file);
    await refreshGit();
  };

  const handleDiscard = async (file: string) => {
    if (!activeProject) return;
    if (confirm(`Discard changes in ${file}?`)) {
      await window.studio.discardFile(activeProject.path, file);
      await refreshGit();
    }
  };

  const handleCommit = async () => {
    if (!activeProject || !commitMsg.trim()) return;
    try {
      await window.studio.gitCommit(activeProject.path, commitMsg.trim());
      setCommitMsg("");
      await refreshGit();
    } catch (err: any) {
      alert(`Commit failed: ${err.message || String(err)}`);
    }
  };

  if (!activeProject) {
    return <div style={{ padding: 16, color: "var(--text-muted)", fontSize: 12 }}>No project open.</div>;
  }

  if (status && !status.isRepo) {
    return (
      <div style={{ padding: 16, color: "var(--text-muted)", fontSize: 12 }}>
        This folder is not a Git repository.
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        padding: 12,
        gap: 12,
        fontSize: 12,
        overflowY: "auto",
        userSelect: "none",
      }}
    >
      {/* Branch & Sync Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 8px",
          background: "var(--bg-card)",
          borderRadius: 6,
          border: "1px solid var(--border-subtle)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, color: "var(--text-primary)" }}>
          <GitBranch size={14} color="var(--accent-base)" />
          <span>{status?.branch || "HEAD"}</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "var(--text-muted)" }}>
          {status?.ahead > 0 && (
            <span style={{ display: "flex", alignItems: "center", gap: 2, color: "var(--accent-base)" }}>
              <ArrowUp size={11} /> {status.ahead}
            </span>
          )}
          {status?.behind > 0 && (
            <span style={{ display: "flex", alignItems: "center", gap: 2, color: "var(--warning)" }}>
              <ArrowDown size={11} /> {status.behind}
            </span>
          )}
          <button
            onClick={refreshGit}
            title="Refresh Git status"
            style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", display: "flex" }}
          >
            <RefreshCw size={12} className={loading ? "spin" : ""} />
          </button>
        </div>
      </div>

      {/* Commit Box */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <input
          type="text"
          value={commitMsg}
          onChange={(e) => setCommitMsg(e.target.value)}
          placeholder="Commit message..."
          style={{
            padding: "6px 8px",
            background: "var(--bg-input)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 4,
            fontSize: 12,
            color: "var(--text-primary)",
          }}
        />
        <button
          onClick={handleCommit}
          disabled={!commitMsg.trim() || status?.staged?.length === 0}
          style={{
            padding: "5px 10px",
            background: commitMsg.trim() && status?.staged?.length > 0 ? "var(--accent-base)" : "var(--bg-card)",
            color: commitMsg.trim() && status?.staged?.length > 0 ? "#fff" : "var(--text-muted)",
            border: "none",
            borderRadius: 4,
            cursor: commitMsg.trim() && status?.staged?.length > 0 ? "pointer" : "default",
            fontWeight: 500,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
          }}
        >
          <Check size={12} /> Commit ({status?.staged?.length ?? 0} staged)
        </button>
      </div>

      {/* Staged Changes */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 4 }}>
          Staged Changes ({status?.staged?.length || 0})
        </div>
        {status?.staged?.length === 0 ? (
          <div style={{ fontSize: 11, color: "var(--text-muted)", fontStyle: "italic", padding: "2px 4px" }}>
            No staged changes
          </div>
        ) : (
          status?.staged?.map((f: any) => (
            <div
              key={f.path}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "3px 6px",
                borderRadius: 4,
                fontSize: 11,
                fontFamily: "var(--font-mono)",
              }}
            >
              <span style={{ color: "var(--success)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={f.path}>
                {f.path}
              </span>
              <button
                onClick={() => handleUnstage(f.path)}
                title="Unstage"
                style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", display: "flex" }}
              >
                <Minus size={12} />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Changes / Unstaged */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 4 }}>
          Changes ({((status?.unstaged?.length || 0) + (status?.untracked?.length || 0))})
        </div>

        {[...(status?.unstaged || []), ...(status?.untracked || [])].map((f: any) => (
          <div
            key={f.path}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "3px 6px",
              borderRadius: 4,
              fontSize: 11,
              fontFamily: "var(--font-mono)",
            }}
          >
            <span
              style={{
                color: f.status === "untracked" ? "var(--warning)" : "var(--text-secondary)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={f.path}
            >
              {f.path}
            </span>
            <div style={{ display: "flex", gap: 4 }}>
              <button
                onClick={() => handleDiscard(f.path)}
                title="Discard changes"
                style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", display: "flex" }}
              >
                <RotateCcw size={11} />
              </button>
              <button
                onClick={() => handleStage(f.path)}
                title="Stage"
                style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", display: "flex" }}
              >
                <Plus size={12} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
