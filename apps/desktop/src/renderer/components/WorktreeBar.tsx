/** Thin header above the transcript for sessions running in their own git worktree. */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, GitBranch, GitMerge, Loader2, Sparkles, Trash2 } from "lucide-react";
import type { WorktreeStatus } from "@hive/protocol";
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
import "../styles/worktree.css";

const POLL_MS = 15_000;

type Notice = { kind: "ok" | "error"; text: string };

export const WorktreeBar: React.FC<{ tabId?: string }> = ({ tabId }) => {
  const activeTabId = useSessionStore((s) => s.activeTabId);
  const id = tabId ?? activeTabId;
  const wt = useSessionWorktree(id);
  const sessionPath = useSessionStore((s) => s.tabs.find((t) => t.id === id)?.sessionPath);

  const [status, setStatus] = useState<WorktreeStatus | null>(null);
  const [stagedCount, setStagedCount] = useState<number>(0);
  const [busy, setBusy] = useState<"merge" | "discard" | "autocommit" | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

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

  const onAutoCommit = async () => {
    if (stagedCount === 0 || busy !== null) return;
    setBusy("autocommit");
    setNotice(null);
    try {
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
        {!missing && (
          <button
            className="ui-btn ui-btn--sm wt-bar__btn--autocommit"
            onClick={() => void onAutoCommit()}
            disabled={busy !== null || stagedCount === 0}
            title={
              stagedCount === 0
                ? "Stage files first (via Git Stages panel) to auto-commit with AI"
                : `Generate AI commit message with ${resolvedCommitModel.name || "AI"} and commit ${stagedCount} staged file(s)`
            }
          >
            {busy === "autocommit" ? <Loader2 size={12} className="spin" /> : <Sparkles size={12} />}
            <span>Auto commit{stagedCount > 0 ? ` (${stagedCount})` : ""}</span>
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
        <button
          className="ui-btn ui-btn--ghost ui-btn--sm wt-bar__btn--discard"
          onClick={() => void onDiscard()}
          disabled={busy !== null}
          title="Delete the worktree and its branch"
        >
          {busy === "discard" ? <Loader2 size={12} className="spin" /> : <Trash2 size={12} />} Discard
        </button>
      </div>
    </div>
  );
};
