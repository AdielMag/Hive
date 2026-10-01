import React, { useEffect, useState } from "react";
import {
  GitBranch,
  GitCommit,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Check,
  ArrowUpRight,
  Clock,
  User,
  AlertCircle,
  ExternalLink,
  ChevronRight,
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useSessionStore } from "../store/session-store.ts";
import { useUi } from "../store/ui-store.ts";

export const BranchesPanel: React.FC = () => {
  const { activeProject } = useSessionStore(
    useShallow((s) => ({ activeProject: s.activeProject })),
  );
  const showLeft = useUi((s) => s.showLeft);

  const [status, setStatus] = useState<any>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [logs, setLogs] = useState<Array<{ hash: string; author: string; relativeDate: string; message: string }>>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"branches" | "history">("branches");
  const [newBranchName, setNewBranchName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const refreshAll = async () => {
    if (!activeProject?.path) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      const [repoStatus, branchList, commitLogs] = await Promise.all([
        window.studio.getGitStatus(activeProject.path),
        window.studio.getGitBranches(activeProject.path),
        window.studio.getGitLog(activeProject.path, 35),
      ]);
      setStatus(repoStatus);
      setBranches(branchList);
      setLogs(commitLogs);
    } catch (err: any) {
      setErrorMessage(`Failed to read git repository: ${err.message || String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshAll();
  }, [activeProject?.path]);

  const handleCheckout = async (branch: string) => {
    if (!activeProject || branch === status?.branch) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      await window.studio.gitCheckout(activeProject.path, branch);
      setSuccessMessage(`Checked out branch "${branch}"`);
      setTimeout(() => setSuccessMessage(null), 2500);
      await refreshAll();
    } catch (err: any) {
      setErrorMessage(`Checkout failed: ${err.message || String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newBranchName.trim();
    if (!activeProject || !trimmed) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      await window.studio.gitCreateBranch(activeProject.path, trimmed);
      setNewBranchName("");
      setIsCreating(false);
      setSuccessMessage(`Created and checked out branch "${trimmed}"`);
      setTimeout(() => setSuccessMessage(null), 2500);
      await refreshAll();
    } catch (err: any) {
      setErrorMessage(`Failed to create branch: ${err.message || String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteBranch = async (branch: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!activeProject || branch === status?.branch) return;
    if (!confirm(`Delete local branch "${branch}"?`)) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      await window.studio.gitDeleteBranch(activeProject.path, branch);
      setSuccessMessage(`Deleted branch "${branch}"`);
      setTimeout(() => setSuccessMessage(null), 2500);
      await refreshAll();
    } catch (err: any) {
      setErrorMessage(`Failed to delete branch: ${err.message || String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  if (!activeProject) {
    return (
      <div style={{ padding: 16, color: "var(--text-muted)", fontSize: 12, textAlign: "center" }}>
        No project active. Select or open a project first.
      </div>
    );
  }

  if (status && !status.isRepo) {
    return (
      <div style={{ padding: 16, color: "var(--text-muted)", fontSize: 12, textAlign: "center" }}>
        Project directory is not a Git repository.
      </div>
    );
  }

  const filteredBranches = branches.filter((b) => b.toLowerCase().includes(filter.trim().toLowerCase()));

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "var(--bg-app)",
        fontSize: 12,
        overflow: "hidden",
      }}
    >
      {/* Top Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 12px",
          borderBottom: "1px solid var(--border-subtle)",
          background: "var(--bg-card)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600 }}>
          <GitBranch size={15} color="var(--accent-base)" />
          <span>Branches & History</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            type="button"
            onClick={() => showLeft("git")}
            title="Switch to Commits & Changes panel"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              background: "transparent",
              border: "1px solid var(--border-subtle)",
              borderRadius: 4,
              color: "var(--text-secondary)",
              padding: "2px 6px",
              fontSize: 10,
              cursor: "pointer",
            }}
          >
            <GitCommit size={11} />
            <span>Commits</span>
          </button>

          <button
            type="button"
            onClick={() => void refreshAll()}
            disabled={loading}
            title="Refresh Git status"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              padding: 3,
              display: "flex",
            }}
          >
            <RefreshCw size={13} className={loading ? "spin" : ""} />
          </button>
        </div>
      </div>

      {/* Messages */}
      {errorMessage && (
        <div
          style={{
            padding: "6px 12px",
            background: "rgba(229, 83, 75, 0.12)",
            borderBottom: "1px solid rgba(229, 83, 75, 0.25)",
            color: "var(--danger)",
            fontSize: 11,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <AlertCircle size={13} style={{ flexShrink: 0 }} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{errorMessage}</span>
        </div>
      )}

      {successMessage && (
        <div
          style={{
            padding: "6px 12px",
            background: "rgba(63, 185, 80, 0.12)",
            borderBottom: "1px solid rgba(63, 185, 80, 0.25)",
            color: "var(--success)",
            fontSize: 11,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Check size={13} style={{ flexShrink: 0 }} />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Active Branch Hero Card */}
      <div
        style={{
          margin: "8px 10px 4px 10px",
          padding: "8px 10px",
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-prominent)",
          borderRadius: 6,
          display: "flex",
          flexDirection: "column",
          gap: 6,
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
            Current Branch
          </span>
          {status?.upstream && (
            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
              {status.ahead > 0 && `↑${status.ahead} `}
              {status.behind > 0 && `↓${status.behind} `}
              {status.upstream}
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "var(--accent-base)",
                boxShadow: "0 0 6px var(--accent-base)",
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontWeight: 600,
                fontSize: 12.5,
                color: "var(--text-primary)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontFamily: "var(--font-mono)",
              }}
            >
              {status?.branch || "HEAD"}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setIsCreating(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              background: "var(--accent-subtle)",
              border: "none",
              color: "var(--accent-base)",
              fontSize: 10,
              fontWeight: 600,
              padding: "2px 7px",
              borderRadius: 4,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <Plus size={11} /> New
          </button>
        </div>

        {/* Inline Create Branch Form */}
        {isCreating && (
          <form onSubmit={handleCreateBranch} style={{ display: "flex", gap: 4, marginTop: 4 }}>
            <input
              type="text"
              autoFocus
              value={newBranchName}
              onChange={(e) => setNewBranchName(e.target.value)}
              placeholder="New branch name..."
              style={{
                flex: 1,
                background: "var(--bg-input)",
                border: "1px solid var(--accent-base)",
                borderRadius: 4,
                padding: "3px 6px",
                fontSize: 11,
                color: "var(--text-primary)",
                outline: "none",
              }}
            />
            <button
              type="submit"
              disabled={!newBranchName.trim() || loading}
              style={{
                background: "var(--accent-base)",
                color: "var(--accent-contrast)",
                border: "none",
                borderRadius: 4,
                padding: "2px 8px",
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => {
                setIsCreating(false);
                setNewBranchName("");
              }}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text-muted)",
                fontSize: 11,
                cursor: "pointer",
                padding: "2px 6px",
              }}
            >
              Cancel
            </button>
          </form>
        )}
      </div>

      {/* View Switcher: Branches vs History */}
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid var(--border-subtle)",
          padding: "0 10px",
          marginTop: 4,
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab("branches")}
          style={{
            padding: "6px 12px",
            border: "none",
            background: "transparent",
            color: activeTab === "branches" ? "var(--accent-base)" : "var(--text-muted)",
            fontWeight: activeTab === "branches" ? 600 : 400,
            borderBottom: `2px solid ${activeTab === "branches" ? "var(--accent-base)" : "transparent"}`,
            cursor: "pointer",
            fontSize: 11,
          }}
        >
          Branches ({branches.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("history")}
          style={{
            padding: "6px 12px",
            border: "none",
            background: "transparent",
            color: activeTab === "history" ? "var(--accent-base)" : "var(--text-muted)",
            fontWeight: activeTab === "history" ? 600 : 400,
            borderBottom: `2px solid ${activeTab === "history" ? "var(--accent-base)" : "transparent"}`,
            cursor: "pointer",
            fontSize: 11,
          }}
        >
          Commit History ({logs.length})
        </button>
      </div>

      {/* Search Bar for Branches */}
      {activeTab === "branches" && (
        <div
          style={{
            padding: "6px 10px",
            display: "flex",
            alignItems: "center",
            gap: 6,
            borderBottom: "1px solid var(--border-subtle)",
            background: "var(--bg-app)",
            flexShrink: 0,
          }}
        >
          <Search size={12} color="var(--text-muted)" />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search branches..."
            style={{
              background: "transparent",
              border: "none",
              outline: "none",
              fontSize: 11,
              color: "var(--text-primary)",
              width: "100%",
            }}
          />
        </div>
      )}

      {/* Main Content Area */}
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 6px" }}>
        {activeTab === "branches" ? (
          <div>
            {filteredBranches.length === 0 ? (
              <div style={{ padding: "16px 12px", textAlign: "center", color: "var(--text-muted)", fontSize: 11 }}>
                No branches matching "{filter}"
              </div>
            ) : (
              filteredBranches.map((b) => {
                const isCurrent = b === status?.branch;
                return (
                  <div
                    key={b}
                    onClick={() => handleCheckout(b)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "6px 8px",
                      borderRadius: 5,
                      cursor: isCurrent ? "default" : "pointer",
                      background: isCurrent ? "rgba(var(--accent-rgb), 0.12)" : "transparent",
                      color: isCurrent ? "var(--accent-base)" : "var(--text-secondary)",
                      marginBottom: 2,
                    }}
                    onMouseEnter={(e) => {
                      if (!isCurrent) e.currentTarget.style.background = "var(--bg-card-hover)";
                    }}
                    onMouseLeave={(e) => {
                      if (!isCurrent) e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0, flex: 1 }}>
                      <GitBranch size={13} style={{ flexShrink: 0, color: isCurrent ? "var(--accent-base)" : "var(--text-muted)" }} />
                      <span
                        style={{
                          fontWeight: isCurrent ? 600 : 400,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          fontFamily: "var(--font-mono)",
                        }}
                        title={b}
                      >
                        {b}
                      </span>
                      {isCurrent && (
                        <span
                          style={{
                            fontSize: 9,
                            padding: "1px 5px",
                            borderRadius: 10,
                            background: "var(--accent-base)",
                            color: "var(--accent-contrast)",
                            fontWeight: 700,
                          }}
                        >
                          current
                        </span>
                      )}
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      {!isCurrent && (
                        <button
                          type="button"
                          onClick={(e) => handleDeleteBranch(b, e)}
                          title={`Delete branch ${b}`}
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "var(--text-muted)",
                            cursor: "pointer",
                            padding: 2,
                            display: "flex",
                          }}
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        ) : (
          /* Commit History Timeline */
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {logs.length === 0 ? (
              <div style={{ padding: "16px 12px", textAlign: "center", color: "var(--text-muted)", fontSize: 11 }}>
                No commit history found
              </div>
            ) : (
              logs.map((commit, idx) => (
                <div
                  key={commit.hash || idx}
                  style={{
                    padding: "7px 9px",
                    borderRadius: 5,
                    background: "var(--bg-card)",
                    border: "1px solid var(--border-subtle)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 3,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 10,
                        fontWeight: 700,
                        color: "var(--accent-base)",
                        background: "rgba(var(--accent-rgb), 0.12)",
                        padding: "1px 5px",
                        borderRadius: 3,
                      }}
                      title="Commit hash"
                    >
                      {commit.hash}
                    </span>
                    <span style={{ fontSize: 10, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 3 }}>
                      <Clock size={10} /> {commit.relativeDate}
                    </span>
                  </div>

                  <div
                    style={{
                      fontSize: 11.5,
                      fontWeight: 500,
                      color: "var(--text-primary)",
                      lineHeight: 1.35,
                      wordBreak: "break-word",
                    }}
                  >
                    {commit.message}
                  </div>

                  <div style={{ fontSize: 10, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
                    <User size={10} /> {commit.author}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};
