import React, { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  Cloud,
  CloudDownload,
  GitBranch,
  GitCommit,
  Laptop,
  Plus,
  RefreshCw,
  Search,
  Tag,
  Trash2,
} from "lucide-react";
import type { ModuleHost } from "@hive/module-sdk/renderer";
import { GitCommands, type GitBranchDetail, type GitGraphCommit } from "@hive-module/git/shared";
import { gitApi } from "./branches-host.ts";

/* ------------------------------------------------------------------ */
/* Graph layout (lane assignment, same idea as VS Code / JetBrains)    */
/* ------------------------------------------------------------------ */

const LANE_COLORS = ["#58a6ff", "#3fb950", "#d29922", "#bc8cff", "#f778ba", "#39c5cf", "#ff7b72", "#a5d6ff"];
const LANE_W = 14;
const ROW_H = 44;
const MAX_LANES = 8;

interface GraphSeg {
  from: number; // column at row top (or commit column when fromMid)
  to: number; // column at row bottom (or commit column when !toBottom)
  fromMid: boolean;
  toMid: boolean;
  color: number;
}
interface GraphRow {
  commit: GitGraphCommit;
  col: number;
  segs: GraphSeg[];
}

function layoutGraph(commits: GitGraphCommit[]): { rows: GraphRow[]; lanes: number } {
  let lanes: Array<string | null> = [];
  const rows: GraphRow[] = [];
  let maxLanes = 1;

  for (const commit of commits) {
    const before = lanes.slice();
    let col = before.indexOf(commit.hash);
    if (col === -1) {
      col = before.indexOf(null);
      if (col === -1) col = before.length;
      before[col] = commit.hash; // branch tip not yet seen as a parent
    }
    const segs: GraphSeg[] = [];
    const after = before.slice();

    // Lanes that converge on this commit end here.
    for (let i = 0; i < before.length; i++) {
      const h = before[i];
      if (!h) continue;
      if (h === commit.hash) {
        // tips newly inserted have no incoming line
        if (lanes[i] === commit.hash) segs.push({ from: i, to: col, fromMid: false, toMid: true, color: i });
        after[i] = null;
      } else {
        segs.push({ from: i, to: i, fromMid: false, toMid: false, color: i });
      }
    }

    const [first, ...rest] = commit.parents;
    if (first) {
      const existing = after.indexOf(first);
      if (existing !== -1 && existing !== col) {
        segs.push({ from: col, to: existing, fromMid: true, toMid: false, color: existing });
      } else {
        after[col] = first;
        segs.push({ from: col, to: col, fromMid: true, toMid: false, color: col });
      }
    }
    for (const p of rest) {
      let target = after.indexOf(p);
      if (target === -1) {
        target = after.indexOf(null);
        if (target === -1) target = after.length;
        after[target] = p;
      }
      segs.push({ from: col, to: target, fromMid: true, toMid: false, color: target });
    }

    while (after.length && after[after.length - 1] === null) after.pop();
    maxLanes = Math.max(maxLanes, before.length, after.length);
    rows.push({ commit, col, segs });
    lanes = after;
  }
  return { rows, lanes: Math.min(maxLanes, MAX_LANES) };
}

const laneX = (c: number) => Math.min(c, MAX_LANES - 1) * LANE_W + LANE_W / 2 + 2;
const laneColor = (c: number) => LANE_COLORS[c % LANE_COLORS.length]!;

const GraphCell: React.FC<{ row: GraphRow; width: number; head: boolean }> = ({ row, width, head }) => {
  const mid = ROW_H / 2;
  return (
    <svg width={width} height={ROW_H} style={{ flexShrink: 0, display: "block" }}>
      {row.segs.map((s, i) => {
        const x1 = laneX(s.from);
        const x2 = laneX(s.to);
        const y1 = s.fromMid ? mid : 0;
        const y2 = s.toMid ? mid : ROW_H;
        const d =
          x1 === x2
            ? `M${x1} ${y1} L${x2} ${y2}`
            : `M${x1} ${y1} C${x1} ${(y1 + y2) / 2} ${x2} ${(y1 + y2) / 2} ${x2} ${y2}`;
        return <path key={i} d={d} stroke={laneColor(s.color)} strokeWidth={1.8} fill="none" strokeLinecap="round" />;
      })}
      <circle
        cx={laneX(row.col)}
        cy={mid}
        r={head ? 5 : 4}
        fill={head ? "var(--bg-app)" : laneColor(row.col)}
        stroke={laneColor(row.col)}
        strokeWidth={head ? 2.5 : 0}
      />
    </svg>
  );
};

