import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  GitBranch,
  Plus,
  Minus,
  Undo2,
  Check,
  CircleCheck,
  RefreshCw,
  MoreHorizontal,
  ArrowDown,
  ArrowUp,
  CloudDownload,
  CloudUpload,
  Sparkles,
  ChevronDown,
  ChevronRight,
  X,
  FileDiff,
  Search,
  History,
} from "lucide-react";
import type { ModuleHost } from "@hive/module-sdk/renderer";
import type { GitFileStatus, GitRepoStatus } from "../shared.ts";
import { useGitStore } from "./git-store.ts";
import { gitApi } from "./git-host.ts";
import { openDiffTab } from "./open-diff.ts";

const STATUS_LETTER: Record<GitFileStatus["status"], string> = {
  added: "A",
  modified: "M",
  deleted: "D",
  untracked: "U",
  renamed: "R",
  conflicted: "!",
};
const STATUS_LABEL: Record<GitFileStatus["status"], string> = {
  added: "Added",
  modified: "Modified",
  deleted: "Deleted",
  untracked: "Untracked",
  renamed: "Renamed",
  conflicted: "Merge conflict",
};

const SUBJECT_SOFT_LIMIT = 72;
const POLL_MS = 5000;

/** Unsent commit messages survive the panel being closed or the project being switched. */
const drafts = new Map<string, string>();

const errText = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/** Closes a popover on outside mousedown / Escape while `open`. */
function useDismiss(open: boolean, ref: React.RefObject<HTMLElement | null>, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, ref, close]);
}

const DiffStat: React.FC<{ files: GitFileStatus[] }> = ({ files }) => {
  let add = 0;
  let del = 0;
  for (const f of files) {
    add += f.additions ?? 0;
    del += f.deletions ?? 0;
  }
  if (!add && !del) return null;
  return (
    <span className="gp-stat" title={`${add} additions, ${del} deletions`}>
      <span className="gp-stat__add">+{add}</span>
      <span className="gp-stat__del">−{del}</span>
    </span>
  );
};

interface IconBtnProps {
  title: string;
  onClick: () => void;
  tone?: "accent" | "danger" | "success";
  children: React.ReactNode;
}
const IconBtn: React.FC<IconBtnProps> = ({ title, onClick, tone, children }) => (
  <button
    type="button"
    className={`gp-ib${tone ? ` gp-ib--${tone}` : ""}`}
    title={title}
    aria-label={title}
    onClick={(e) => {
      e.stopPropagation();
      onClick();
    }}
  >
    {children}
  </button>
);

interface SectionProps {
  title: string;
  count: number;
  countClass: string;
  files: GitFileStatus[];
  expanded: boolean;
  onToggle: () => void;
  actions: React.ReactNode;
  emptyText: string;
  children: React.ReactNode;
}
const Section: React.FC<SectionProps> = ({
  title,
  count,
  countClass,
  files,
  expanded,
  onToggle,
  actions,
  emptyText,
  children,
}) => (
  <section className="gp-section">
    <div className="gp-sec-head">
      <button type="button" className="gp-sec-toggle" onClick={onToggle} aria-expanded={expanded}>
        <ChevronRight size={12} className={`gp-sec-chev${expanded ? " gp-sec-chev--open" : ""}`} />
        <span>{title}</span>
        <span className={`gp-count ${count > 0 ? countClass : ""}`}>{count}</span>
        <DiffStat files={files} />
      </button>
      {count > 0 && <div className="gp-sec-actions">{actions}</div>}
    </div>
    {expanded &&
      (count === 0 ? <div className="gp-empty">{emptyText}</div> : <div className="gp-rows">{children}</div>)}
  </section>
);

interface FileRowProps {
  file: GitFileStatus;
  onOpen: () => void;
  actions: React.ReactNode;
}
const FileRow: React.FC<FileRowProps> = ({ file, onOpen, actions }) => {
  const parts = file.path.split(/[/\\]/);
  const name = parts.pop() || file.path;
  const dir = parts.join("/");
  const hasStat = file.additions !== undefined || file.deletions !== undefined;
  const tip = [
    file.path,
    file.origPath ? `renamed from ${file.origPath}` : "",
    STATUS_LABEL[file.status],
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className="gp-row"
      role="button"
      tabIndex={0}
      title={tip}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <span className="gp-badge" data-status={file.status} aria-label={STATUS_LABEL[file.status]}>
        {STATUS_LETTER[file.status]}
      </span>
      <span className="gp-path">
        <span className={`gp-path__name${file.status === "deleted" ? " gp-path__name--deleted" : ""}`}>{name}</span>
        {dir && <span className="gp-path__dir">{dir}</span>}
      </span>
      {hasStat && (
        <span className="gp-row__stat">
          <DiffStat files={[file]} />
        </span>
      )}
      <div className="gp-row__actions">{actions}</div>
    </div>
  );
};

