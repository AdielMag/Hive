import { formatAgo, formatElapsed } from "@hive/module-sdk/format";
import type { ActionsRun, ActionsState } from "../shared.ts";

export const STATE_LABEL: Record<ActionsState, string> = {
  queued: "Queued",
  running: "In progress",
  success: "Success",
  failure: "Failed",
  cancelled: "Cancelled",
  skipped: "Skipped",
  neutral: "Neutral",
};

/** Duration text: live elapsed while running, total for finished, null while queued. */
export function durationLabel(
  state: ActionsState,
  startedAt: string | undefined,
  endedAt: string | undefined,
  now = Date.now(),
): string | null {
  if (!startedAt || state === "queued") return null;
  const start = Date.parse(startedAt);
  if (Number.isNaN(start)) return null;
  const end = state === "running" ? now : endedAt ? Date.parse(endedAt) : NaN;
  if (Number.isNaN(end)) return null;
  return formatElapsed(Math.max(0, end - start));
}

export function runDuration(run: ActionsRun, now = Date.now()): string | null {
  return durationLabel(run.state, run.startedAt, run.updatedAt, now);
}

export function runAgo(run: ActionsRun, now = Date.now()): string {
  const t = Date.parse(run.createdAt);
  return Number.isNaN(t) ? "" : formatAgo(t, now);
}