/* ------------------------------------------------------------------ */
/* Small UI pieces                                                     */
/* ------------------------------------------------------------------ */

const iconBtn: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "var(--text-muted)",
  cursor: "pointer",
  padding: 3,
  display: "flex",
  borderRadius: 4,
};

const SyncBadge: React.FC<{ ahead: number; behind: number }> = ({ ahead, behind }) => {
  if (!ahead && !behind) return null;
  return (
    <span style={{ display: "inline-flex", gap: 4, fontSize: 10, fontFamily: "var(--font-mono)", flexShrink: 0 }}>
      {ahead > 0 && (
        <span title={`${ahead} commit(s) to push`} style={{ display: "inline-flex", alignItems: "center", color: "var(--success)" }}>
          <ArrowUp size={10} />
          {ahead}
        </span>
      )}
      {behind > 0 && (
        <span title={`${behind} commit(s) to pull`} style={{ display: "inline-flex", alignItems: "center", color: "#d29922" }}>
          <ArrowDown size={10} />
          {behind}
        </span>
      )}
    </span>
  );
};

const Chip: React.FC<{ kind: "local" | "remote" | "tag" | "head"; label: string }> = ({ kind, label }) => {
  const palette = {
    head: { bg: "var(--accent-base)", fg: "var(--accent-contrast)", icon: <GitBranch size={9} /> },
    local: { bg: "rgba(63,185,80,0.16)", fg: "var(--success)", icon: <Laptop size={9} /> },
    remote: { bg: "rgba(88,166,255,0.16)", fg: "#58a6ff", icon: <Cloud size={9} /> },
    tag: { bg: "rgba(210,153,34,0.16)", fg: "#d29922", icon: <Tag size={9} /> },
  }[kind];
  return (
    <span
      title={label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        padding: "0 5px",
        height: 15,
        borderRadius: 8,
        background: palette.bg,
        color: palette.fg,
        fontSize: 9.5,
        fontWeight: 600,
        fontFamily: "var(--font-mono)",
        maxWidth: 140,
        flexShrink: 0,
      }}
    >
      {palette.icon}
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
    </span>
  );
};

