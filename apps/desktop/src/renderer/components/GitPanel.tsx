import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  GitBranch,
  Plus,
  Minus,
  RotateCcw,
  Check,
  RefreshCw,
  MoreHorizontal,
  Download,
  Upload,
  CloudDownload,
  Sparkles,
  ChevronDown,
  ChevronRight,
  X,
  FileCode,
  Search,
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useSessionStore } from "../store/session-store.ts";
import { useUi } from "../store/ui-store.ts";
import { useFeatureModelStore, resolveFeatureModel } from "../store/feature-models-store.ts";
import { AiModelChip } from "./AiModelChip.tsx";

export const GitPanel: React.FC = () => {
  const { activeProject, selectedModel, defaultModel, allCatalogModels, openDiffTab } = useSessionStore(
    useShallow((s) => ({
      activeProject: s.activeProject,
      selectedModel: s.selectedModel,
      defaultModel: s.defaultModel,
      allCatalogModels: s.allCatalogModels,
      openDiffTab: s.openDiffTab,
    })),
  );
  const gitCommitConfig = useFeatureModelStore((s) => s.config.gitCommit);

  const resolvedCommitModel = useMemo(
    () => resolveFeatureModel(gitCommitConfig, selectedModel, defaultModel, allCatalogModels),
    [gitCommitConfig, selectedModel, defaultModel, allCatalogModels],
  );

  const showLeft = useUi((s) => s.showLeft);
  const [status, setStatus] = useState<any>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [commitMsg, setCommitMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [syncOp, setSyncOp] = useState<"fetch" | "pull" | "push" | null>(null);

  // Branch switcher state
  const [branchDropdownOpen, setBranchDropdownOpen] = useState(false);
  const [branchFilter, setBranchFilter] = useState("");
  const branchDropdownRef = useRef<HTMLDivElement>(null);
  const branchSearchInputRef = useRef<HTMLInputElement>(null);

  // Sync / actions menu state
  const [syncMenuOpen, setSyncMenuOpen] = useState(false);
  const syncMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!syncMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (syncMenuRef.current && !syncMenuRef.current.contains(e.target as Node)) setSyncMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [syncMenuOpen]);

  // Collapsible section states
  const [stagedExpanded, setStagedExpanded] = useState(true);
  const [changesExpanded, setChangesExpanded] = useState(true);

  // Notification / error feedback
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const refreshGit = async () => {
    if (!activeProject?.path) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      const [s, b] = await Promise.all([
        window.studio.getGitStatus(activeProject.path),
        window.studio.getGitBranches(activeProject.path).catch(() => []),
      ]);
      setStatus(s);
      setBranches(b);
    } catch (err: any) {
      setErrorMessage(err.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshGit();
  }, [activeProject?.path]);

  // Click outside to close branch dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (branchDropdownRef.current && !branchDropdownRef.current.contains(e.target as Node)) {
        setBranchDropdownOpen(false);
        setBranchFilter("");
      }
    };
    if (branchDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      setTimeout(() => branchSearchInputRef.current?.focus(), 50);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [branchDropdownOpen]);

  const handleStage = async (file: string) => {
    if (!activeProject) return;
    try {
      await window.studio.stageFile(activeProject.path, file);
      await refreshGit();
    } catch (err: any) {
      setErrorMessage(`Stage failed: ${err.message || String(err)}`);
    }
  };

  const handleStageAll = async () => {
    if (!activeProject) return;
    try {
      await window.studio.stageAll(activeProject.path);
      await refreshGit();
    } catch (err: any) {
      setErrorMessage(`Stage all failed: ${err.message || String(err)}`);
    }
  };

  const handleUnstage = async (file: string) => {
    if (!activeProject) return;
    try {
      await window.studio.unstageFile(activeProject.path, file);
      await refreshGit();
    } catch (err: any) {
      setErrorMessage(`Unstage failed: ${err.message || String(err)}`);
    }
  };

  const handleUnstageAll = async () => {
    if (!activeProject) return;
    try {
      await window.studio.unstageAll(activeProject.path);
      await refreshGit();
    } catch (err: any) {
      setErrorMessage(`Unstage all failed: ${err.message || String(err)}`);
    }
  };

  const handleDiscard = async (file: string) => {
    if (!activeProject) return;
    if (confirm(`Discard changes in ${file}?`)) {
      try {
        await window.studio.discardFile(activeProject.path, file);
        await refreshGit();
      } catch (err: any) {
        setErrorMessage(`Discard failed: ${err.message || String(err)}`);
      }
    }
  };

  const handleDiscardAll = async () => {
    if (!activeProject) return;
    if (confirm("Discard all unstaged changes? This cannot be undone.")) {
      try {
        await window.studio.discardAll(activeProject.path);
        await refreshGit();
      } catch (err: any) {
        setErrorMessage(`Discard all failed: ${err.message || String(err)}`);
      }
    }
  };

  const handleCheckoutBranch = async (branch: string) => {
    if (!activeProject || branch === status?.branch) {
      setBranchDropdownOpen(false);
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    try {
      await window.studio.gitCheckout(activeProject.path, branch);
      setBranchDropdownOpen(false);
      setBranchFilter("");
      await refreshGit();
    } catch (err: any) {
      setErrorMessage(`Checkout failed: ${err.message || String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateBranch = async (newBranch: string) => {
    const trimmed = newBranch.trim();
    if (!activeProject || !trimmed) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      await window.studio.gitCreateBranch(activeProject.path, trimmed);
      setBranchDropdownOpen(false);
      setBranchFilter("");
      await refreshGit();
    } catch (err: any) {
      setErrorMessage(`Create branch failed: ${err.message || String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleViewDiff = (filePath: string, staged: boolean) => {
    if (!activeProject) return;
    void openDiffTab(filePath, staged, activeProject.id);
  };

  const handleGenerateAiCommitMessage = async () => {
    if (!activeProject || stagedCount === 0 || isGeneratingAi) return;
    setIsGeneratingAi(true);
    setErrorMessage(null);
    try {
      const generated = await window.studio.generateCommitMessage(
        activeProject.path,
        resolvedCommitModel.id || undefined,
      );
      if (generated) {
        setCommitMsg(generated);
      }
    } catch (err: any) {
      setErrorMessage(`AI message generation failed: ${err.message || String(err)}`);
    } finally {
      setIsGeneratingAi(false);
    }
  };

  const handleSync = async (op: "fetch" | "pull" | "push") => {
    if (!activeProject || syncOp) return;
    setSyncOp(op);
    setErrorMessage(null);
    try {
      if (op === "fetch") await window.studio.gitFetch(activeProject.path);
      else if (op === "pull") await window.studio.gitPull(activeProject.path);
      else await window.studio.gitPush(activeProject.path);
      await refreshGit();
    } catch (err: any) {
      const label = op.charAt(0).toUpperCase() + op.slice(1);
      setErrorMessage(`${label} failed: ${err.message || String(err)}`);
    } finally {
      setSyncOp(null);
    }
  };

  const handleCommit = async () => {
    if (!activeProject || !commitMsg.trim() || stagedCount === 0 || isCommitting) return;
    setIsCommitting(true);
    setErrorMessage(null);
    try {
      await window.studio.gitCommit(activeProject.path, commitMsg.trim());
      setCommitMsg("");
      await refreshGit();
    } catch (err: any) {
      setErrorMessage(`Commit failed: ${err.message || String(err)}`);
    } finally {
      setIsCommitting(false);
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

  const stagedCount = status?.staged?.length || 0;
  const unstagedCount = (status?.unstaged?.length || 0) + (status?.untracked?.length || 0);
  const filteredBranches = branches.filter((b) =>
    b.toLowerCase().includes(branchFilter.trim().toLowerCase()),
  );
  const exactMatchExists = branches.some(
    (b) => b.toLowerCase() === branchFilter.trim().toLowerCase(),
  );

  const getStatusBadge = (type: string) => {
    let color = "var(--text-muted)";
    let bg = "rgba(var(--fg-rgb), 0.05)";
    let label = "M";

    switch (type) {
      case "added":
        color = "#10b981";
        bg = "rgba(16, 185, 129, 0.15)";
        label = "A";
        break;
      case "modified":
        color = "#3b82f6";
        bg = "rgba(59, 130, 246, 0.15)";
        label = "M";
        break;
      case "deleted":
        color = "#ef4444";
        bg = "rgba(239, 68, 68, 0.15)";
        label = "D";
        break;
      case "untracked":
        color = "#f59e0b";
        bg = "rgba(245, 158, 11, 0.15)";
        label = "U";
        break;
      case "renamed":
        color = "#a855f7";
        bg = "rgba(168, 85, 247, 0.15)";
        label = "R";
        break;
    }

    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 16,
          height: 16,
          borderRadius: 3,
          fontSize: 10,
          fontWeight: 700,
          fontFamily: "var(--font-mono)",
          color,
          backgroundColor: bg,
          flexShrink: 0,
        }}
      >
        {label}
      </span>
    );
  };

  const renderPath = (filePath: string) => {
    const parts = filePath.split(/[/\\]/);
    const fileName = parts.pop() || filePath;
    const dir = parts.length > 0 ? parts.join("/") + "/" : "";

    return (
      <span
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          fontSize: 11,
          fontFamily: "var(--font-mono)",
        }}
        title={filePath}
      >
        {dir && <span style={{ color: "var(--text-muted)", opacity: 0.8 }}>{dir}</span>}
        <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{fileName}</span>
      </span>
    );
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        padding: 12,
        gap: 10,
        fontSize: 12,
        userSelect: "none",
        position: "relative",
        boxSizing: "border-box",
      }}
    >
      {/* Branch & Sync Header */}
      <div
        ref={branchDropdownRef}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 8px",
          background: "var(--bg-card)",
          borderRadius: 6,
          border: "1px solid var(--border-subtle)",
          position: "relative",
          flexShrink: 0,
        }}
      >
        {/* Branch Switcher Trigger Button */}
        <button
          onClick={() => setBranchDropdownOpen((prev) => !prev)}
          title="Click to switch or create branch"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontWeight: 600,
            color: "var(--text-primary)",
            background: branchDropdownOpen ? "var(--bg-elevated)" : "transparent",
            border: "none",
            borderRadius: 4,
            padding: "3px 6px",
            cursor: "pointer",
            maxWidth: "68%",
          }}
        >
          <GitBranch size={13} color="var(--accent-base)" style={{ flexShrink: 0 }} />
          <span
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontSize: 12,
            }}
          >
            {status?.branch || "HEAD"}
          </span>
          <ChevronDown
            size={12}
            color="var(--text-muted)"
            style={{
              transform: branchDropdownOpen ? "rotate(180deg)" : "none",
              transition: "transform 0.15s ease",
              flexShrink: 0,
            }}
          />
        </button>

        {/* Refresh: frequently used, kept outside the dropdown */}
        <button
          type="button"
          onClick={() => void refreshGit()}
          disabled={!!syncOp || loading}
          title="Refresh status"
          style={{
            display: "flex",
            alignItems: "center",
            background: "transparent",
            border: "none",
            borderRadius: 4,
            color: "var(--text-muted)",
            cursor: syncOp || loading ? "default" : "pointer",
            padding: "3px 5px",
            flexShrink: 0,
          }}
        >
          <RefreshCw size={13} className={syncOp || loading ? "spin" : undefined} />
        </button>

        {/* Sync menu: Fetch / Pull / Push / Branches (collapsed into one button) */}
        <div ref={syncMenuRef} style={{ position: "relative", flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => setSyncMenuOpen((prev) => !prev)}
            title={
              status?.behind || status?.ahead
                ? `Sync & Git actions (${status?.behind || 0} behind, ${status?.ahead || 0} ahead)`
                : "Sync & Git actions"
            }
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              background: syncMenuOpen ? "var(--bg-elevated)" : "transparent",
              border: "none",
              borderRadius: 4,
              color: "var(--text-muted)",
              cursor: "pointer",
              padding: "3px 5px",
              fontSize: 10,
              fontWeight: 600,
            }}
          >
            <MoreHorizontal size={14} />
            {!!status?.behind && <span style={{ color: "var(--warning)" }}>↓{status.behind}</span>}
            {!!status?.ahead && <span style={{ color: "var(--accent-base)" }}>↑{status.ahead}</span>}
          </button>
          {syncMenuOpen && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                right: 0,
                marginTop: 4,
                minWidth: 190,
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-prominent)",
                borderRadius: 6,
                boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                zIndex: 100,
                padding: 4,
                display: "flex",
                flexDirection: "column",
              }}
            >
              {(
                [
                  { key: "fetch", icon: CloudDownload, label: "Fetch", hint: "", sync: "fetch" },
                  { key: "pull", icon: Download, label: "Pull", hint: status?.behind ? `${status.behind} behind` : "", sync: "pull" },
                  { key: "push", icon: Upload, label: "Push", hint: status?.ahead ? `${status.ahead} ahead` : "", sync: "push" },
                  { key: "branches", icon: GitBranch, label: "Branches & History", hint: "", sync: null },
                ] as const
              ).map(({ key, icon: Icon, label, hint, sync }) => {
                const disabled = key === "branches" ? false : !!syncOp || loading;
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      setSyncMenuOpen(false);
                      if (sync) void handleSync(sync);
                      else showLeft("branches");
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      background: "transparent",
                      border: "none",
                      borderRadius: 4,
                      color: "var(--text-primary)",
                      cursor: disabled ? "default" : "pointer",
                      opacity: disabled ? 0.5 : 1,
                      padding: "5px 8px",
                      fontSize: 12,
                      textAlign: "left",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-card)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <Icon size={13} color="var(--text-muted)" />
                    <span style={{ flex: 1 }}>{label}</span>
                    {hint && <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{hint}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Branch Dropdown Popover */}
        {branchDropdownOpen && (
          <div
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              right: 0,
              marginTop: 4,
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-prominent)",
              borderRadius: 6,
              boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
              zIndex: 100,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              maxHeight: 260,
            }}
          >
            {/* Search / Filter Input */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 8px",
                borderBottom: "1px solid var(--border-subtle)",
                background: "var(--bg-card)",
              }}
            >
              <Search size={12} color="var(--text-muted)" />
              <input
                ref={branchSearchInputRef}
                type="text"
                value={branchFilter}
                onChange={(e) => setBranchFilter(e.target.value)}
                placeholder="Search or create branch..."
                style={{
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  color: "var(--text-primary)",
                  fontSize: 11,
                  width: "100%",
                }}
              />
              {branchFilter && (
                <button
                  onClick={() => setBranchFilter("")}
                  style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", display: "flex", padding: 0 }}
                >
                  <X size={11} />
                </button>
              )}
            </div>

            {/* Branch List */}
            <div style={{ overflowY: "auto", padding: "4px 0", flex: 1 }}>
              {/* Option to create new branch if filter doesn't match existing */}
              {branchFilter.trim() && !exactMatchExists && (
                <div
                  onClick={() => handleCreateBranch(branchFilter)}
                  style={{
                    padding: "6px 10px",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    cursor: "pointer",
                    fontSize: 11,
                    color: "var(--accent-base)",
                    borderBottom: "1px solid var(--border-subtle)",
                    background: "rgba(var(--accent-rgb), 0.08)",
                  }}
                >
                  <Plus size={12} />
                  <span>Create branch <strong>{branchFilter.trim()}</strong></span>
                </div>
              )}

              {filteredBranches.length === 0 && !branchFilter.trim() ? (
                <div style={{ padding: "8px 10px", color: "var(--text-muted)", fontSize: 11, fontStyle: "italic" }}>
                  No branches found
                </div>
              ) : (
                filteredBranches.map((b) => {
                  const isCurrent = b === status?.branch;
                  return (
                    <div
                      key={b}
                      onClick={() => handleCheckoutBranch(b)}
                      style={{
                        padding: "5px 10px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        cursor: "pointer",
                        fontSize: 11,
                        background: isCurrent ? "rgba(var(--accent-rgb), 0.12)" : "transparent",
                        color: isCurrent ? "var(--accent-base)" : "var(--text-primary)",
                        fontWeight: isCurrent ? 600 : 400,
                      }}
                      onMouseEnter={(e) => {
                        if (!isCurrent) e.currentTarget.style.background = "var(--bg-card-hover)";
                      }}
                      onMouseLeave={(e) => {
                        if (!isCurrent) e.currentTarget.style.background = "transparent";
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 6, overflow: "hidden", textOverflow: "ellipsis" }}>
                        <GitBranch size={11} color={isCurrent ? "var(--accent-base)" : "var(--text-muted)"} />
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b}</span>
                      </div>
                      {isCurrent && <Check size={12} color="var(--accent-base)" />}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* Error Banner */}
      {errorMessage && (
        <div
          style={{
            padding: "6px 8px",
            background: "rgba(229, 83, 75, 0.15)",
            border: "1px solid rgba(229, 83, 75, 0.3)",
            borderRadius: 4,
            color: "var(--danger)",
            fontSize: 11,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
          }}
        >
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{errorMessage}</span>
          <button
            onClick={() => setErrorMessage(null)}
            style={{ background: "transparent", border: "none", color: "var(--danger)", cursor: "pointer", display: "flex", padding: 0 }}
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/* Scrollable File Changes Section */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          flex: 1,
          overflowY: "auto",
          minHeight: 120,
        }}
      >
        {/* Staged Changes Section */}
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 4,
            }}
          >
            <div
              onClick={() => setStagedExpanded((prev) => !prev)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                cursor: "pointer",
                fontSize: 10,
                fontWeight: 700,
                color: "var(--text-secondary)",
                letterSpacing: "0.04em",
                textTransform: "uppercase",
              }}
            >
              <ChevronRight
                size={11}
                style={{
                  transform: stagedExpanded ? "rotate(90deg)" : "none",
                  transition: "transform 0.15s ease",
                }}
              />
              <span>Staged Changes</span>
              <span
                style={{
                  padding: "1px 5px",
                  borderRadius: 8,
                  fontSize: 10,
                  fontWeight: 600,
                  backgroundColor: stagedCount > 0 ? "rgba(16, 185, 129, 0.15)" : "rgba(var(--fg-rgb), 0.05)",
                  color: stagedCount > 0 ? "var(--success)" : "var(--text-muted)",
                }}
              >
                {stagedCount}
              </span>
            </div>

            {stagedCount > 0 && (
              <button
                onClick={handleUnstageAll}
                title="Unstage all changes"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  padding: 2,
                  borderRadius: 3,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
              >
                <Minus size={13} />
              </button>
            )}
          </div>

          {stagedExpanded && (
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {stagedCount === 0 ? (
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--text-muted)",
                    fontStyle: "italic",
                    padding: "6px 8px",
                    borderRadius: 4,
                    border: "1px dashed var(--border-subtle)",
                    textAlign: "center",
                  }}
                >
                  No staged changes
                </div>
              ) : (
                status?.staged?.map((f: any) => {
                  return (
                    <div
                      key={f.path}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "3px 6px",
                        borderRadius: 4,
                        cursor: "pointer",
                        gap: 6,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "var(--bg-card-hover)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                      }}
                    >
                      <div
                        onClick={() => handleViewDiff(f.path, true)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          overflow: "hidden",
                          flex: 1,
                        }}
                      >
                        {getStatusBadge(f.status)}
                        {renderPath(f.path)}
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
                        <button
                          onClick={() => handleViewDiff(f.path, true)}
                          title="Open staged diff tab"
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "var(--text-muted)",
                            cursor: "pointer",
                            display: "flex",
                            padding: 2,
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent-base)")}
                          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
                        >
                          <FileCode size={11} />
                        </button>
                        <button
                          onClick={() => handleUnstage(f.path)}
                          title="Unstage file"
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "var(--text-muted)",
                            cursor: "pointer",
                            display: "flex",
                            padding: 2,
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--danger)")}
                          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
                        >
                          <Minus size={12} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Changes (Unstaged & Untracked) Section */}
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 4,
            }}
          >
            <div
              onClick={() => setChangesExpanded((prev) => !prev)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                cursor: "pointer",
                fontSize: 10,
                fontWeight: 700,
                color: "var(--text-secondary)",
                letterSpacing: "0.04em",
                textTransform: "uppercase",
              }}
            >
              <ChevronRight
                size={11}
                style={{
                  transform: changesExpanded ? "rotate(90deg)" : "none",
                  transition: "transform 0.15s ease",
                }}
              />
              <span>Changes</span>
              <span
                style={{
                  padding: "1px 5px",
                  borderRadius: 8,
                  fontSize: 10,
                  fontWeight: 600,
                  backgroundColor: unstagedCount > 0 ? "rgba(59, 130, 246, 0.15)" : "rgba(var(--fg-rgb), 0.05)",
                  color: unstagedCount > 0 ? "var(--accent-base)" : "var(--text-muted)",
                }}
              >
                {unstagedCount}
              </span>
            </div>

            {unstagedCount > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <button
                  onClick={handleDiscardAll}
                  title="Discard all unstaged changes"
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    padding: 2,
                    borderRadius: 3,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "var(--danger)")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
                >
                  <RotateCcw size={11} />
                </button>
                <button
                  onClick={handleStageAll}
                  title="Stage all changes"
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    padding: 2,
                    borderRadius: 3,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent-base)")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
                >
                  <Plus size={13} />
                </button>
              </div>
            )}
          </div>

          {changesExpanded && (
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {unstagedCount === 0 ? (
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--text-muted)",
                    fontStyle: "italic",
                    padding: "6px 8px",
                    borderRadius: 4,
                    border: "1px dashed var(--border-subtle)",
                    textAlign: "center",
                  }}
                >
                  No unstaged changes
                </div>
              ) : (
                [...(status?.unstaged || []), ...(status?.untracked || [])].map((f: any) => {
                  return (
                    <div
                      key={f.path}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "3px 6px",
                        borderRadius: 4,
                        cursor: "pointer",
                        gap: 6,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "var(--bg-card-hover)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                      }}
                    >
                      <div
                        onClick={() => handleViewDiff(f.path, false)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          overflow: "hidden",
                          flex: 1,
                        }}
                      >
                        {getStatusBadge(f.status)}
                        {renderPath(f.path)}
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0 }}>
                        <button
                          onClick={() => handleViewDiff(f.path, false)}
                          title="Open diff tab"
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "var(--text-muted)",
                            cursor: "pointer",
                            display: "flex",
                            padding: 2,
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent-base)")}
                          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
                        >
                          <FileCode size={11} />
                        </button>
                        <button
                          onClick={() => handleDiscard(f.path)}
                          title="Discard changes"
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "var(--text-muted)",
                            cursor: "pointer",
                            display: "flex",
                            padding: 2,
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--danger)")}
                          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
                        >
                          <RotateCcw size={11} />
                        </button>
                        <button
                          onClick={() => handleStage(f.path)}
                          title="Stage file"
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "var(--text-muted)",
                            cursor: "pointer",
                            display: "flex",
                            padding: 2,
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent-base)")}
                          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
                        >
                          <Plus size={12} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>

      {/* Commit Box — Pinned At Bottom */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          marginTop: "auto",
          paddingTop: 8,
          borderTop: "1px solid var(--border-subtle)",
          flexShrink: 0,
        }}
      >
        <textarea
          rows={3}
          value={commitMsg}
          onChange={(e) => setCommitMsg(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
              e.preventDefault();
              void handleCommit();
            }
          }}
          placeholder="Commit message (Ctrl+Enter to commit)..."
          style={{
            padding: "6px 8px",
            background: "var(--bg-input)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 6,
            fontSize: 11,
            color: "var(--text-primary)",
            resize: "vertical",
            minHeight: 52,
            maxHeight: 140,
            outline: "none",
            fontFamily: "var(--font-sans)",
            lineHeight: 1.4,
          }}
        />

        {/* Action Row: AI Generate & Commit Button */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
          {/* AI Commit Message Button — strictly requires staged files */}
          <button
            onClick={handleGenerateAiCommitMessage}
            disabled={stagedCount === 0 || isGeneratingAi}
            title={
              stagedCount === 0
                ? `Stage files first to generate commit message with AI (${resolvedCommitModel.name || resolvedCommitModel.id})`
                : `Generate commit message with AI · Using ${resolvedCommitModel.name || resolvedCommitModel.id} (${resolvedCommitModel.sourceLabel})`
            }
            style={{
              padding: "5px 9px",
              background: stagedCount > 0 ? "rgba(var(--accent-rgb), 0.12)" : "var(--bg-card)",
              color: stagedCount > 0 ? "var(--accent-base)" : "var(--text-muted)",
              border: `1px solid ${stagedCount > 0 ? "rgba(var(--accent-rgb), 0.3)" : "var(--border-subtle)"}`,
              borderRadius: 4,
              cursor: stagedCount > 0 && !isGeneratingAi ? "pointer" : "not-allowed",
              fontWeight: 500,
              fontSize: 11,
              display: "flex",
              alignItems: "center",
              gap: 5,
              opacity: stagedCount > 0 ? 1 : 0.5,
              transition: "all 0.15s ease",
            }}
          >
            {isGeneratingAi ? (
              <>
                <RefreshCw size={12} className="spin" />
                <span>Generating...</span>
              </>
            ) : (
              <>
                <Sparkles size={12} />
                <span>AI Message</span>
                <AiModelChip model={resolvedCommitModel} clickable={false} feature="gitCommit" />
              </>
            )}
          </button>

          {/* Commit Button */}
          <button
            onClick={handleCommit}
            disabled={!commitMsg.trim() || stagedCount === 0 || isCommitting}
            title={
              stagedCount === 0
                ? "No files staged to commit"
                : !commitMsg.trim()
                ? "Enter a commit message or generate with AI"
                : "Commit staged changes (Ctrl+Enter)"
            }
            style={{
              padding: "5px 12px",
              background:
                commitMsg.trim() && stagedCount > 0 && !isCommitting
                  ? "var(--accent-base)"
                  : "var(--bg-card)",
              color: commitMsg.trim() && stagedCount > 0 ? "#fff" : "var(--text-muted)",
              border: "none",
              borderRadius: 4,
              cursor:
                commitMsg.trim() && stagedCount > 0 && !isCommitting ? "pointer" : "default",
              fontWeight: 600,
              fontSize: 11,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              opacity: commitMsg.trim() && stagedCount > 0 ? 1 : 0.6,
              transition: "all 0.15s ease",
            }}
          >
            {isCommitting ? (
              <>
                <RefreshCw size={12} className="spin" />
                <span>Committing...</span>
              </>
            ) : (
              <>
                <Check size={12} />
                <span>Commit ({stagedCount})</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
