/** Per-item picker for stale worktrees/branches found while tidying. Mount <TidyWorktreesDialogHost /> once. */
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { create } from "zustand";
import type { TidyWorktreeCandidate } from "@hive/protocol";
import "../styles/worktree.css";

export type TidyChoice = "keep" | "local" | "all";

interface Pending {
  candidates: TidyWorktreeCandidate[];
  resolve: (choices: Record<string, TidyChoice> | null) => void;
}

const useTidyStore = create<{ pending: Pending | null }>(() => ({ pending: null }));

/** Resolves branch -> chosen action, or null when cancelled. */
export function askTidyWorktrees(candidates: TidyWorktreeCandidate[]): Promise<Record<string, TidyChoice> | null> {
  return new Promise((resolve) => {
    useTidyStore.getState().pending?.resolve(null);
    useTidyStore.setState({ pending: { candidates, resolve } });
  });
}

function settle(choices: Record<string, TidyChoice> | null): void {
  const pending = useTidyStore.getState().pending;
  if (!pending) return;
  useTidyStore.setState({ pending: null });
  pending.resolve(choices);
}

const REASON: Record<TidyWorktreeCandidate["reason"], string> = {
  "archived-session": "archived session",
  "no-session": "no session",
  "remote-only": "remote only",
};

function options(c: TidyWorktreeCandidate): Array<{ id: TidyChoice; label: string }> {
  const out: Array<{ id: TidyChoice; label: string }> = [{ id: "keep", label: "Keep" }];
  if (c.hasLocalBranch || c.worktreePath) out.push({ id: "local", label: "Delete local" });
  if (c.hasRemoteBranch) out.push({ id: "all", label: c.hasLocalBranch || c.worktreePath ? "Delete local + remote" : "Delete remote" });
  return out;
}

/** The strongest delete this candidate supports (what "Delete all" picks). */
function maxChoice(c: TidyWorktreeCandidate): TidyChoice {
  const o = options(c);
  return o[o.length - 1]!.id;
}

const Dialog: React.FC<{ pending: Pending }> = ({ pending }) => {
  const { candidates } = pending;
  const [choices, setChoices] = useState<Record<string, TidyChoice>>(() =>
    Object.fromEntries(candidates.map((c) => [c.branch, "keep" as TidyChoice])),
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && settle(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const count = Object.values(choices).filter((c) => c !== "keep").length;
  const setAll = (mode: "keep" | "safe" | "all") =>
    setChoices(
      Object.fromEntries(
        candidates.map((c) => {
          const risky = c.unmerged > 0 || c.dirty > 0;
          const choice: TidyChoice = mode === "keep" || (mode === "safe" && risky) ? "keep" : maxChoice(c);
          return [c.branch, choice];
        }),
      ),
    );

  return (
    <div className="modal-scrim" onMouseDown={() => settle(null)}>
      <div
        className="choice-dialog tidy-wt"
        role="alertdialog"
        aria-label="Clean up worktrees"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="choice-dialog__title">Clean up worktrees and branches</div>
        <p className="choice-dialog__body">
          These Hive worktrees/branches aren't used by any active session. Pick what to do with each; nothing is deleted
          unless you choose it.
        </p>
        {candidates.length > 1 && (
          <div className="tidy-wt__bulk">
            <span>Set all:</span>
            <button className="ui-btn ui-btn--sm" onClick={() => setAll("keep")}>Keep</button>
            <button className="ui-btn ui-btn--sm" onClick={() => setAll("safe")} title="Delete only those with no unmerged commits or uncommitted changes">
              Delete clean
            </button>
            <button className="ui-btn ui-btn--sm choice-dialog__danger" onClick={() => setAll("all")}>Delete everything</button>
          </div>
        )}
        <div className="tidy-wt__list">
          {candidates.map((c) => {
            const risky = c.unmerged > 0 || c.dirty > 0;
            return (
              <div key={c.branch} className="tidy-wt__row">
                <div className="tidy-wt__info">
                  <div className="tidy-wt__branch" title={c.worktreePath ?? c.branch}>{c.branch}</div>
                  <div className="tidy-wt__meta">
                    <span>{REASON[c.reason]}</span>
                    {c.worktreePath && <span>worktree</span>}
                    {c.hasLocalBranch && <span>local</span>}
                    {c.hasRemoteBranch && <span>remote</span>}
                    {c.unmerged > 0 && <span className="tidy-wt__warn">{c.unmerged} unmerged</span>}
                    {c.dirty > 0 && <span className="tidy-wt__warn">{c.dirty} uncommitted</span>}
                    {!risky && <span>clean</span>}
                  </div>
                </div>
                <select
                  className="tidy-wt__select"
                  aria-label={`Action for ${c.branch}`}
                  value={choices[c.branch]}
                  onChange={(e) => setChoices((prev) => ({ ...prev, [c.branch]: e.target.value as TidyChoice }))}
                >
                  {options(c).map((o) => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
        <div className="choice-dialog__actions">
          <button className="ui-btn ui-btn--sm" onClick={() => settle(null)}>Cancel</button>
          <button
            className="ui-btn ui-btn--sm ui-btn--primary"
            disabled={count === 0}
            onClick={() => settle(choices)}
          >
            {count === 0 ? "Nothing selected" : `Apply (${count})`}
          </button>
        </div>
      </div>
    </div>
  );
};

export const TidyWorktreesDialogHost: React.FC = () => {
  const pending = useTidyStore((s) => s.pending);
  if (!pending) return null;
  return createPortal(<Dialog key={pending.candidates.map((c) => c.branch).join("|")} pending={pending} />, document.body);
};
