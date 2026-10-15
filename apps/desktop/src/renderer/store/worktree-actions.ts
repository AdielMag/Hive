/** Worktree lifecycle actions shared by the sidebar (archive) and the session header (discard). */
import type { SessionCatalogItem, SessionWorktree, WorktreeStatus } from "@hive/protocol";
import { askChoice } from "../components/ChoiceDialog.tsx";
import { sessionDisplayTitle } from "../lib/session-title.ts";
import { archiveDecision, worktreeStatusParts } from "../lib/worktree.ts";
import { toast } from "../modules/toast-store.ts";
import { useSessionStore } from "./session-store.ts";

async function statusOrNull(wt: SessionWorktree): Promise<WorktreeStatus | null> {
  try {
    return await window.studio.worktreeStatus(wt);
  } catch {
    return null;
  }
}

/** Stop and close every open tab of the session: a live Pi process holds its worktree folder open. */
export async function stopSessionTabs(sessionPath: string): Promise<void> {
  const s = useSessionStore.getState();
  for (const t of s.tabs.filter((x) => x.sessionPath === sessionPath)) {
    if (t.activeKey) await window.studio.stopSession(t.activeKey).catch(() => {});
    await s.closeTab(t.id);
  }
}

/** Remove a session's worktree (stopping its session first). Returns false (and toasts) on failure. */
export async function removeSessionWorktree(sessionPath: string, wt: SessionWorktree, force: boolean): Promise<boolean> {
  await stopSessionTabs(sessionPath);
  const res = await window.studio.worktreeRemove(wt, { force, deleteBranch: true });
  if (!res.ok) {
    toast({ kind: "error", message: `Couldn't remove worktree: ${res.error}` });
    return false;
  }
  return true;
}

/**
 * Archive a session. Its worktree is removed silently when nothing would be lost; otherwise the user picks
 * Keep / Discard / Cancel.
 */
export async function archiveSession(sess: SessionCatalogItem): Promise<void> {
  const { setSessionArchived } = useSessionStore.getState();
  const wt = sess.worktree;
  if (!wt) return setSessionArchived(sess.path, true);

  const status = await statusOrNull(wt);
  const decision = archiveDecision(status);
  if (decision === "none") return setSessionArchived(sess.path, true);
  if (decision === "remove") {
    if (await removeSessionWorktree(sess.path, wt, false)) return setSessionArchived(sess.path, true);
    return; // removal failed and was reported; leave the session as it is
  }

  const parts = status ? worktreeStatusParts(status) : [];
  const choice = await askChoice({
    title: "Archive session with unmerged work?",
    body: [
      `"${sessionDisplayTitle(sess) || "This session"}" has a worktree on ${wt.branch}${parts.length ? ` (${parts.join(", ")})` : ""}.`,
      "Keep leaves the worktree and branch on disk. Discard deletes them, including uncommitted changes and unmerged commits.",
    ],
    choices: [
      { id: "cancel", label: "Cancel" },
      { id: "discard", label: "Discard", tone: "danger" },
      { id: "keep", label: "Keep worktree", tone: "primary" },
    ],
  });
  if (choice === "keep") return setSessionArchived(sess.path, true);
  if (choice === "discard" && (await removeSessionWorktree(sess.path, wt, true))) {
    return setSessionArchived(sess.path, true);
  }
}
