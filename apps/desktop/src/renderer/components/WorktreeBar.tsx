/** Thin header above the transcript for sessions running in their own git worktree. */
import React, { useEffect, useRef, useState } from "react";
import { FolderOpen, GitBranch, GitMerge, Loader2, Trash2 } from "lucide-react";
import type { WorktreeStatus } from "@hive/protocol";
import { useSessionStore, useSessionWorktree } from "../store/session-store.ts";
import { removeSessionWorktree } from "../store/worktree-actions.ts";
import { toast } from "../modules/toast-store.ts";
import {
  discardNeedsForce,
  mergeFailureMessage,
  mergeSuccessMessage,
  worktreeStatusParts,
  worktreeTooltipLines,
} from "../lib/worktree.ts";
import { askChoice } from "./ChoiceDialog.tsx";
import "../styles/worktree.css";

const POLL_MS = 15_000;

type Notice = { kind: "ok" | "error"; text: string };

export const WorktreeBar: React.FC<{ tabId?: string }> = ({ tabId }) => {
  const activeTabId = useSessionStore((s) => s.activeTabId);
  const id = tabId ?? activeTabId;
  const wt = useSessionWorktree(id);
  const sessionPath = useSessionStore((s) => s.tabs.find((t) => t.id === id)?.sessionPath);
  const [status, setStatus] = useState<WorktreeStatus | null>(null);
  const [busy, setBusy] = useState<"merge" | "discard" | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const wtRef = useRef(wt);
  wtRef.current = wt;
  const path = wt?.worktreePath;

  const refresh = React.useCallback(async (): Promise<void> => {
    const cur = wtRef.current;
    if (!cur || document.visibilityState === "hidden") return;
    try {
      const next = await window.studio.worktreeStatus(cur);
      if (wtRef.current?.worktreePath === cur.worktreePath) setStatus(next);
    } catch {
      // keep the last known status
    }
  }, []);

  // Poll while this view is mounted (only the visible tab of a pane is) and the window is visible.
  useEffect(() => {
    setStatus(null);
    setNotice(null);
    if (!path) return;
    const run = () => void refresh();
    run();
    const timer = setInterval(run, POLL_MS);
    window.addEventListener("focus", run);
    document.addEventListener("visibilitychange", run);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", run);
      document.removeEventListener("visibilitychange", run);
    };
  }, [path, refresh]);

  if (!wt) return null;
  const missing = status?.exists === false;
  const parts = status && !missing ? worktreeStatusParts(status) : [];

  const onMerge = async () => {
    const dirty = status?.dirty ?? 0;
    const choice = await askChoice({
      title: `Merge ${wt.branch} into ${wt.baseBranch}?`,
      body: [
        `This merges the session branch into ${wt.baseBranch} in the main tree. The main tree must have that branch checked out and no uncommitted changes.`,
        ...(dirty > 0 ? [`${dirty} uncommitted file(s) in the worktree are not part of the merge.`] : []),
      ],
      choices: [
        { id: "cancel", label: "Cancel" },
        { id: "merge", label: "Merge", tone: "primary" },
      ],
    });
    if (choice !== "merge") return;
    setBusy("merge");
    setNotice(null);
    try {
      const res = await window.studio.worktreeMerge(wt);
      setNotice(
        res.ok
          ? { kind: "ok", text: mergeSuccessMessage(res, wt.baseBranch) }
          : { kind: "error", text: mergeFailureMessage(res) },
      );
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
      void refresh();
    }
  };

  const onDiscard = async () => {
    if (!sessionPath) {
      toast({ kind: "warning", message: "The session isn't ready yet. Try again in a moment." });
      return;
    }
    const first = await askChoice({
      title: "Discard this worktree?",
      body: [
        `This closes the session, deletes the worktree folder and the branch ${wt.branch}, and archives the session.`,
      ],
      choices: [
        { id: "cancel", label: "Cancel" },
        { id: "discard", label: "Discard", tone: "danger" },
      ],
    });
    if (first !== "discard") return;
    // Fresh state: the cached one may be up to 15s old.
    let latest = status;
    try {
      latest = await window.studio.worktreeStatus(wt);
    } catch {}
    const force = discardNeedsForce(latest);
    if (force) {
      const lost = latest ? worktreeStatusParts(latest).filter((p) => !p.endsWith("behind")) : [];
      const second = await askChoice({
        title: "Discard unmerged work?",
        body: [
          `${lost.length ? `This worktree has ${lost.join(" and ")}. ` : "The worktree state couldn't be checked. "}Discarding deletes it permanently; it can't be undone.`,
        ],
        choices: [
          { id: "cancel", label: "Cancel" },
          { id: "discard", label: "Discard anyway", tone: "danger" },
        ],
      });
      if (second !== "discard") return;
    }
    setBusy("discard");
    try {
      if (await removeSessionWorktree(sessionPath, wt, force)) {
        await useSessionStore.getState().setSessionArchived(sessionPath, true);
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={`wt-bar${missing ? " is-missing" : ""}`} title={worktreeTooltipLines(wt).join("\n")}>
      <span className="wt-bar__branch">
        <GitBranch size={13} />
        <span className="wt-bar__branch-name">{wt.branch}</span>
      </span>
      <span className="wt-bar__base">{"\u2190"} {wt.baseBranch}</span>
      {missing ? (
        <span className="wt-bar__msg">worktree missing</span>
      ) : (
        <>
          {status && parts.length > 0 && (
            <span className="wt-bar__stats">
              {status.ahead > 0 && <span className="wt-bar__stat--ahead">{status.ahead} ahead</span>}
              {status.behind > 0 && <span>{status.behind} behind</span>}
              {status.dirty > 0 && <span className="wt-bar__stat--dirty">{status.dirty} uncommitted</span>}
            </span>
          )}
          {status && parts.length === 0 && <span className="wt-bar__stats">clean</span>}
        </>
      )}
      {notice ? (
        <span className={`wt-bar__msg is-${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"} title={notice.text}>
          {notice.text}
        </span>
      ) : (
        <span className="wt-bar__spacer" />
      )}
      <span className="wt-bar__actions">
        {!missing && (
          <button
            className="ui-btn ui-btn--ghost ui-btn--sm"
            onClick={() => void window.studio.showItemInFolder(wt.worktreePath)}
            title="Open worktree folder"
          >
            <FolderOpen size={12} /> Open folder
          </button>
        )}
        {!missing && (
          <button
            className="ui-btn ui-btn--sm"
            onClick={() => void onMerge()}
            disabled={busy !== null || !status || status.ahead === 0}
            title={status && status.ahead === 0 ? "Nothing to merge" : `Merge into ${wt.baseBranch}`}
          >
            {busy === "merge" ? <Loader2 size={12} className="spin" /> : <GitMerge size={12} />} Merge
          </button>
        )}
        <button
          className="ui-btn ui-btn--ghost ui-btn--sm"
          onClick={() => void onDiscard()}
          disabled={busy !== null}
          title="Delete the worktree and its branch"
        >
          {busy === "discard" ? <Loader2 size={12} className="spin" /> : <Trash2 size={12} />} Discard
        </button>
      </span>
    </div>
  );
};
