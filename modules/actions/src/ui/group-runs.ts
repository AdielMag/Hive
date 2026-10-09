import type { ActionsRun, ActionsState } from "../shared.ts";

export interface RunGroup {
  label: string;
  runs: ActionsRun[];
}

function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Day heading for a timestamp: "Today", "Yesterday", or a short date. */
export function dayLabel(t: number, now: number): string {
  const diffDays = Math.round((startOfDay(now) - startOfDay(t)) / 86_400_000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  const sameYear = new Date(t).getFullYear() === new Date(now).getFullYear();
  return new Date(t).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) });
}

/** Groups runs (already newest-first) under day headings, derived from `createdAt` only so polling never reshuffles rows. */
export function groupRuns(runs: ActionsRun[], now = Date.now()): RunGroup[] {
  const groups: RunGroup[] = [];
  for (const run of runs) {
    const t = Date.parse(run.createdAt);
    const label = Number.isNaN(t) ? "Earlier" : dayLabel(t, now);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.runs.push(run);
    else groups.push({ label, runs: [run] });
  }
  return groups;
}

export type RunCounts = Record<ActionsState, number>;

export function countStates(runs: ActionsRun[]): RunCounts {
  const counts: RunCounts = { queued: 0, running: 0, success: 0, failure: 0, cancelled: 0, skipped: 0, neutral: 0 };
  for (const r of runs) counts[r.state]++;
  return counts;
}

/** Stable hue (0-359) from a string, for initial avatars. */
export function hueOf(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}