export const GitPanel: React.FC<{ host: ModuleHost }> = ({ host }) => {
  const { project: activeProject } = host.hooks.useActiveSession();
  const projectPath = activeProject?.path;
  const resolvedCommitModel = host.hooks.useFeatureModel("gitCommit");
  const AiModelChip = host.ui.AiModelChip;

  const [status, setStatus] = useState<GitRepoStatus | null>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [commitMsg, setCommitMsg] = useState(() => (projectPath ? (drafts.get(projectPath) ?? "") : ""));
  const [loading, setLoading] = useState(false);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [syncOp, setSyncOp] = useState<"fetch" | "pull" | "push" | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [stagedExpanded, setStagedExpanded] = useState(true);
  const [changesExpanded, setChangesExpanded] = useState(true);

  // Popovers
  const [branchOpen, setBranchOpen] = useState(false);
  const [branchFilter, setBranchFilter] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const [commitMenuOpen, setCommitMenuOpen] = useState(false);
  const headRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const splitRef = useRef<HTMLDivElement>(null);
  const branchInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const requestId = useRef(0);

  const closeBranch = useCallback(() => {
    setBranchOpen(false);
    setBranchFilter("");
  }, []);
  const closeMore = useCallback(() => setMoreOpen(false), []);
  const closeCommitMenu = useCallback(() => setCommitMenuOpen(false), []);
  useDismiss(branchOpen, headRef, closeBranch);
  useDismiss(moreOpen, moreRef, closeMore);
  useDismiss(commitMenuOpen, splitRef, closeCommitMenu);

  const refreshGit = useCallback(
    async (silent = false) => {
      if (!projectPath) return;
      const id = ++requestId.current;
      if (!silent) {
        setLoading(true);
        setErrorMessage(null);
      }
      try {
        const [s, b] = await Promise.all([
          gitApi().getGitStatus(projectPath),
          gitApi()
            .getGitBranches(projectPath)
            .catch(() => [] as string[]),
        ]);
        if (id !== requestId.current) return;
        setStatus(s);
        setBranches(b);
        useGitStore.getState().setStatus(
          s?.isRepo
            ? { ahead: s.ahead ?? 0, behind: s.behind ?? 0, branch: s.branch ?? "", upstream: s.upstream, isRepo: true }
            : null,
        );
      } catch (err) {
        if (!silent && id === requestId.current) setErrorMessage(errText(err));
      } finally {
        if (!silent && id === requestId.current) setLoading(false);
      }
    },
    [projectPath],
  );

  // Initial load + project switch (restores that project's draft message).
  useEffect(() => {
    setStatus(null);
    setCommitMsg(projectPath ? (drafts.get(projectPath) ?? "") : "");
    void refreshGit();
  }, [projectPath, refreshGit]);

  // Keep the lists fresh while the panel is open: agents edit files behind our back.
  useEffect(() => {
    if (!projectPath) return;
    const tick = () => {
      if (document.visibilityState === "visible") void refreshGit(true);
    };
    const timer = setInterval(tick, POLL_MS);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", tick);
    };
  }, [projectPath, refreshGit]);

  useEffect(() => {
    if (!projectPath) return;
    if (commitMsg) drafts.set(projectPath, commitMsg);
    else drafts.delete(projectPath);
  }, [projectPath, commitMsg]);

  useEffect(() => {
    if (branchOpen) setTimeout(() => branchInputRef.current?.focus(), 30);
  }, [branchOpen]);

  // Auto-grow the message box.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [commitMsg]);

  /** Runs a git action, surfaces failures in the banner and re-reads status. */
  const act = async (label: string, fn: (cwd: string) => Promise<unknown>) => {
    if (!projectPath) return;
    try {
      await fn(projectPath);
      await refreshGit(true);
    } catch (err) {
      setErrorMessage(`${label} failed: ${errText(err)}`);
    }
  };

  const handleStage = (file: string) => act("Stage", (cwd) => gitApi().stageFile(cwd, file));
  const handleStageAll = () => act("Stage all", (cwd) => gitApi().stageAll(cwd));
  const handleUnstage = (file: string) => act("Unstage", (cwd) => gitApi().unstageFile(cwd, file));
  const handleUnstageAll = () => act("Unstage all", (cwd) => gitApi().unstageAll(cwd));
  const handleDiscard = (f: GitFileStatus) => {
    const what = f.status === "untracked" ? `Delete untracked file ${f.path}?` : `Discard changes in ${f.path}?`;
    if (confirm(`${what} This cannot be undone.`)) void act("Discard", (cwd) => gitApi().discardFile(cwd, f.path));
  };
  const handleDiscardAll = () => {
    if (confirm("Discard all unstaged changes and delete untracked files? This cannot be undone.")) {
      void act("Discard all", (cwd) => gitApi().discardAll(cwd));
    }
  };

  const handleCheckoutBranch = async (branch: string) => {
    if (!projectPath || branch === status?.branch) return closeBranch();
    setLoading(true);
    setErrorMessage(null);
    try {
      await gitApi().gitCheckout(projectPath, branch);
      closeBranch();
      await refreshGit();
    } catch (err) {
      setErrorMessage(`Checkout failed: ${errText(err)}`);
      setLoading(false);
    }
  };

  const handleCreateBranch = async (name: string) => {
    const trimmed = name.trim();
    if (!projectPath || !trimmed) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      await gitApi().gitCreateBranch(projectPath, trimmed);
      closeBranch();
      await refreshGit();
    } catch (err) {
      setErrorMessage(`Create branch failed: ${errText(err)}`);
      setLoading(false);
    }
  };

  const handleViewDiff = (filePath: string, staged: boolean) => {
    if (activeProject) void openDiffTab(host, activeProject, filePath, staged);
  };

  const handleSync = async (op: "fetch" | "pull" | "push") => {
    if (!projectPath || syncOp) return;
    setSyncOp(op);
    setErrorMessage(null);
    try {
      if (op === "fetch") await gitApi().gitFetch(projectPath);
      else if (op === "pull") await gitApi().gitPull(projectPath);
      else await gitApi().gitPush(projectPath);
      await refreshGit(true);
    } catch (err) {
      setErrorMessage(`${op.charAt(0).toUpperCase()}${op.slice(1)} failed: ${errText(err)}`);
    } finally {
      setSyncOp(null);
    }
  };

  const stagedFiles = status?.staged ?? [];
  const changeFiles = useMemo(() => [...(status?.unstaged ?? []), ...(status?.untracked ?? [])], [status]);
  const stagedCount = stagedFiles.length;
  const changeCount = changeFiles.length;
  const hasMsg = commitMsg.trim().length > 0;
  const canCommit = hasMsg && stagedCount > 0 && !isCommitting;

  const handleGenerateAiCommitMessage = async () => {
    if (!projectPath || stagedCount === 0 || isGeneratingAi) return;
    setIsGeneratingAi(true);
    setErrorMessage(null);
    try {
      const generated = await gitApi().generateCommitMessage(projectPath, resolvedCommitModel.id || undefined);
      if (generated) setCommitMsg(generated);
    } catch (err) {
      setErrorMessage(`AI message generation failed: ${errText(err)}`);
    } finally {
      setIsGeneratingAi(false);
    }
  };

  const runCommit = async (mode: "commit" | "push" | "amend") => {
    setCommitMenuOpen(false);
    if (!projectPath || !hasMsg || isCommitting) return;
    if (mode !== "amend" && stagedCount === 0) return;
    if (mode === "amend" && !confirm("Replace the last commit with these changes and message?")) return;
    setIsCommitting(true);
    setErrorMessage(null);
    try {
      await gitApi().gitCommit(projectPath, commitMsg.trim(), mode === "amend");
      setCommitMsg("");
      if (mode === "push") {
        try {
          await gitApi().gitPush(projectPath);
        } catch (err) {
          setErrorMessage(`Committed, but push failed: ${errText(err)}`);
        }
      }
      await refreshGit(true);
    } catch (err) {
      setErrorMessage(`Commit failed: ${errText(err)}`);
    } finally {
      setIsCommitting(false);
    }
  };

  if (!activeProject) return <div className="gp-msg">No project open.</div>;
  if (status && !status.isRepo) return <div className="gp-msg">This folder is not a Git repository.</div>;

  const needle = branchFilter.trim().toLowerCase();
  const filteredBranches = branches.filter((b) => b.toLowerCase().includes(needle));
  const exactMatchExists = branches.some((b) => b.toLowerCase() === needle);
  const canCreate = needle.length > 0 && !exactMatchExists;

  const detached = status?.branch === "detached HEAD";
  const ahead = status?.ahead ?? 0;
  const behind = status?.behind ?? 0;
  type SyncBtn = { op: "push" | "pull"; label: string; count: number; icon: React.ReactNode };
  const syncButtons: SyncBtn[] = [];
  if (behind > 0) syncButtons.push({ op: "pull", label: "Pull", count: behind, icon: <ArrowDown size={12} /> });
  if (ahead > 0) syncButtons.push({ op: "push", label: "Push", count: ahead, icon: <ArrowUp size={12} /> });
  if (syncButtons.length === 0 && status && !status.upstream && !detached && status.branch)
    syncButtons.push({ op: "push", label: "Publish", count: 0, icon: <CloudUpload size={12} /> });

  const subjectLen = commitMsg.split("\n")[0]?.length ?? 0;
  const commitTitle =
    stagedCount === 0
      ? "Stage files to commit"
      : !hasMsg
        ? "Enter a commit message or generate one with AI"
        : "Commit staged changes (Ctrl+Enter)";

  const syncMenu = [
    { key: "fetch", icon: CloudDownload, label: "Fetch", hint: "", run: () => handleSync("fetch") },
    { key: "pull", icon: ArrowDown, label: "Pull", hint: behind ? `${behind} behind` : "", run: () => handleSync("pull") },
    { key: "push", icon: ArrowUp, label: "Push", hint: ahead ? `${ahead} ahead` : "", run: () => handleSync("push") },
  ];

  return (
    <div className="gp">
      {/* Branch & sync header */}
      <div className="gp-head" ref={headRef}>
        <button
          type="button"
          className={`gp-branch${branchOpen ? " gp-branch--open" : ""}`}
          onClick={() => setBranchOpen((v) => !v)}
          title="Switch or create branch"
          aria-haspopup="listbox"
          aria-expanded={branchOpen}
        >
          <GitBranch size={14} className="gp-branch__icon" />
          <span className="gp-branch__name">{status?.branch || "HEAD"}</span>
          <ChevronDown size={13} className="gp-branch__chev" />
        </button>

        {syncButtons.map((btn) => (
          <button
            key={btn.op}
            type="button"
            className={`gp-sync${btn.op === "pull" ? " gp-sync--behind" : ""}`}
            disabled={!!syncOp || loading}
            onClick={() => void handleSync(btn.op)}
            title={
              btn.label === "Publish"
                ? "Publish branch to origin"
                : `${btn.label} ${btn.count} commit${btn.count === 1 ? "" : "s"}${status?.upstream ? ` (${status.upstream})` : ""}`
            }
          >
            {syncOp === btn.op ? <RefreshCw size={12} className="spin" /> : btn.icon}
            <span>{btn.count || btn.label}</span>
          </button>
        ))}

        <div className="gp-head__tools" ref={moreRef}>
          <button
            type="button"
            className="gp-ib"
            style={{ height: 28, minWidth: 28 }}
            onClick={() => void handleSync("fetch")}
            disabled={!!syncOp || loading}
            title="Fetch"
            aria-label="Fetch"
          >
            <CloudDownload size={13} className={syncOp === "fetch" ? "spin" : undefined} />
          </button>
          <button
            type="button"
            className="gp-ib"
            style={{ height: 28, minWidth: 28 }}
            onClick={() => void refreshGit()}
            disabled={!!syncOp || loading}
            title="Refresh status"
            aria-label="Refresh status"
          >
            <RefreshCw size={13} className={syncOp || loading ? "spin" : undefined} />
          </button>
          <button
            type="button"
            className={`gp-ib${moreOpen ? " gp-ib--open" : ""}`}
            style={{ height: 28, minWidth: 28 }}
            onClick={() => setMoreOpen((v) => !v)}
            title="Sync & Git actions"
            aria-label="Sync & Git actions"
            aria-haspopup="menu"
            aria-expanded={moreOpen}
          >
            <MoreHorizontal size={15} />
          </button>
          {moreOpen && (
            <div className="gp-pop gp-pop--menu" role="menu">
              {syncMenu.map(({ key, icon: Icon, label, hint, run }) => (
                <button
                  key={key}
                  type="button"
                  role="menuitem"
                  className="gp-item"
                  disabled={!!syncOp || loading}
                  onClick={() => {
                    closeMore();
                    void run();
                  }}
                >
                  <Icon size={13} />
                  <span className="gp-item__label">{label}</span>
                  {hint && <span className="gp-item__hint">{hint}</span>}
                </button>
              ))}
              <div className="gp-sep" />
              <button
                type="button"
                role="menuitem"
                className="gp-item"
                onClick={() => {
                  closeMore();
                  void host.commands.run("view.branches");
                }}
              >
                <History size={13} />
                <span className="gp-item__label">Branches &amp; History</span>
              </button>
            </div>
          )}
        </div>

        {branchOpen && (
          <div className="gp-pop gp-pop--branches">
            <div className="gp-search">
              <Search size={13} />
              <input
                ref={branchInputRef}
                type="text"
                value={branchFilter}
                spellCheck={false}
                onChange={(e) => setBranchFilter(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  if (canCreate) void handleCreateBranch(branchFilter);
                  else if (filteredBranches[0]) void handleCheckoutBranch(filteredBranches[0]);
                }}
                placeholder="Search or create branch…"
              />
              {branchFilter && (
                <button type="button" className="gp-ib" onClick={() => setBranchFilter("")} aria-label="Clear">
                  <X size={12} />
                </button>
              )}
            </div>
            <div className="gp-list" role="listbox">
              {canCreate && (
                <button type="button" className="gp-item gp-item--create" onClick={() => void handleCreateBranch(branchFilter)}>
                  <Plus size={13} />
                  <span className="gp-item__label">
                    Create branch <strong>{branchFilter.trim()}</strong>
                  </span>
                </button>
              )}
              {filteredBranches.length === 0 && !canCreate ? (
                <div className="gp-empty-list">No branches found</div>
              ) : (
                filteredBranches.map((b) => {
                  const isCurrent = b === status?.branch;
                  return (
                    <button
                      key={b}
                      type="button"
                      role="option"
                      aria-selected={isCurrent}
                      className={`gp-item${isCurrent ? " gp-item--current" : ""}`}
                      onClick={() => void handleCheckoutBranch(b)}
                    >
                      <GitBranch size={12} />
                      <span className="gp-item__label">{b}</span>
                      {isCurrent && <Check size={13} />}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {errorMessage && (
        <div className="gp-error" role="alert">
          <span className="gp-error__text">{errorMessage}</span>
          <button type="button" className="gp-ib" onClick={() => setErrorMessage(null)} aria-label="Dismiss">
            <X size={12} />
          </button>
        </div>
      )}

      {/* File lists */}
      <div className="gp-scroll">
        {status && stagedCount === 0 && changeCount === 0 ? (
          <div className="gp-clean">
            <CircleCheck size={26} />
            <span className="gp-clean__title">Working tree clean</span>
            <span className="gp-clean__sub">
              {[behind > 0 && `${behind} commit${behind === 1 ? "" : "s"} to pull`, ahead > 0 && `${ahead} commit${ahead === 1 ? "" : "s"} to push`].filter(Boolean).join(" · ") || "Nothing to commit"}
            </span>
          </div>
        ) : (
          <>
            <Section
              title="Staged"
              count={stagedCount}
              countClass="gp-count--staged"
              files={stagedFiles}
              expanded={stagedExpanded}
              onToggle={() => setStagedExpanded((v) => !v)}
              emptyText="Stage files below to include them in the commit"
              actions={
                <IconBtn title="Unstage all" onClick={() => void handleUnstageAll()}>
                  <Minus size={14} />
                </IconBtn>
              }
            >
              {stagedFiles.map((f) => (
                <FileRow
                  key={`s:${f.path}`}
                  file={f}
                  onOpen={() => handleViewDiff(f.path, true)}
                  actions={
                    <>
                      <IconBtn title="Open staged diff" tone="accent" onClick={() => handleViewDiff(f.path, true)}>
                        <FileDiff size={13} />
                      </IconBtn>
                      <IconBtn title="Unstage file" tone="danger" onClick={() => void handleUnstage(f.path)}>
                        <Minus size={14} />
                      </IconBtn>
                    </>
                  }
                />
              ))}
            </Section>

            <Section
              title="Changes"
              count={changeCount}
              countClass="gp-count--changes"
              files={changeFiles}
              expanded={changesExpanded}
              onToggle={() => setChangesExpanded((v) => !v)}
              emptyText="No unstaged changes"
              actions={
                <>
                  <IconBtn title="Discard all changes" tone="danger" onClick={handleDiscardAll}>
                    <Undo2 size={13} />
                  </IconBtn>
                  <IconBtn title="Stage all" tone="success" onClick={() => void handleStageAll()}>
                    <Plus size={14} />
                  </IconBtn>
                </>
              }
            >
              {changeFiles.map((f) => (
                <FileRow
                  key={`${f.status === "untracked" ? "u" : "c"}:${f.path}`}
                  file={f}
                  onOpen={() => handleViewDiff(f.path, false)}
                  actions={
                    <>
                      <IconBtn title="Open diff" tone="accent" onClick={() => handleViewDiff(f.path, false)}>
                        <FileDiff size={13} />
                      </IconBtn>
                      <IconBtn
                        title={f.status === "untracked" ? "Delete file" : "Discard changes"}
                        tone="danger"
                        onClick={() => handleDiscard(f)}
                      >
                        <Undo2 size={13} />
                      </IconBtn>
                      <IconBtn title="Stage file" tone="success" onClick={() => void handleStage(f.path)}>
                        <Plus size={14} />
                      </IconBtn>
                    </>
                  }
                />
              ))}
            </Section>
          </>
        )}
      </div>

      {/* Commit box */}
      <div className="gp-commit">
        <div className="gp-compose">
          <textarea
            ref={textareaRef}
            rows={2}
            value={commitMsg}
            spellCheck
            onChange={(e) => setCommitMsg(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                e.preventDefault();
                void runCommit("commit");
              }
            }}
            placeholder="Message (Ctrl+Enter to commit)"
          />
          <div className="gp-compose__bar">
            <button
              type="button"
              className="gp-ai"
              onClick={() => void handleGenerateAiCommitMessage()}
              disabled={stagedCount === 0 || isGeneratingAi}
              title={
                stagedCount === 0
                  ? `Stage files first to generate a message with AI (${resolvedCommitModel.name || resolvedCommitModel.id})`
                  : `Generate commit message with AI · ${resolvedCommitModel.name || resolvedCommitModel.id} (${resolvedCommitModel.sourceLabel})`
              }
            >
              {isGeneratingAi ? (
                <>
                  <RefreshCw size={12} className="spin" />
                  <span>Writing…</span>
                </>
              ) : (
                <>
                  <Sparkles size={12} />
                  <span>Generate</span>
                  <AiModelChip model={resolvedCommitModel} clickable={false} feature="gitCommit" />
                </>
              )}
            </button>
            {subjectLen > 0 && (
              <span
                className={`gp-counter${subjectLen > SUBJECT_SOFT_LIMIT ? " gp-counter--warn" : ""}`}
                title={`Subject line length (aim for ≤ ${SUBJECT_SOFT_LIMIT})`}
              >
                {subjectLen}/{SUBJECT_SOFT_LIMIT}
              </span>
            )}
          </div>
        </div>

        <div className="gp-split" ref={splitRef}>
          <button
            type="button"
            className="gp-commit-btn"
            onClick={() => void runCommit("commit")}
            disabled={!canCommit}
            title={commitTitle}
          >
            {isCommitting ? (
              <>
                <RefreshCw size={13} className="spin" />
                <span>Committing…</span>
              </>
            ) : (
              <>
                <Check size={14} />
                <span>Commit</span>
                {stagedCount > 0 && <span className="gp-commit-btn__n">{stagedCount}</span>}
              </>
            )}
          </button>
          <button
            type="button"
            className="gp-commit-caret"
            onClick={() => setCommitMenuOpen((v) => !v)}
            disabled={!hasMsg || isCommitting}
            title="More commit options"
            aria-label="More commit options"
            aria-haspopup="menu"
            aria-expanded={commitMenuOpen}
          >
            <ChevronDown size={14} />
          </button>
          {commitMenuOpen && (
            <div className="gp-pop gp-pop--menu gp-pop--menu-up" role="menu">
              <button
                type="button"
                role="menuitem"
                className="gp-item"
                disabled={stagedCount === 0}
                onClick={() => void runCommit("push")}
              >
                <CloudUpload size={13} />
                <span className="gp-item__label">Commit &amp; Push</span>
              </button>
              <button type="button" role="menuitem" className="gp-item" onClick={() => void runCommit("amend")}>
                <Undo2 size={13} />
                <span className="gp-item__label">Amend last commit</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
