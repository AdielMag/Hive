/** Left column of the tool window: HEAD, Local / Remote branch trees and Tags (like Rider's Git branches tree). */
import React, { useMemo, useState } from "react";
import { Check, ChevronDown, ChevronRight, Cloud, Folder, GitBranch, Laptop, Search, Star, Tag, Trash2, GitCommit } from "lucide-react";
import type { GitBranchDetail, GitTag } from "@hive-module/git/shared";
import { SyncBadges } from "./bits.tsx";

export type RefTarget =
  | { kind: "local"; branch: GitBranchDetail }
  | { kind: "remote"; branch: GitBranchDetail }
  | { kind: "tag"; tag: GitTag };

interface TreeNode {
  key: string;
  label: string;
  children: TreeNode[];
  branch?: GitBranchDetail;
}

function buildTree(items: Array<{ path: string; branch: GitBranchDetail }>, prefix: string): TreeNode[] {
  const root: TreeNode = { key: prefix, label: "", children: [] };
  for (const { path, branch } of items) {
    const parts = path.split("/");
    let node = root;
    parts.forEach((part, i) => {
      const key = `${node.key}/${part}`;
      let child = node.children.find((c) => c.label === part && (i < parts.length - 1 ? !c.branch : !!c.branch || c.children.length === 0));
      if (!child) {
        child = { key, label: part, children: [] };
        node.children.push(child);
      }
      if (i === parts.length - 1) child.branch = branch;
      node = child;
    });
  }
  const sort = (n: TreeNode) => {
    // Folders first, then branches; current branch floats to the top of its level.
    n.children.sort((a, b) => {
      const ag = a.branch ? 1 : 0;
      const bg = b.branch ? 1 : 0;
      if (a.branch?.isCurrent !== b.branch?.isCurrent) return a.branch?.isCurrent ? -1 : 1;
      return ag - bg || a.label.localeCompare(b.label);
    });
    n.children.forEach(sort);
  };
  sort(root);
  return root.children;
}

const countLeaves = (n: TreeNode): number => (n.branch ? 1 : 0) + n.children.reduce((s, c) => s + countLeaves(c), 0);

