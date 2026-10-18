/** Thin header above the transcript for sessions running in their own git worktree. */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, GitBranch, GitMerge, Loader2, RotateCcw, Sparkles, Trash2 } from "lucide-react";
import type { MergeConflictFile, WorktreeStatus } from "@hive/protocol";
import { useSessionStore, useSessionWorktree } from "../store/session-store.ts";
import { resolveFeatureModel, useFeatureModelStore } from "../store/feature-models-store.ts";
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
import { MergeConflictDialog } from "./MergeConflictDialog.tsx";
import "../styles/worktree.css";

const POLL_MS = 15_000;

type Notice = { kind: "ok" | "error"; text: string };

export const WorktreeBar: React.FC<{ tabId?: string }> = ({ tabId }) => {
  const activeTabId = useSessionStore((s) => s.activeTabId);
  const id = tabId ?? activeTabId;
  const wt = useSessionWorktree(id);
  const tab = useSessionStore((s) => s.tabs.find((t) => t.id === id));
  const sessionPath = tab?.sessionPath;

  const [status, setStatus] = useState<WorktreeStatus | null>(null);
  const [stagedCount, setStagedCount] = useState<number>(0);
  const [busy, setBusy] = useState<"merge" | "discard" | "autocommit" | "keep" | null>(null);
  const [merged, setMerged] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [conflicts, setConflicts] = useState<MergeConflictFile[] | null>(null);

  const pref = useFeatureModelStore((s) => s.config.gitCommit);
  const selectedModel = useSessionStore((s) => s.selectedModel);
  const defaultModel = useSessionStore((s) => s.defaultModel);
  const allModels = useSessionStore((s) => s.allCatalogModels);
  const defaultProvider = useSessionStore((s) => s.defaultProvider);
  const resolvedCommitModel = useMemo(
    () => resolveFeatureModel(pref, selectedModel, defaultModel, allModels, defaultProvider),
    [pref, selectedModel, defaultModel, allModels, defaultProvider],
  );

  const wtRef = useRef(wt);
  wtRef.current = wt;
  const path = wt?.worktreePath;

  const refresh = React.useCallback(async (): Promise<void> => {
    const cur = wtRef.current;
    if (!cur || document.visibilityState === "hidden") return;
    try {
      const [nextWt, gitStatus] = await Promise.all([
        window.studio.worktreeStatus(cur),
        window.studio.modules
          .invoke("git", "status", cur.worktreePath)
          .catch(() => null) as Promise<{ staged?: unknown[] } | null>,
      ]);
      if (wtRef.current?.worktreePath === cur.worktreePath) {
        setStatus(nextWt);
        setStagedCount(Array.isArray(gitStatus?.staged) ? gitStatus.staged.length : 0);
      }
    } catch {
      // keep the last known status
    }
  }, []);

  // Poll while this view is mounted (only the visible tab of a pane is) and the window is visible.
  useEffect(() => {
    setStatus(null);
    setStagedCount(0);
    setNotice(null);
    setMerged(null);
    setConflicts(null);
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

  const canAutoCommit = stagedCount > 0 || (status?.dirty ?? 0) > 0;

  const onAutoCommit = async () => {
    if (!canAutoCommit || busy !== null) return;
    setBusy("autocommit");
    setNotice(null);
    try {
      // Auto-stage everything unstaged/untracked (skip the app-managed node_modules link).
      const gs = (await window.studio.modules.invoke("git", "status", wt.worktreePath)) as {
        unstaged?: { path: string }[];
        untracked?: { path: string }[];
      };
      const toStage = [...(gs.unstaged ?? []), ...(gs.untracked ?? [])]
        .map((f) => f.path)
        .filter((p) => !/^node_modules\/?$/.test(p));
      for (const file of new Set(toStage)) {
        await window.studio.modules.invoke("git", "stage", wt.worktreePath, file);
      }
      const generated = (await window.studio.modules.invoke(
        "git",
        "generateCommitMessage",
        wt.worktreePath,
        resolvedCommitModel.id || undefined,
      )) as string;
      await window.studio.modules.invoke("git", "commit", wt.worktreePath, generated.trim());
      const firstLine = generated.trim().split("\n")[0] ?? "Changes committed";
      toast({ kind: "success", message: `Committed: ${firstLine}` });
      setNotice({ kind: "ok", text: `Committed: ${firstLine}` });
      void refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ kind: "error", message: `Auto commit failed: ${msg}` });
      setNotice({ kind: "error", text: `Auto commit failed: ${msg}` });
    } finally {
      setBusy(null);
    }
  };

  const openConflicts = async () => {
    const started = await window.studio.worktreeConflictsStart(wt);
    if (started.ok) setConflicts(started.files);
    else setNotice({ kind: "error", text: started.error });
  };

  const onConflictsClosed = (outcome: "merged" | "aborted") => {
    setConflicts(null);
    if (outcome === "merged") {
      setMerged(`Conflicts resolved and merged into ${wt.baseBranch}.`);
      toast({ kind: "success", message: `Merged ${wt.branch} into ${wt.baseBranch}` });
    } else {
      setNotice({ kind: "error", text: "Merge aborted. Nothing was changed." });
    }
    void refresh();
  };

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
      if (!res.ok && res.reason === "conflict") {
        setNotice({ kind: "error", text: mergeFailureMessage(res) });
        const pick = await askChoice({
          title: "Merge conflicts",
          body: [
            `${res.conflicts?.length ?? "Some"} file(s) conflict between ${wt.branch} and ${wt.baseBranch}. Nothing has been changed yet.`,
            "Review each conflict side by side and fix them yourself or let the AI merge them.",
          ],
          choices: [
            { id: "later", label: "Not now" },
            { id: "resolve", label: "Resolve conflicts", tone: "primary" },
          ],
        });
        if (pick === "resolve") await openConflicts();
        return;
      }
      // Merged: the bar switches to a "finished" state until the worktree is deleted or the user keeps going.
      if (res.ok) setMerged(mergeSuccessMessage(res, wt.baseBranch));
      else setNotice({ kind: "error", text: mergeFailureMessage(res) });
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
      void refresh();
    }
  };

  /** Keep working in this session: drop the merged worktree, then reopen the session so it gets a fresh one. */
  const onKeepGoing = async () => {
    if (!sessionPath || !tab) {
      toast({ kind: "warning", message: "The session isn't ready yet. Try again in a moment." });
      return;
    }
    let latest = status;
    try {
      latest = await window.studio.worktreeStatus(wt);
    } catch {}
    const force = discardNeedsForce(latest);
    if (force) {
      const pick = await askChoice({
        title: "Uncommitted changes will be lost",
        body: ["The old worktree has changes that were not part of the merge. Starting a fresh worktree deletes them permanently."],
        choices: [
          { id: "cancel", label: "Cancel" },
          { id: "go", label: "Delete and keep going", tone: "danger" },
        ],
      });
      if (pick !== "go") return;
    }
    const { projectId, title } = tab;
    setBusy("keep");
    try {
      if (await removeSessionWorktree(sessionPath, wt, force)) {
        await useSessionStore.getState().openSessionTab(sessionPath, projectId, title);
      }
    } finally {
      setBusy(null);
    }
  };

  const onDiscard = async () => {
    if (!sessionPath) {
      toast({ kind: "warning", message: "The session isn't ready yet. Try again in a moment." });
      return;
    }
    const first = merged ? "discard" : await askChoice({
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

  if (merged && !missing) {
    return (
      <div className="wt-bar wt-bar--merged" role="status">
        <GitMerge size={14} className="wt-bar__merged-icon" />
        <div className="wt-bar__merged-text">
          <strong>{merged}</strong>
          <span>
            This worktree is finished and stays until you delete it. Delete it, or keep going in a fresh worktree.
          </span>
        </div>
        <div className="wt-bar__actions">
          <button
            className="ui-btn ui-btn--ghost ui-btn--sm wt-bar__btn--discard"
            onClick={() => void onDiscard()}
            disabled={busy !== null}
            title="Delete the worktree and branch, and archive the session"
          >
            {busy === "discard" ? <Loader2 size={12} className="spin" /> : <Trash2 size={12} />} Delete worktree
          </button>
          <button
            className="ui-btn ui-btn--sm wt-bar__btn--merge"
            onClick={() => void onKeepGoing()}
            disabled={busy !== null}
            title="Delete this worktree and continue this session in a new one"
          >
            {busy === "keep" ? <Loader2 size={12} className="spin" /> : <RotateCcw size={12} />} Keep going
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`wt-bar${missing ? " is-missing" : ""}`} title={worktreeTooltipLines(wt).join("\n")}>
      <div className="wt-bar__branch-pill">
        <GitBranch size={13} className="wt-bar__branch-icon" />
        <span className="wt-bar__branch-name">{wt.branch}</span>
        <span className="wt-bar__arrow">{"\u2190"}</span>
        <span className="wt-bar__base-name">{wt.baseBranch}</span>
      </div>

      {missing ? (
        <span className="wt-bar__badge is-missing">worktree missing</span>
      ) : (
        <div className="wt-bar__badges">
          {status && status.ahead > 0 && <span className="wt-bar__badge is-ahead">+{status.ahead} ahead</span>}
          {status && status.behind > 0 && <span className="wt-bar__badge is-behind">{status.behind} behind</span>}
          {stagedCount > 0 && <span className="wt-bar__badge is-staged">{stagedCount} staged</span>}
          {status && status.dirty > 0 && (
            <span className="wt-bar__badge is-dirty">{status.dirty} uncommitted</span>
          )}
          {status && parts.length === 0 && stagedCount === 0 && (
            <span className="wt-bar__badge is-clean">
              <Check size={11} /> clean
            </span>
          )}
        </div>
      )}

      {notice ? (
        <span className={`wt-bar__msg is-${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"} title={notice.text}>
          {notice.text}
        </span>
      ) : (
        <span className="wt-bar__spacer" />
      )}

      <div className="wt-bar__actions">
        <button
          className="ui-btn ui-btn--ghost ui-btn--sm wt-bar__btn--discard"
          onClick={() => void onDiscard()}
          disabled={busy !== null}
          title="Delete the worktree and its branch"
        >
          {busy === "discard" ? <Loader2 size={12} className="spin" /> : <Trash2 size={12} />} Discard
        </button>
        {!missing && (
          <button
            className="ui-btn ui-btn--sm wt-bar__btn--autocommit"
            onClick={() => void onAutoCommit()}
            disabled={busy !== null || !canAutoCommit}
            title={
              !canAutoCommit
                ? "No changes to commit"
                : `Stage all changes, generate AI commit message with ${resolvedCommitModel.name || "AI"} and commit`
            }
          >
            {busy === "autocommit" ? <Loader2 size={12} className="spin" /> : <Sparkles size={12} />}
            <span>Auto commit{status && status.dirty > 0 ? ` (${status.dirty})` : ""}</span>
          </button>
        )}
        {!missing && (
          <button
            className="ui-btn ui-btn--sm wt-bar__btn--merge"
            onClick={() => void onMerge()}
            disabled={busy !== null || !status || status.ahead === 0}
            title={status && status.ahead === 0 ? "Nothing to merge" : `Merge into ${wt.baseBranch}`}
          >
            {busy === "merge" ? <Loader2 size={12} className="spin" /> : <GitMerge size={12} />} Merge
          </button>
        )}
      </div>
      {conflicts && (
        <MergeConflictDialog
          worktree={wt}
          files={conflicts}
          model={resolvedCommitModel.id || undefined}
          modelName={resolvedCommitModel.name}
          onClose={onConflictsClosed}
        />
      )}
    </div>
  );
};