const SectionHeader: React.FC<{
  open: boolean;
  onToggle: () => void;
  icon: React.ReactNode;
  label: string;
  count: number;
  indent?: number;
}> = ({ open, onToggle, icon, label, count, indent = 0 }) => (
  <button
    type="button"
    onClick={onToggle}
    style={{
      display: "flex",
      alignItems: "center",
      gap: 5,
      width: "100%",
      padding: `5px 6px 5px ${6 + indent}px`,
      background: "transparent",
      border: "none",
      color: "var(--text-secondary)",
      fontSize: 10.5,
      fontWeight: 700,
      letterSpacing: "0.04em",
      textTransform: "uppercase",
      cursor: "pointer",
    }}
  >
    {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
    {icon}
    <span>{label}</span>
    <span style={{ marginLeft: "auto", fontWeight: 500, color: "var(--text-muted)" }}>{count}</span>
  </button>
);

const BranchRow: React.FC<{
  b: GitBranchDetail;
  indent?: number;
  displayName: string;
  onCheckout: () => void;
  onDelete?: () => void;
}> = ({ b, indent = 0, displayName, onCheckout, onDelete }) => {
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={onCheckout}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={b.isCurrent ? "Current branch" : `Checkout ${b.name}`}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 2,
        padding: `5px 8px 5px ${8 + indent}px`,
        borderRadius: 5,
        cursor: b.isCurrent ? "default" : "pointer",
        background: b.isCurrent ? "rgba(var(--accent-rgb), 0.12)" : hover ? "var(--bg-card-hover)" : "transparent",
        borderLeft: `2px solid ${b.isCurrent ? "var(--accent-base)" : "transparent"}`,
        marginBottom: 1,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
        {b.isCurrent ? (
          <Check size={12} color="var(--accent-base)" style={{ flexShrink: 0 }} />
        ) : b.isRemote ? (
          <Cloud size={12} color="#58a6ff" style={{ flexShrink: 0 }} />
        ) : (
          <GitBranch size={12} color="var(--text-muted)" style={{ flexShrink: 0 }} />
        )}
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontWeight: b.isCurrent ? 700 : 500,
            color: b.isCurrent ? "var(--accent-base)" : "var(--text-primary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            minWidth: 0,
            flex: 1,
          }}
        >
          {displayName}
        </span>
        <SyncBadge ahead={b.ahead} behind={b.behind} />
        {!b.isRemote && !b.upstream && (
          <span title="Not published to any remote" style={{ fontSize: 9, color: "var(--text-muted)", border: "1px solid var(--border-subtle)", borderRadius: 8, padding: "0 5px", flexShrink: 0 }}>
            local only
          </span>
        )}
        {b.gone && (
          <span title="Remote branch was deleted" style={{ fontSize: 9, color: "var(--danger)", border: "1px solid var(--danger)", borderRadius: 8, padding: "0 5px", flexShrink: 0 }}>
            gone
          </span>
        )}
        {hover && (
          <span style={{ display: "flex", flexShrink: 0 }}>
            {!b.isCurrent && (
              <button type="button" title={b.isRemote ? "Checkout (track)" : "Checkout"} style={iconBtn} onClick={(e) => { e.stopPropagation(); onCheckout(); }}>
                <GitCommit size={12} />
              </button>
            )}
            {onDelete && !b.isCurrent && (
              <button type="button" title={`Delete ${b.name}`} style={iconBtn} onClick={(e) => { e.stopPropagation(); onDelete(); }}>
                <Trash2 size={12} />
              </button>
            )}
          </span>
        )}
      </div>
      <div style={{ display: "flex", gap: 6, paddingLeft: 18, fontSize: 10, color: "var(--text-muted)", minWidth: 0 }}>
        <span style={{ fontFamily: "var(--font-mono)", flexShrink: 0 }}>{b.hash}</span>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{b.subject}</span>
        <span style={{ flexShrink: 0 }}>{b.relativeDate}</span>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Panel                                                               */
/* ------------------------------------------------------------------ */

