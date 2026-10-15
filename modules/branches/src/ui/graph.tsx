/** Commit-graph lane layout + SVG cell (same lane-assignment idea as JetBrains / VS Code). */
import React from "react";
import type { GitGraphCommit } from "@hive-module/git/shared";

export const LANE_COLORS = ["#4f9cf9", "#5fb865", "#e0a43a", "#b88cf2", "#ee74b0", "#3dc4d0", "#f0786e", "#9ec5fa"];
export const LANE_W = 14;
export const ROW_H = 26;
const MAX_LANES = 10;

export interface GraphSeg {
  from: number;
  to: number;
  fromMid: boolean;
  toMid: boolean;
  color: number;
}
export interface GraphRow {
  commit: GitGraphCommit;
  col: number;
  segs: GraphSeg[];
}

export function layoutGraph(commits: GitGraphCommit[]): { rows: GraphRow[]; lanes: number } {
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

    for (let i = 0; i < before.length; i++) {
      const h = before[i];
      if (!h) continue;
      if (h === commit.hash) {
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

export const laneX = (c: number) => Math.min(c, MAX_LANES - 1) * LANE_W + LANE_W / 2 + 4;
export const laneColor = (c: number) => LANE_COLORS[c % LANE_COLORS.length]!;
export const graphWidth = (lanes: number) => lanes * LANE_W + 10;

export const GraphCell: React.FC<{ row: GraphRow; width: number; head: boolean; dim?: boolean }> = React.memo(({ row, width, head, dim }) => {
  const mid = ROW_H / 2;
  return (
    <svg width={width} height={ROW_H} style={{ flexShrink: 0, display: "block", opacity: dim ? 0.35 : 1 }}>
      {row.segs.map((s, i) => {
        const x1 = laneX(s.from);
        const x2 = laneX(s.to);
        const y1 = s.fromMid ? mid : 0;
        const y2 = s.toMid ? mid : ROW_H;
        const d =
          x1 === x2
            ? `M${x1} ${y1} L${x2} ${y2}`
            : `M${x1} ${y1} C${x1} ${(y1 + y2) / 2} ${x2} ${(y1 + y2) / 2} ${x2} ${y2}`;
        return <path key={i} d={d} stroke={laneColor(s.color)} strokeWidth={1.7} fill="none" strokeLinecap="round" />;
      })}
      <circle
        cx={laneX(row.col)}
        cy={mid}
        r={head ? 5 : 3.8}
        fill={head ? "var(--bg-app)" : laneColor(row.col)}
        stroke={head ? laneColor(row.col) : "var(--bg-app)"}
        strokeWidth={head ? 2.4 : 1.2}
      />
    </svg>
  );
});
GraphCell.displayName = "GraphCell";
