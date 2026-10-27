/**
 * Branches tool window, docked at the bottom like Rider's "Git" window: branch tree on the left, commit log with
 * graph in the middle, commit details (message, author, changed files) on the right.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  CloudDownload,
  Copy,
  GitBranch,
  GitCommit,
  GitMerge,
  Layers,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import type { ModuleHost } from "@hive/module-sdk/renderer";
import { GitCommands, type GitBranchDetail, type GitCommitDetail, type GitGraphCommit, type GitRepoStatus, type GitTag, type GitWorktreeDetail } from "@hive-module/git/shared";
import { gitApi } from "./branches-host.ts";
import { GraphCell, graphWidth, laneColor, layoutGraph } from "./graph.tsx";
import { Avatar, ContextMenu, RefChip, useColResize, type MenuEntry, type RefKind } from "./bits.tsx";
import { BranchTree, type RefTarget } from "./BranchTree.tsx";
import { CommitDetails, formatDate } from "./CommitDetails.tsx";
import "./branches-panel.css";

const PAGE = 250;
const W_KEY = { tree: "branches.treeWidth", detail: "branches.detailWidth" } as const;
const readWidth = (host: ModuleHost, key: string, fallback: number) => {
  const n = Number(host.storage.get(key));
  return Number.isFinite(n) && n >= 160 ? n : fallback;
};

type Dialog =
  | { kind: "new"; from: string }
  | { kind: "rename"; name: string }
  | null;

type Menu = { x: number; y: number; title: string; items: MenuEntry[] } | null;

const errText = (err: unknown): string => {
  const e = err as { stderr?: string; message?: string } | undefined;
  return String(e?.stderr || e?.message || err).replace(/^Error invoking remote method '[^']*': (Error: )?/, "").trim();
};

export const BranchesPanel: React.FC<{ host: ModuleHost }> = ({ host }) => {
  const { project, worktree } = host.hooks.useActiveSession();
  const rootProjectPath = project?.path ?? null;
  const worktreePath = worktree?.worktreePath ?? null;
  const [manualBranch, setManualBranch] = useState<string | null>(null);

  const prevWorktreePathRef = useRef(worktreePath);
  useEffect(() => {
    if (prevWorktreePathRef.current !== worktreePath) {
      prevWorktreePathRef.current = worktreePath;
      setManualBranch(null);
    }
  }, [worktreePath]);

  const cwd = (!manualBranch && worktreePath) ? worktreePath : rootProjectPath;

  const [status, setStatus] = useState<GitRepoStatus | null>(null);
  const [branches, setBranches] = useState<GitBranchDetail[]>([]);
  const [tags, setTags] = useState<GitTag[]>([]);
  const [worktrees, setWorktrees] = useState<GitWorktreeDetail[]>([]);
  const [graph, setGraph] = useState<GitGraphCommit[]>([]);
  const [scope, setScope] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<GitCommitDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [busy, setBusy] = useState<"pull" | "push" | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [dialogName, setDialogName] = useState("");
  const [dialogCheckout, setDialogCheckout] = useState(true);
  const [menu, setMenu] = useState<Menu>(null);
  const [treeW, setTreeW] = useState(() => readWidth(host, W_KEY.tree, 250));
  const [detailW, setDetailW] = useState(() => readWidth(host, W_KEY.detail, 340));

  const treeWRef = useRef(treeW);
  treeWRef.current = treeW;
  const detailWRef = useRef(detailW);
  detailWRef.current = detailW;
  const startTreeResize = useColResize(() => treeWRef.current, (w) => setTreeW(Math.max(160, Math.min(520, w))), 1, (w) => host.storage.set(W_KEY.tree, String(Math.round(w))));
  const startDetailResize = useColResize(() => detailWRef.current, (w) => setDetailW(Math.max(240, Math.min(640, w))), -1, (w) => host.storage.set(W_KEY.detail, String(Math.round(w))));

  const toast = useCallback((message: string, kind: "success" | "error" | "info" = "success") => host.toast({ message, kind, duration: kind === "error" ? 9000 : 2500 }), [host]);
  const refreshRailStatus = () => void host.commands.run(GitCommands.refresh);

  /* ---------------------------- data loading ---------------------------- */

  const reqId = useRef(0);
  const refreshAll = useCallback(async () => {
    if (!cwd) return;
    const id = ++reqId.current;
    setLoading(true);
    try {
      const api = gitApi();
      const [repoStatus, details, tagList, commits, wtList] = await Promise.all([
        api.getGitStatus(cwd),
        api.getGitBranchDetails(cwd),
        api.getGitTags(cwd),
        api.getGitGraph(cwd, limit, scope ? { ref: scope } : undefined),
        api.getGitWorktrees(cwd),
      ]);
      if (id !== reqId.current) return;
      setStatus(repoStatus);
      setBranches(details);
      setTags(tagList);
      setGraph(commits);
      setWorktrees(wtList);
      // A scoped branch/tag that vanished (deleted, pruned) would leave an empty log: fall back to all.
      if (scope && !details.some((b) => b.name === scope) && !tagList.some((t) => t.name === scope)) setScope(null);
      refreshRailStatus();
    } catch (err) {
      if (id === reqId.current) toast(`Failed to read git repository: ${errText(err)}`, "error");
    } finally {
      if (id === reqId.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cwd, limit, scope, toast]);

  useEffect(() => {
    setSelected(null);
    setDetail(null);
    setScope(null);
    setLimit(PAGE);
    setStatus(null);
    setBranches([]);
    setTags([]);
    setWorktrees([]);
    setGraph([]);
  }, [cwd]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  // Pick up commits/branches made elsewhere (terminal, agent) when the window regains focus.
  // Throttled: each refresh runs several git commands and re-lays-out the graph.
  const lastFocusRefresh = useRef(0);
  useEffect(() => {
    const onFocus = () => {
      const now = Date.now();
      if (now - lastFocusRefresh.current < 10_000) return;
      lastFocusRefresh.current = now;
      void refreshAll();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refreshAll]);

  // Commit details for the selected row.
  const detailCache = useRef(new Map<string, GitCommitDetail | null>());
  useEffect(() => {
    detailCache.current.clear();
  }, [cwd]);
  useEffect(() => {
    if (!cwd || !selected) {
      setDetail(null);
      setDetailLoading(false);
      return;
    }
    const cached = detailCache.current.get(selected);
    if (cached) {
      setDetail(cached);
      setDetailLoading(false);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    gitApi()
      .getGitCommitDetail(cwd, selected)
      .then((d) => {
        if (cancelled) return;
        if (d) detailCache.current.set(selected, d);
        setDetail(d);
      })
      .catch(() => !cancelled && setDetail(null))
      .finally(() => !cancelled && setDetailLoading(false));
    return () => {
      cancelled = true;
      setDetailLoading(false);
    };
  }, [cwd, selected]);

  /* ------------------------------ actions ------------------------------- */

  const run = async (op: () => Promise<unknown>, okMsg: string, errPrefix: string): Promise<boolean> => {
    try {
      await op();
      toast(okMsg);
      detailCache.current.clear();
      await refreshAll();
      return true;
    } catch (err) {
      toast(`${errPrefix}: ${errText(err)}`, "error");
      await refreshAll();
      return false;
    }
  };

  const checkoutTarget = (b: GitBranchDetail) => (b.isRemote ? b.name.slice(b.name.indexOf("/") + 1) : b.name);

  const checkout = (b: GitBranchDetail) => {
    if (!rootProjectPath || b.isCurrent) return;
    const target = checkoutTarget(b);
    if (worktree && target === worktree.branch) {
      setManualBranch(null);
      return;
    }
    // Switch the view to the root checkout only once the checkout actually succeeded.
    void run(() => gitApi().gitCheckout(rootProjectPath, target), `Checked out "${target}"`, "Checkout failed").then((ok) => {
      if (ok) setManualBranch(target);
    });
  };

  const checkoutRef = (ref: string, label: string) => {
    if (!rootProjectPath) return;
    if (worktree && ref === worktree.branch) {
      setManualBranch(null);
      return;
    }
    void run(() => gitApi().gitCheckout(rootProjectPath, ref), `Checked out ${label}`, "Checkout failed").then((ok) => {
      if (ok) setManualBranch(ref);
    });
  };

  const deleteBranch = async (b: GitBranchDetail) => {
    if (!cwd || b.isCurrent || b.isRemote) return;
    if (!confirm(`Delete local branch "${b.name}"?`)) return;
    try {
      await gitApi().gitDeleteBranch(cwd, b.name);
      toast(`Deleted "${b.name}"`);
    } catch (err) {
      const detailMsg = errText(err);
      if (/not fully merged/i.test(detailMsg) && confirm(`"${b.name}" is not fully merged. Force delete and lose its unique commits?`)) {
        try {
          await gitApi().gitDeleteBranch(cwd, b.name, true);
          toast(`Force-deleted "${b.name}"`);
        } catch (e2) {
          toast(`Failed to delete branch: ${errText(e2)}`, "error");
        }
      } else {
        toast(`Failed to delete branch: ${detailMsg}`, "error");
      }
    }
    await refreshAll();
  };

  const merge = (b: GitBranchDetail) => {
    if (!cwd || b.isCurrent) return;
    const into = status?.branch || "HEAD";
    if (!confirm(`Merge "${b.name}" into "${into}"?`)) return;
    void (async () => {
      try {
        await gitApi().gitMerge(cwd, b.name);
        toast(`Merged "${b.name}" into "${into}"`);
      } catch (err) {
        const msg = errText(err);
        toast(`Merge failed: ${msg}`, "error");
        // A conflicted merge leaves the repo mid-merge; offer the way back out.
        if (/conflict|merging|unmerged/i.test(msg) && confirm(`Merging "${b.name}" hit conflicts. Abort the merge and restore "${into}"?`)) {
          try {
            await gitApi().gitMergeAbort(cwd);
            toast("Merge aborted");
          } catch (e2) {
            toast(`Failed to abort merge: ${errText(e2)}`, "error");
          }
        }
      }
      detailCache.current.clear();
      await refreshAll();
    })();
  };

  const removeWorktree = async (wt: GitWorktreeDetail) => {
    if (!cwd || wt.isMain || wt.isCurrent) return;
    const folder = wt.path.split(/[\\/]/).filter(Boolean).pop() || wt.path;
    if (!confirm(`Remove worktree "${folder}" (${wt.branchLabel})?`)) return;
    try {
      await gitApi().gitWorktreeRemove(cwd, wt.path);
      toast(`Removed worktree "${folder}"`);
      await refreshAll();
    } catch (err) {
      const msg = errText(err);
      if (/contains modified|untracked/i.test(msg) && confirm(`Worktree "${folder}" has uncommitted changes. Force remove?`)) {
        try {
          await gitApi().gitWorktreeRemove(cwd, wt.path, true);
          toast(`Force-removed worktree "${folder}"`);
          await refreshAll();
        } catch (err2) {
          toast(`Failed to remove worktree: ${errText(err2)}`, "error");
        }
      } else {
        toast(`Failed to remove worktree: ${msg}`, "error");
      }
    }
  };

  const handleFetch = async () => {
    if (!cwd) return;
    setFetching(true);
    try {
      await gitApi().gitFetch(cwd);
      toast("Fetched all remotes");
      await refreshAll();
    } catch (err) {
      toast(`Fetch failed: ${errText(err)}`, "error");
    } finally {
      setFetching(false);
    }
  };

  const syncOp = async (kind: "pull" | "push") => {
    if (!cwd) return;
    setBusy(kind);
    try {
      await (kind === "pull" ? gitApi().gitPull(cwd) : gitApi().gitPush(cwd));
      toast(kind === "pull" ? "Pulled" : "Pushed");
      detailCache.current.clear();
      await refreshAll();
    } catch (err) {
      toast(`${kind === "pull" ? "Pull" : "Push"} failed: ${errText(err)}`, "error");
    } finally {
      setBusy(null);
    }
  };

  const openDialog = (d: NonNullable<Dialog>) => {
    setDialog(d);
    setDialogName(d.kind === "rename" ? d.name : "");
    setDialogCheckout(true);
  };

  const submitDialog = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = dialogName.trim();
    if (!cwd || !name || !dialog) return;
    const d = dialog;
    setDialog(null);
    if (d.kind === "new") {
      const targetPath = rootProjectPath ?? cwd;
      const ok = await run(() => gitApi().gitCreateBranchFrom(targetPath, name, d.from, dialogCheckout), `Created "${name}"${dialogCheckout ? " and checked it out" : ""}`, "Failed to create branch");
      if (ok && dialogCheckout) setManualBranch(name);
    } else if (name !== d.name) {
      await run(() => gitApi().gitRenameBranch(cwd, d.name, name), `Renamed "${d.name}" to "${name}"`, "Rename failed");
    }
  };

  const copy = (text: string) => {
    void navigator.clipboard.writeText(text).then(() => toast("Copied to clipboard", "info"));
  };

  /* --------------------------- derived values --------------------------- */

  const layout = useMemo(() => layoutGraph(graph), [graph]);
  const gWidth = graphWidth(layout.lanes);
  const remoteNames = useMemo(() => new Set(branches.filter((b) => b.isRemote).map((b) => b.name)), [branches]);
  const q = search.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!q) return null;
    const set = new Set<string>();
    for (const c of graph) {
      if (c.message.toLowerCase().includes(q) || c.author.toLowerCase().includes(q) || c.hash.startsWith(q) || c.refs.some((r) => r.toLowerCase().includes(q))) set.add(c.hash);
    }
    return set;
  }, [graph, q]);

  const classify = (ref: string): { kind: RefKind; label: string } => {
    if (ref.startsWith("HEAD -> ")) return { kind: "head", label: ref.slice(8) };
    if (ref === "HEAD") return { kind: "head", label: "HEAD" };
    if (ref.startsWith("tag: ")) return { kind: "tag", label: ref.slice(5) };
    if (remoteNames.has(ref)) return { kind: "remote", label: ref };
    return { kind: "local", label: ref };
  };

  const currentBranch = branches.find((b) => !b.isRemote && b.isCurrent);
  const currentLabel = status?.branch || currentBranch?.name || "HEAD";
  // `git checkout -b x <start>` needs a real revision; "detached HEAD" is only a display label.
  const headRef = currentBranch?.name ?? "HEAD";

  /* ------------------------------- menus -------------------------------- */

  const refMenu = (e: React.MouseEvent, target: RefTarget) => {
    e.preventDefault();
    if (target.kind === "worktree") {
      const wt = target.worktree;
      const folder = wt.path.split(/[\\/]/).filter(Boolean).pop() || wt.path;
      const items: MenuEntry[] = [];
      if (wt.branch) {
        items.push({ label: `Show only this in log`, icon: <GitBranch size={13} />, run: () => setScope(wt.branch!) });
        items.push({ label: `New branch from "${wt.branch}"…`, icon: <Plus size={13} />, run: () => openDialog({ kind: "new", from: wt.branch! }) });
      }
      items.push("sep", { label: "Copy worktree path", icon: <Copy size={13} />, run: () => copy(wt.path) });
      if (wt.branch) items.push({ label: "Copy branch name", icon: <Copy size={13} />, run: () => copy(wt.branch!) });
      if (!wt.isMain && !wt.isCurrent) {
        items.push("sep", { label: "Remove worktree", icon: <Trash2 size={13} />, danger: true, run: () => void removeWorktree(wt) });
      }
      setMenu({ x: e.clientX, y: e.clientY, title: `Worktree: ${folder}`, items });
      return;
    }
    const b = target.kind === "tag" ? null : target.branch;
    const name = target.kind === "tag" ? target.tag.name : target.branch.name;
    const items: MenuEntry[] = [];
    if (b && !b.isCurrent && !b.isWorktree) items.push({ label: b.isRemote ? "Checkout (create tracking branch)" : "Checkout", icon: <GitCommit size={13} />, run: () => checkout(b) });
    if (b && b.isWorktree && !b.isCurrent) items.push({ label: `Worktree: ${b.worktreePath}`, icon: <Layers size={13} />, run: () => copy(b.worktreePath!) });
    if (target.kind === "tag") items.push({ label: "Checkout (detached HEAD)", icon: <GitCommit size={13} />, run: () => checkoutRef(name, `tag "${name}"`) });
    items.push({ label: `New branch from "${name}"…`, icon: <Plus size={13} />, run: () => openDialog({ kind: "new", from: name }) });
    if (b && !b.isCurrent) items.push({ label: `Merge "${name}" into "${currentLabel}"`, icon: <GitMerge size={13} />, run: () => merge(b) });
    if (b && !b.isRemote) items.push({ label: "Rename…", icon: <Pencil size={13} />, run: () => openDialog({ kind: "rename", name }) });
    items.push("sep", { label: "Show only this in log", icon: <GitBranch size={13} />, run: () => setScope(name) }, { label: "Copy name", icon: <Copy size={13} />, run: () => copy(name) });
    if (b && !b.isRemote && !b.isCurrent && !b.isWorktree) items.push("sep", { label: "Delete", icon: <Trash2 size={13} />, danger: true, run: () => void deleteBranch(b) });
    setMenu({ x: e.clientX, y: e.clientY, title: name, items });
  };

  const tagMenu = (e: React.MouseEvent, tag: GitTag) => refMenu(e, { kind: "tag", tag });

  const commitMenu = (e: React.MouseEvent, c: GitGraphCommit) => {
    e.preventDefault();
    setSelected(c.hash);
    setMenu({
      x: e.clientX,
      y: e.clientY,
      title: `${c.shortHash} ${c.message}`,
      items: [
        { label: "New branch from here…", icon: <Plus size={13} />, run: () => openDialog({ kind: "new", from: c.hash }) },
        { label: "Checkout revision (detached HEAD)", icon: <GitCommit size={13} />, run: () => checkoutRef(c.hash, c.shortHash) },
        "sep",
        { label: "Copy hash", icon: <Copy size={13} />, run: () => copy(c.hash) },
        { label: "Copy subject", icon: <Tag size={13} />, run: () => copy(c.message) },
      ],
    });
  };

  /* ------------------------------ keyboard ------------------------------ */

  const onLogKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Escape") return;
    e.preventDefault();
    if (e.key === "Escape") return setSelected(null);
    const i = layout.rows.findIndex((r) => r.commit.hash === selected);
    const next = Math.max(0, Math.min(layout.rows.length - 1, i === -1 ? 0 : i + (e.key === "ArrowDown" ? 1 : -1)));
    const hash = layout.rows[next]?.commit.hash;
    if (hash) {
      setSelected(hash);
      (e.currentTarget as HTMLElement).querySelector<HTMLElement>(`[data-hash="${hash}"]`)?.scrollIntoView({ block: "nearest" });
    }
  };

  /* -------------------------------- render ------------------------------- */

  if (!project) return <div className="bw"><div className="bw__empty">No project active. Select or open a project first.</div></div>;
  if (status && !status.isRepo) return <div className="bw"><div className="bw__empty">Project directory is not a Git repository.</div></div>;

  const ahead = status?.ahead ?? 0;
  const behind = status?.behind ?? 0;

  return (
    <div className="bw">
      <div className="bw__bar">
        <div className="bw__title">
          <GitBranch size={15} color="var(--accent-base)" />
          <span>Git</span>
          <small>{currentLabel}</small>
        </div>
        <span className="bw__sep" />
        <label className="bw__search">
          <Search size={12} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search message, author, hash…" />
          {search && (
            <button type="button" className="bw__mini" onClick={() => setSearch("")} title="Clear">
              <X size={11} />
            </button>
          )}
        </label>
        {scope && (
          <span className="bw__chip" title={`Log shows only "${scope}"`}>
            <GitBranch size={11} />
            <span>{scope}</span>
            <button type="button" onClick={() => setScope(null)} title="Show all branches">
              <X size={11} />
            </button>
          </span>
        )}
        {matches && <small style={{ color: "var(--text-muted)", fontSize: 11 }}>{matches.size} match{matches.size === 1 ? "" : "es"}</small>}
        <div className="bw__spacer" />
        <button type="button" className="bw__ibtn bw__ibtn--primary" onClick={() => openDialog({ kind: "new", from: headRef })} title={`New branch from ${currentLabel}`}>
          <Plus size={13} /> New branch
        </button>
        <span className="bw__sep" />
        <button type="button" className={`bw__ibtn${behind ? " bw__ibtn--primary" : ""}`} disabled={!!busy || !status?.upstream} onClick={() => void syncOp("pull")} title={status?.upstream ? `Pull ${status.upstream}` : "No upstream configured"}>
          <ArrowDown size={13} className={busy === "pull" ? "spin" : ""} /> Pull{behind ? ` ${behind}` : ""}
        </button>
        <button type="button" className={`bw__ibtn${ahead ? " bw__ibtn--primary" : ""}`} disabled={!!busy} onClick={() => void syncOp("push")} title={status?.upstream ? `Push to ${status.upstream}` : "Push (publishes the branch)"}>
          <ArrowUp size={13} className={busy === "push" ? "spin" : ""} /> Push{ahead ? ` ${ahead}` : ""}
        </button>
        <button type="button" className="bw__ibtn" disabled={fetching} onClick={() => void handleFetch()} title="Fetch all remotes (prune)">
          <CloudDownload size={13} className={fetching ? "spin" : ""} /> Fetch
        </button>
        <button type="button" className="bw__ibtn" disabled={loading} onClick={() => void refreshAll()} title="Refresh">
          <RefreshCw size={13} className={loading ? "spin" : ""} />
        </button>
        <button type="button" className="bw__ibtn" onClick={() => host.panels.close("bottom")} title="Hide window">
          <X size={14} />
        </button>
      </div>

      <div className="bw__body">
        <div className="bw__col bw__col--tree" style={{ width: treeW }}>
          <BranchTree
            branches={branches}
            tags={tags}
            worktrees={worktrees}
            currentLabel={currentLabel}
            scope={scope}
            onScope={setScope}
            onCheckout={checkout}
            onDelete={(b) => void deleteBranch(b)}
            onMenu={refMenu}
            onTagMenu={tagMenu}
            onRemoveWorktree={removeWorktree}
          />
        </div>
        <div className="bw__vresize" onMouseDown={startTreeResize} />

        <div className="bw__col bw__col--log">
          <div className="bw__head">
            <span style={{ width: gWidth + 2, flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 240 }}>Commit</span>
            <span className="bw__author" style={{ width: 120, flexShrink: 0 }}>Author</span>
            <span className="bw__date" style={{ width: 90, flexShrink: 0 }}>Date</span>
          </div>
          <div className="bw__scroll" tabIndex={0} onKeyDown={onLogKey} style={{ outline: "none" }}>
            {graph.length === 0 ? (
              <div className="bw__empty">{loading ? "Loading history…" : "No commits found"}</div>
            ) : (
              <>
                {layout.rows.map((row) => {
                  const c = row.commit;
                  const isHead = c.refs.some((r) => r.startsWith("HEAD"));
                  const refs = c.refs.map(classify);
                  const dim = !!matches && !matches.has(c.hash);
                  return (
                    <div
                      key={c.hash}
                      data-hash={c.hash}
                      className={`bw__row${selected === c.hash ? " is-selected" : ""}${dim ? " is-dim" : ""}${isHead ? " is-head" : ""}`}
                      onClick={() => setSelected(c.hash)}
                      onContextMenu={(e) => commitMenu(e, c)}
                      title={`${c.hash}\n${c.author} · ${formatDate(c.date) || c.relativeDate}`}
                    >
                      <GraphCell row={row} width={gWidth} head={isHead} dim={dim} />
                      <div className="bw__main" style={{ flex: 1, minWidth: 240 }}>
                        {refs.slice(0, 4).map((r) => (
                          <RefChip key={`${r.kind}:${r.label}`} {...r} />
                        ))}
                        {refs.length > 4 && <span style={{ fontSize: 11, color: "var(--text-muted)", flexShrink: 0 }}>+{refs.length - 4}</span>}
                        <span className="bw__msg">{c.message}</span>
                        {c.parents.length > 1 && <span style={{ fontSize: 11, color: laneColor(row.col), flexShrink: 0 }}>merge</span>}
                      </div>
                      <span className="bw__author" style={{ width: 120, flexShrink: 0 }}>
                        <Avatar name={c.author} />
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{c.author}</span>
                      </span>
                      <span className="bw__date" style={{ width: 90, flexShrink: 0 }} title={c.relativeDate}>
                        {formatDate(c.date) || c.relativeDate}
                      </span>
                    </div>
                  );
                })}
                {graph.length >= limit && (
                  <div className="bw__more">
                    <button type="button" className="bw__ibtn bw__ibtn--primary" onClick={() => setLimit((l) => l + PAGE)}>
                      Load {PAGE} more commits
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {selected && (
          <>
            <div className="bw__vresize" onMouseDown={startDetailResize} />
            <div className="bw__col bw__col--detail" style={{ width: detailW }}>
              <CommitDetails detail={detail} loading={detailLoading} onCopy={copy} onClose={() => setSelected(null)} />
            </div>
          </>
        )}
      </div>

      <div className="bw__foot">
        <span>{graph.length} commit{graph.length === 1 ? "" : "s"}{graph.length >= limit ? "+" : ""}</span>
        <span>·</span>
        <span>{scope ? `branch ${scope}` : "all branches"}</span>
        <span>·</span>
        <span>
          {branches.filter((b) => !b.isRemote).length} local, {branches.filter((b) => b.isRemote).length} remote, {tags.length} tag{tags.length === 1 ? "" : "s"}
        </span>
        {status?.upstream && (
          <span style={{ marginLeft: "auto" }}>
            tracking {status.upstream}
            {ahead === 0 && behind === 0 ? " · up to date" : ""}
          </span>
        )}
      </div>

      {menu && <ContextMenu x={menu.x} y={menu.y} title={menu.title} items={menu.items} onClose={() => setMenu(null)} />}

      {dialog && (
        <div className="bw__scrim" onMouseDown={(e) => e.target === e.currentTarget && setDialog(null)}>
          <form className="bw__dialog" onSubmit={(e) => void submitDialog(e)} onKeyDown={(e) => e.key === "Escape" && setDialog(null)}>
            <h4>{dialog.kind === "new" ? "New branch" : `Rename "${dialog.name}"`}</h4>
            {dialog.kind === "new" && <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Starting from <code style={{ color: "var(--text-secondary)" }}>{dialog.from.length > 24 ? dialog.from.slice(0, 8) : dialog.from}</code></div>}
            <label>
              Branch name
              <input type="text" autoFocus value={dialogName} onChange={(e) => setDialogName(e.target.value)} placeholder={dialog.kind === "new" ? "feature/my-change" : "new-name"} />
            </label>
            {dialog.kind === "new" && (
              <label className="bw__check">
                <input type="checkbox" checked={dialogCheckout} onChange={(e) => setDialogCheckout(e.target.checked)} /> Checkout branch
              </label>
            )}
            <div className="bw__dialog-actions">
              <button type="button" className="bw__ibtn" onClick={() => setDialog(null)}>Cancel</button>
              <button type="submit" className="bw__ibtn bw__ibtn--primary" disabled={!dialogName.trim()}>
                {dialog.kind === "new" ? "Create" : "Rename"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