export const BranchesPanel: React.FC<{ host: ModuleHost }> = ({ host }) => {
  const { project: activeProject } = host.hooks.useActiveSession();
  const refreshRailStatus = () => void host.commands.run(GitCommands.refresh);

  const [status, setStatus] = useState<any>(null);
  const [branches, setBranches] = useState<GitBranchDetail[]>([]);
  const [graph, setGraph] = useState<GitGraphCommit[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"branches" | "graph">("branches");
  const [newBranchName, setNewBranchName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggle = (key: string) => setCollapsed((c) => ({ ...c, [key]: !c[key] }));
  const flash = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 2500);
  };

  const refreshAll = async () => {
    if (!activeProject?.path) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      const [repoStatus, details, commits] = await Promise.all([
        gitApi().getGitStatus(activeProject.path),
        gitApi().getGitBranchDetails(activeProject.path),
        gitApi().getGitGraph(activeProject.path, 150),
      ]);
      setStatus(repoStatus);
      setBranches(details);
      setGraph(commits);
      refreshRailStatus();
    } catch (err: any) {
      setErrorMessage(`Failed to read git repository: ${err.message || String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProject?.path]);

  const run = async (op: () => Promise<unknown>, okMsg: string, errPrefix: string) => {
    setLoading(true);
    setErrorMessage(null);
    try {
      await op();
      flash(okMsg);
      await refreshAll();
    } catch (err: any) {
      setErrorMessage(`${errPrefix}: ${err.stderr || err.message || String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleFetch = async () => {
    if (!activeProject) return;
    setFetching(true);
    setErrorMessage(null);
    try {
      await gitApi().gitFetch(activeProject.path);
      flash("Fetched all remotes");
      await refreshAll();
    } catch (err: any) {
      setErrorMessage(`Fetch failed: ${err.message || String(err)}`);
    } finally {
      setFetching(false);
    }
  };

  const handleCheckout = (b: GitBranchDetail) => {
    if (!activeProject || b.isCurrent) return;
    // For a remote branch, `git checkout <name>` creates a tracking branch automatically.
    const target = b.isRemote ? b.name.slice(b.name.indexOf("/") + 1) : b.name;
    void run(() => gitApi().gitCheckout(activeProject.path, target), `Checked out "${target}"`, "Checkout failed");
  };

  const handleCreateBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newBranchName.trim();
    if (!activeProject || !trimmed) return;
    await run(
      () => gitApi().gitCreateBranch(activeProject.path, trimmed),
      `Created and checked out "${trimmed}"`,
      "Failed to create branch",
    );
    setNewBranchName("");
    setIsCreating(false);
  };

  const handleDelete = (b: GitBranchDetail) => {
    if (!activeProject || b.isCurrent || b.isRemote) return;
    if (!confirm(`Delete local branch "${b.name}"?`)) return;
    void (async () => {
      setLoading(true);
      setErrorMessage(null);
      try {
        await gitApi().gitDeleteBranch(activeProject.path, b.name);
        flash(`Deleted "${b.name}"`);
      } catch (err: any) {
        const detail = String(err.stderr || err.message || err);
        if (/not fully merged/i.test(detail) && confirm(`"${b.name}" is not fully merged. Force delete and lose its unique commits?`)) {
          try {
            await gitApi().gitDeleteBranch(activeProject.path, b.name, true);
            flash(`Force-deleted "${b.name}"`);
          } catch (e2: any) {
            setErrorMessage(`Failed to delete branch: ${e2.message || String(e2)}`);
          }
        } else {
          setErrorMessage(`Failed to delete branch: ${detail}`);
        }
      } finally {
        setLoading(false);
        await refreshAll();
      }
    })();
  };

  const q = filter.trim().toLowerCase();
  const local = useMemo(() => branches.filter((b) => !b.isRemote && b.name.toLowerCase().includes(q)), [branches, q]);
  const remotesByName = useMemo(() => {
    const map = new Map<string, GitBranchDetail[]>();
    for (const b of branches) {
      if (!b.isRemote || !b.name.toLowerCase().includes(q)) continue;
      const list = map.get(b.remote!) ?? [];
      list.push(b);
      map.set(b.remote!, list);
    }
    return map;
  }, [branches, q]);
  const remoteCount = [...remotesByName.values()].reduce((n, l) => n + l.length, 0);
  const totalLocal = branches.filter((b) => !b.isRemote).length;
  const totalRemote = branches.filter((b) => b.isRemote).length;

  const layout = useMemo(() => layoutGraph(graph), [graph]);
  const remoteNames = useMemo(() => new Set(branches.filter((b) => b.isRemote).map((b) => b.name)), [branches]);
  const graphWidth = layout.lanes * LANE_W + 6;

  if (!activeProject) {
    return <div style={{ padding: 16, color: "var(--text-muted)", fontSize: 12, textAlign: "center" }}>No project active. Select or open a project first.</div>;
  }
  if (status && !status.isRepo) {
    return <div style={{ padding: 16, color: "var(--text-muted)", fontSize: 12, textAlign: "center" }}>Project directory is not a Git repository.</div>;
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "6px 12px",
    border: "none",
    background: "transparent",
    color: active ? "var(--accent-base)" : "var(--text-muted)",
    fontWeight: active ? 600 : 400,
    borderBottom: `2px solid ${active ? "var(--accent-base)" : "transparent"}`,
    cursor: "pointer",
    fontSize: 11,
  });

  const banner = (kind: "error" | "ok", text: string) => (
    <div
      style={{
        padding: "6px 12px",
        background: kind === "error" ? "rgba(229, 83, 75, 0.12)" : "rgba(63, 185, 80, 0.12)",
        borderBottom: `1px solid ${kind === "error" ? "rgba(229, 83, 75, 0.25)" : "rgba(63, 185, 80, 0.25)"}`,
        color: kind === "error" ? "var(--danger)" : "var(--success)",
        fontSize: 11,
        display: "flex",
        alignItems: "flex-start",
        gap: 6,
      }}
    >
      {kind === "error" ? <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} /> : <Check size={13} style={{ flexShrink: 0 }} />}
      <span style={{ wordBreak: "break-word" }}>{text}</span>
    </div>
  );

  const classifyRef = (ref: string): { kind: "local" | "remote" | "tag" | "head"; label: string } => {
    if (ref.startsWith("HEAD -> ")) return { kind: "head", label: ref.slice(8) };
    if (ref === "HEAD") return { kind: "head", label: "HEAD" };
    if (ref.startsWith("tag: ")) return { kind: "tag", label: ref.slice(5) };
    if (remoteNames.has(ref)) return { kind: "remote", label: ref };
    return { kind: "local", label: ref };
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-app)", fontSize: 12, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-card)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600 }}>
          <GitBranch size={15} color="var(--accent-base)" />
          <span>Branches</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button
            type="button"
            onClick={() => void host.commands.run("view.git")}
            title="Switch to Commits & Changes panel"
            style={{ display: "flex", alignItems: "center", gap: 4, background: "transparent", border: "1px solid var(--border-subtle)", borderRadius: 4, color: "var(--text-secondary)", padding: "2px 6px", fontSize: 10, cursor: "pointer" }}
          >
            <GitCommit size={11} />
            <span>Commits</span>
          </button>
          <button type="button" onClick={() => void handleFetch()} disabled={fetching || loading} title="Fetch all remotes (prune)" style={iconBtn}>
            <CloudDownload size={14} className={fetching ? "spin" : ""} />
          </button>
          <button type="button" onClick={() => void refreshAll()} disabled={loading} title="Refresh" style={iconBtn}>
            <RefreshCw size={13} className={loading ? "spin" : ""} />
          </button>
        </div>
      </div>

      {errorMessage && banner("error", errorMessage)}
      {successMessage && banner("ok", successMessage)}

      {/* Current branch */}
      <div style={{ margin: "8px 10px 4px", padding: "8px 10px", background: "var(--bg-elevated)", border: "1px solid var(--border-prominent)", borderRadius: 6, display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent-base)", boxShadow: "0 0 6px var(--accent-base)", flexShrink: 0 }} />
            <span style={{ fontWeight: 600, fontSize: 12.5, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "var(--font-mono)" }}>
              {status?.branch || "HEAD"}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setIsCreating(true)}
            style={{ display: "flex", alignItems: "center", gap: 4, background: "var(--accent-subtle)", border: "none", color: "var(--accent-base)", fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 4, cursor: "pointer", flexShrink: 0 }}
          >
            <Plus size={11} /> New
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10, color: "var(--text-muted)" }}>
          {status?.upstream ? (
            <>
              <Cloud size={11} color="#58a6ff" />
              <span style={{ fontFamily: "var(--font-mono)" }}>{status.upstream}</span>
              {status.ahead === 0 && status.behind === 0 ? <span style={{ color: "var(--success)" }}>up to date</span> : <SyncBadge ahead={status.ahead} behind={status.behind} />}
            </>
          ) : (
            <span>No upstream — not published</span>
          )}
        </div>
        {isCreating && (
          <form onSubmit={handleCreateBranch} style={{ display: "flex", gap: 4 }}>
            <input
              type="text"
              autoFocus
              value={newBranchName}
              onChange={(e) => setNewBranchName(e.target.value)}
              placeholder={`New branch from ${status?.branch || "HEAD"}...`}
              style={{ flex: 1, background: "var(--bg-input)", border: "1px solid var(--accent-base)", borderRadius: 4, padding: "3px 6px", fontSize: 11, color: "var(--text-primary)", outline: "none" }}
            />
            <button type="submit" disabled={!newBranchName.trim() || loading} style={{ background: "var(--accent-base)", color: "var(--accent-contrast)", border: "none", borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
              Create
            </button>
            <button type="button" onClick={() => { setIsCreating(false); setNewBranchName(""); }} style={{ background: "transparent", border: "none", color: "var(--text-muted)", fontSize: 11, cursor: "pointer", padding: "2px 6px" }}>
              Cancel
            </button>
          </form>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid var(--border-subtle)", padding: "0 10px", marginTop: 4, flexShrink: 0 }}>
        <button type="button" onClick={() => setActiveTab("branches")} style={tabStyle(activeTab === "branches")}>
          Branches ({totalLocal + totalRemote})
        </button>
        <button type="button" onClick={() => setActiveTab("graph")} style={tabStyle(activeTab === "graph")}>
          Graph ({graph.length})
        </button>
      </div>

      {activeTab === "branches" && (
        <div style={{ padding: "6px 10px", display: "flex", alignItems: "center", gap: 6, borderBottom: "1px solid var(--border-subtle)", flexShrink: 0 }}>
          <Search size={12} color="var(--text-muted)" />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter local & remote branches..."
            style={{ background: "transparent", border: "none", outline: "none", fontSize: 11, color: "var(--text-primary)", width: "100%" }}
          />
        </div>
      )}

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 6px" }}>
        {activeTab === "branches" ? (
          <>
            <SectionHeader open={!collapsed.local} onToggle={() => toggle("local")} icon={<Laptop size={12} />} label="Local" count={local.length} />
            {!collapsed.local &&
              (local.length === 0 ? (
                <div style={{ padding: "8px 12px", color: "var(--text-muted)", fontSize: 11 }}>No local branches{q ? ` matching "${filter}"` : ""}</div>
              ) : (
                local.map((b) => <BranchRow key={b.name} b={b} displayName={b.name} onCheckout={() => handleCheckout(b)} onDelete={() => handleDelete(b)} />)
              ))}

            <SectionHeader open={!collapsed.remote} onToggle={() => toggle("remote")} icon={<Cloud size={12} />} label="Remote" count={remoteCount} />
            {!collapsed.remote &&
              (remotesByName.size === 0 ? (
                <div style={{ padding: "8px 12px", color: "var(--text-muted)", fontSize: 11 }}>
                  {totalRemote === 0 ? "No remote branches. Add a remote, then press Fetch." : `No remote branches matching "${filter}"`}
                </div>
              ) : (
                [...remotesByName.entries()].map(([remote, list]) => (
                  <div key={remote}>
                    <SectionHeader open={!collapsed[`r:${remote}`]} onToggle={() => toggle(`r:${remote}`)} icon={<Cloud size={11} color="#58a6ff" />} label={remote} count={list.length} indent={14} />
                    {!collapsed[`r:${remote}`] &&
                      list.map((b) => <BranchRow key={b.name} b={b} indent={14} displayName={b.name.slice(remote.length + 1)} onCheckout={() => handleCheckout(b)} />)}
                  </div>
                ))
              ))}
          </>
        ) : graph.length === 0 ? (
          <div style={{ padding: "16px 12px", textAlign: "center", color: "var(--text-muted)", fontSize: 11 }}>No commit history found</div>
        ) : (
          <div>
            {layout.rows.map((row) => {
              const isHead = row.commit.refs.some((r) => r.startsWith("HEAD"));
              const refs = row.commit.refs.map(classifyRef);
              return (
                <div key={row.commit.hash} style={{ display: "flex", alignItems: "center", height: ROW_H, minWidth: 0 }} title={`${row.commit.hash}\n${row.commit.author} · ${row.commit.relativeDate}`}>
                  <GraphCell row={row} width={graphWidth} head={isHead} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1, paddingRight: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
                      {refs.slice(0, 3).map((r) => <Chip key={r.label} {...r} />)}
                      {refs.length > 3 && <span style={{ fontSize: 9, color: "var(--text-muted)" }}>+{refs.length - 3}</span>}
                      <span style={{ fontSize: 11.5, fontWeight: isHead ? 600 : 500, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
                        {row.commit.message}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 6, fontSize: 10, color: "var(--text-muted)", minWidth: 0 }}>
                      <span style={{ fontFamily: "var(--font-mono)", color: laneColor(row.col) }}>{row.commit.shortHash}</span>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.commit.author}</span>
                      <span style={{ flexShrink: 0 }}>· {row.commit.relativeDate}</span>
                      {row.commit.parents.length > 1 && <span style={{ flexShrink: 0 }}>· merge</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
