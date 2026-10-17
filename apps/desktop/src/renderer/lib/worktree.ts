/** Pure helpers for session worktrees: labels, status text, archive/discard decisions. */
import type { SessionWorktree, WorktreeMergeResult, WorktreeStatus } from "@hive/protocol";

/** Compact `branch ← base` label shown in the sidebar chip and the session header. */
export function worktreeChipLabel(wt: Pick<SessionWorktree, "branch" | "baseBranch">): string {
  return `${wt.branch} \u2190 ${wt.baseBranch}`;
}

/**
 * Short label for a session branch (e.g. for sidebar session rows):
 * - strips a leading `hive/` prefix;
 * - strips a trailing `-<6 hex>` id suffix if present;
 * - middle-truncates with `…` to `max` chars.
 */
export function worktreeShortLabel(branch: string, max = 22): string {
  if (!branch) return "";
  let cleaned = branch.replace(/^hive\//, "");
  cleaned = cleaned.replace(/-[0-9a-fA-F]{6}$/, "");
  if (cleaned.length <= max) return cleaned;
  if (max <= 0) return "";
  if (max === 1) return "\u2026";
  const front = Math.ceil((max - 1) / 2);
  const back = max - 1 - front;
  return `${cleaned.slice(0, front)}\u2026${cleaned.slice(cleaned.length - back)}`;
}

/** Tooltip lines: full path, branch and base. */
export function worktreeTooltipLines(wt: SessionWorktree): string[] {
  return [`Worktree: ${wt.worktreePath}`, `Branch: ${wt.branch}`, `Base: ${wt.baseBranch}`];
}

/** Short status parts ("2 ahead", "1 behind", "3 uncommitted"); empty when the worktree is clean and in sync. */
export function worktreeStatusParts(status: Pick<WorktreeStatus, "ahead" | "behind" | "dirty">): string[] {
  const parts: string[] = [];
  if (status.ahead > 0) parts.push(`${status.ahead} ahead`);
  if (status.behind > 0) parts.push(`${status.behind} behind`);
  if (status.dirty > 0) parts.push(`${status.dirty} uncommitted`);
  return parts;
}

export type ArchiveDecision = "none" | "remove" | "ask";

/**
 * What archiving a worktree session should do with its worktree:
 * - none: the folder is already gone;
 * - remove: nothing to lose (no commits ahead, nothing uncommitted), remove silently;
 * - ask: unmerged work (or unknown state) so the user decides.
 */
export function archiveDecision(status: WorktreeStatus | null): ArchiveDecision {
  if (!status) return "ask";
  if (!status.exists) return "none";
  return status.ahead === 0 && status.dirty === 0 ? "remove" : "ask";
}

/** Discard needs an explicit second confirm (and `force`) when it would throw work away. */
export function discardNeedsForce(status: WorktreeStatus | null): boolean {
  if (!status) return true;
  return status.exists && (status.ahead > 0 || status.dirty > 0);
}

/** One-line, user-facing text for a failed merge. */
export function mergeFailureMessage(result: Extract<WorktreeMergeResult, { ok: false }>): string {
  switch (result.reason) {
    case "conflict": {
      const files = result.conflicts ?? [];
      const shown = files.slice(0, 5).join(", ");
      const more = files.length > 5 ? ` and ${files.length - 5} more` : "";
      return `Merge conflict${files.length ? ` in ${shown}${more}` : ""}. Nothing was changed; rebase or merge the base branch into the session branch first.`;
    }
    case "dirty-main":
      return "The main tree has uncommitted changes. Commit or stash them, then try again.";
    case "base-not-checked-out":
      return "The base branch isn't checked out in the main tree. Check it out there, then try again.";
    default:
      return result.error || "Merge failed.";
  }
}

/** One-line text for a successful merge. */
export function mergeSuccessMessage(result: Extract<WorktreeMergeResult, { ok: true }>, baseBranch: string): string {
  const base = result.alreadyUpToDate ? `Already up to date with ${baseBranch}.` : `Merged into ${baseBranch}.`;
  return result.uncommitted > 0 ? `${base} ${result.uncommitted} uncommitted file(s) were not merged.` : base;
}