export const BranchTree: React.FC<{
  branches: GitBranchDetail[];
  tags: GitTag[];
  currentLabel: string;
  scope: string | null;
  onScope(ref: string | null): void;
  onCheckout(b: GitBranchDetail): void;
  onDelete(b: GitBranchDetail): void;
  onMenu(e: React.MouseEvent, target: RefTarget): void;
  onTagMenu(e: React.MouseEvent, tag: GitTag): void;
}> = ({ branches, tags, currentLabel, scope, onScope, onCheckout, onDelete, onMenu, onTagMenu }) => {
  const [filter, setFilter] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ tags: true });
  const toggle = (k: string) => setCollapsed((c) => ({ ...c, [k]: !c[k] }));
  const q = filter.trim().toLowerCase();
  const open = (k: string) => !!q || !collapsed[k];

  const local = useMemo(
    () => buildTree(branches.filter((b) => !b.isRemote && b.name.toLowerCase().includes(q)).map((b) => ({ path: b.name, branch: b })), "local"),
    [branches, q],
  );
  const remotes = useMemo(() => {
    const byRemote = new Map<string, GitBranchDetail[]>();
    for (const b of branches) {
      if (!b.isRemote || !b.name.toLowerCase().includes(q)) continue;
      const list = byRemote.get(b.remote!) ?? [];
      list.push(b);
      byRemote.set(b.remote!, list);
    }
    return [...byRemote.entries()].map(([remote, list]) => ({
      remote,
      nodes: buildTree(list.map((b) => ({ path: b.name.slice(remote.length + 1), branch: b })), `remote:${remote}`),
      count: list.length,
    }));
  }, [branches, q]);
  const shownTags = useMemo(() => tags.filter((t) => t.name.toLowerCase().includes(q)), [tags, q]);
  const localCount = local.reduce((s, n) => s + countLeaves(n), 0);
  const remoteCount = remotes.reduce((s, r) => s + r.count, 0);
  const current = branches.find((b) => !b.isRemote && b.isCurrent);

  const Chev = ({ isOpen }: { isOpen: boolean }) => (isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />);

  const renderNodes = (nodes: TreeNode[], depth: number, remote: boolean): React.ReactNode =>
    nodes.map((n) => {
      const pad = 8 + depth * 14;
      if (n.branch && n.children.length === 0) {
        const b = n.branch;
        const selected = scope === b.name;
        return (
          <div
            key={n.key}
            className={`bw__node${selected ? " is-scope" : ""}${b.isCurrent ? " is-current" : ""}`}
            style={{ paddingLeft: pad + 14 }}
            title={`${b.name}\n${b.hash} · ${b.subject}\n${b.relativeDate}${b.upstream ? `\nTracks ${b.upstream}` : ""}`}
            onClick={() => onScope(selected ? null : b.name)}
            onDoubleClick={() => onCheckout(b)}
            onContextMenu={(e) => onMenu(e, { kind: remote ? "remote" : "local", branch: b })}
          >
            {b.isCurrent ? (
              <Star size={12} color="var(--accent-base)" fill="var(--accent-base)" style={{ flexShrink: 0 }} />
            ) : remote ? (
              <Cloud size={12} color="#4f9cf9" style={{ flexShrink: 0 }} />
            ) : (
              <GitBranch size={12} color="#5fb865" style={{ flexShrink: 0 }} />
            )}
            <span className="bw__label">{n.label}</span>
            {!remote && !b.upstream && !b.isCurrent && <span className="bw__tag-pill" title="Not published to any remote">local</span>}
            {b.gone && <span className="bw__tag-pill bw__tag-pill--danger" title="Remote branch was deleted">gone</span>}
            <SyncBadges ahead={b.ahead} behind={b.behind} hideOnHover />
            <span className="bw__actions">
              {!b.isCurrent && (
                <button type="button" className="bw__mini" title={remote ? "Checkout (track)" : "Checkout"} onClick={(e) => { e.stopPropagation(); onCheckout(b); }}>
                  <GitCommit size={12} />
                </button>
              )}
              {!remote && !b.isCurrent && (
                <button type="button" className="bw__mini" title={`Delete ${b.name}`} onClick={(e) => { e.stopPropagation(); onDelete(b); }}>
                  <Trash2 size={12} />
                </button>
              )}
            </span>
          </div>
        );
      }
      const isOpen = open(n.key);
      return (
        <React.Fragment key={n.key}>
          <div className="bw__node is-group" style={{ paddingLeft: pad }} onClick={() => toggle(n.key)}>
            <Chev isOpen={isOpen} />
            <Folder size={12} style={{ flexShrink: 0 }} />
            <span className="bw__label">{n.label}</span>
            <span className="bw__count">{countLeaves(n)}</span>
          </div>
          {isOpen && renderNodes(n.children, depth + 1, remote)}
        </React.Fragment>
      );
    });

  return (
    <>
      <label className="bw__filter">
        <Search size={12} />
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter branches & tags" />
      </label>
      <div className="bw__scroll" style={{ paddingBottom: 8 }}>
        <div className={`bw__node${scope === null ? " is-scope" : ""}`} style={{ paddingLeft: 8, height: 28 }} onClick={() => onScope(null)} title="Show commits from all branches">
          <Check size={12} style={{ visibility: scope === null ? "visible" : "hidden", flexShrink: 0 }} color="var(--accent-base)" />
          <span className="bw__label" style={{ fontWeight: 600 }}>All branches</span>
        </div>
        {current && (
          <div
            className={`bw__node is-current${scope === current.name ? " is-scope" : ""}`}
            style={{ paddingLeft: 8, height: 28 }}
            onClick={() => onScope(scope === current.name ? null : current.name)}
            onContextMenu={(e) => onMenu(e, { kind: "local", branch: current })}
            title={`HEAD → ${current.name}`}
          >
            <Star size={12} color="var(--accent-base)" fill="var(--accent-base)" style={{ flexShrink: 0 }} />
            <span className="bw__label">HEAD ({currentLabel})</span>
            <SyncBadges ahead={current.ahead} behind={current.behind} />
          </div>
        )}
        {!current && (
          <div className="bw__node is-current" style={{ paddingLeft: 8, height: 28 }} title="Detached HEAD">
            <Star size={12} color="var(--accent-base)" fill="var(--accent-base)" style={{ flexShrink: 0 }} />
            <span className="bw__label">HEAD ({currentLabel})</span>
          </div>
        )}

        <div className="bw__node is-section" style={{ paddingLeft: 8 }} onClick={() => toggle("local")}>
          <Chev isOpen={open("local")} />
          <Laptop size={12} />
          <span className="bw__label">Local</span>
          <span className="bw__count">{localCount}</span>
        </div>
        {open("local") && (localCount === 0 ? <div className="bw__empty">No local branches</div> : renderNodes(local, 0, false))}

        <div className="bw__node is-section" style={{ paddingLeft: 8 }} onClick={() => toggle("remote")}>
          <Chev isOpen={open("remote")} />
          <Cloud size={12} />
          <span className="bw__label">Remote</span>
          <span className="bw__count">{remoteCount}</span>
        </div>
        {open("remote") &&
          (remotes.length === 0 ? (
            <div className="bw__empty">No remote branches. Fetch to update.</div>
          ) : (
            remotes.map((r) => (
              <React.Fragment key={r.remote}>
                <div className="bw__node is-group" style={{ paddingLeft: 22 }} onClick={() => toggle(`remote:${r.remote}`)}>
                  <Chev isOpen={open(`remote:${r.remote}`)} />
                  <Cloud size={12} color="#4f9cf9" style={{ flexShrink: 0 }} />
                  <span className="bw__label">{r.remote}</span>
                  <span className="bw__count">{r.count}</span>
                </div>
                {open(`remote:${r.remote}`) && renderNodes(r.nodes, 2, true)}
              </React.Fragment>
            ))
          ))}

        <div className="bw__node is-section" style={{ paddingLeft: 8 }} onClick={() => toggle("tags")}>
          <Chev isOpen={open("tags")} />
          <Tag size={12} />
          <span className="bw__label">Tags</span>
          <span className="bw__count">{shownTags.length}</span>
        </div>
        {open("tags") &&
          (shownTags.length === 0 ? (
            <div className="bw__empty">No tags</div>
          ) : (
            shownTags.map((t) => (
              <div
                key={t.name}
                className={`bw__node${scope === t.name ? " is-scope" : ""}`}
                style={{ paddingLeft: 30 }}
                title={`${t.name}\n${t.hash} · ${t.subject}\n${t.relativeDate}`}
                onClick={() => onScope(scope === t.name ? null : t.name)}
                onContextMenu={(e) => onTagMenu(e, t)}
              >
                <Tag size={12} color="#e0a43a" style={{ flexShrink: 0 }} />
                <span className="bw__label">{t.name}</span>
                <span className="bw__count">{t.relativeDate}</span>
              </div>
            ))
          ))}
      </div>
    </>
  );
};
