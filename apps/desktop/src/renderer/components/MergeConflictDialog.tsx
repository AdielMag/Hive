/** Merge conflict viewer + fixer: side-by-side hunks, one-click side picks, AI-merged hunks, then commit the merge. */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Check, FileWarning, GitMerge, Loader2, Sparkles, X } from "lucide-react";
import type { MergeConflictFile, MergeConflictResolution, SessionWorktree } from "@hive/protocol";
import {
  buildResolved,
  choiceText,
  conflictCount,
  hunkContext,
  normalizeHunkText,
  parseConflicts,
  type ConflictFileSegment,
  type ConflictSegment,
  type HunkResolution,
} from "../lib/conflicts.ts";
import { toast } from "../modules/toast-store.ts";
import { askChoice } from "./ChoiceDialog.tsx";
import "../styles/merge-conflicts.css";

const AI_CONCURRENCY = 3;

export interface MergeConflictDialogProps {
  worktree: SessionWorktree;
  files: MergeConflictFile[];
  /** Model id used for AI resolution (undefined = Pi default). */
  model?: string;
  modelName?: string;
  /** Called once the merge was committed ("merged") or aborted ("aborted"). */
  onClose: (outcome: "merged" | "aborted") => void;
}

type OtherChoice = "ours" | "theirs";
type HunkMap = Record<number, HunkResolution | undefined>;

interface ParsedFile {
  file: MergeConflictFile;
  segments: ConflictFileSegment[];
  eol: "\n" | "\r\n";
}

const keyOf = (path: string, index: number) => `${path}#${index}`;

export const MergeConflictDialog: React.FC<MergeConflictDialogProps> = ({ worktree, files, model, modelName, onClose }) => {
  const parsed = useMemo<ParsedFile[]>(
    () =>
      files.map((file) => ({
        file,
        segments: file.kind === "text" ? parseConflicts(file.content) : [],
        eol: file.content.includes("\r\n") ? "\r\n" : "\n",
      })),
    [files],
  );

  const [active, setActive] = useState(0);
  const [resolutions, setResolutions] = useState<Record<string, HunkMap>>({});
  const [others, setOthers] = useState<Record<string, OtherChoice | undefined>>({});
  const [aiBusy, setAiBusy] = useState<Set<string>>(new Set());
  const [aiErrors, setAiErrors] = useState<Record<string, string>>({});
  const [hint, setHint] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [submitting, setSubmitting] = useState<null | "merge" | "abort">(null);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  /** Set once the merge was committed or aborted; otherwise unmounting must abort so main isn't left mid-merge. */
  const settled = useRef(false);
  const wtRef = useRef(worktree);
  wtRef.current = worktree;
  const abortTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    mounted.current = true;
    // A StrictMode remount re-runs this effect right after cleanup: cancel the pending abort.
    if (abortTimer.current) clearTimeout(abortTimer.current);
    abortTimer.current = null;
    return () => {
      mounted.current = false;
      abortTimer.current = setTimeout(() => {
        if (!settled.current) void window.studio.worktreeConflictsAbort(wtRef.current).catch(() => {});
      }, 100);
    };
  }, []);

  const total = (p: ParsedFile) => (p.file.kind === "text" ? conflictCount(p.segments) : 1);
  const doneCount = (p: ParsedFile) => {
    if (p.file.kind !== "text") return others[p.file.path] ? 1 : 0;
    const map = resolutions[p.file.path] ?? {};
    return p.segments.filter((s) => s.type === "conflict" && map[s.index]).length;
  };
  const totalAll = parsed.reduce((n, p) => n + total(p), 0);
  const doneAll = parsed.reduce((n, p) => n + doneCount(p), 0);
  const allResolved = doneAll === totalAll;

  const setHunk = useCallback((path: string, index: number, r: HunkResolution | undefined) => {
    setResolutions((prev) => ({ ...prev, [path]: { ...(prev[path] ?? {}), [index]: r } }));
  }, []);

  const runAi = useCallback(
    async (p: ParsedFile, seg: ConflictSegment): Promise<void> => {
      const key = keyOf(p.file.path, seg.index);
      setAiBusy((s) => new Set(s).add(key));
      setAiErrors((e) => {
        const { [key]: _drop, ...rest } = e;
        return rest;
      });
      try {
        const ctx = hunkContext(p.segments, seg.index);
        const res = await window.studio.worktreeConflictsAi(worktree, {
          path: p.file.path,
          ...ctx,
          ours: seg.ours,
          theirs: seg.theirs,
          oursLabel: `${worktree.baseBranch} (${seg.oursLabel || "base"})`,
          theirsLabel: `${worktree.branch} (session)`,
          hint: hint.trim() || undefined,
          model,
        });
        if (!mounted.current) return;
        if (res.ok) setHunk(p.file.path, seg.index, { choice: "ai", text: normalizeHunkText(res.text, p.eol) });
        else setAiErrors((e) => ({ ...e, [key]: res.error }));
      } catch (err) {
        if (mounted.current) setAiErrors((e) => ({ ...e, [key]: err instanceof Error ? err.message : String(err) }));
      } finally {
        if (mounted.current)
          setAiBusy((s) => {
            const n = new Set(s);
            n.delete(key);
            return n;
          });
      }
    },
    [worktree, hint, model, setHunk],
  );

  const resolveAllWithAi = async () => {
    const jobs: Array<() => Promise<void>> = [];
    for (const p of parsed) {
      if (p.file.kind !== "text") continue;
      for (const seg of p.segments) {
        if (seg.type === "conflict" && !resolutions[p.file.path]?.[seg.index]) jobs.push(() => runAi(p, seg));
      }
    }
    if (jobs.length === 0) return;
    setBulkBusy(true);
    try {
      let next = 0;
      await Promise.all(
        Array.from({ length: Math.min(AI_CONCURRENCY, jobs.length) }, async () => {
          while (next < jobs.length) await jobs[next++]!();
        }),
      );
    } finally {
      if (mounted.current) setBulkBusy(false);
    }
  };

  const anyWork = doneAll > 0;

  const abort = async () => {
    if (submitting) return;
    if (anyWork) {
      const c = await askChoice({
        title: "Abort the merge?",
        body: ["Your resolutions will be discarded and the main tree returns to its state before the merge."],
        choices: [
          { id: "stay", label: "Keep resolving" },
          { id: "abort", label: "Abort merge", tone: "danger" },
        ],
      });
      if (c !== "abort") return;
    }
    setSubmitting("abort");
    setError(null);
    try {
      await window.studio.worktreeConflictsAbort(worktree);
    } catch (err) {
      const msg = `Abort failed: ${err instanceof Error ? err.message : String(err)}`;
      setError(msg);
      toast({ kind: "error", message: msg });
      setSubmitting(null);
      return;
    }
    settled.current = true;
    onClose("aborted");
  };

  const complete = async () => {
    if (!allResolved || submitting) return;
    settled.current = true; // an unmount mid-commit must not abort; reset on failure
    setSubmitting("merge");
    setError(null);
    try {
      const out: MergeConflictResolution[] = parsed.map((p) => {
        if (p.file.kind !== "text") return { path: p.file.path, action: others[p.file.path]! };
        const map: HunkMap = {};
        for (const [idx, r] of Object.entries(resolutions[p.file.path] ?? {})) {
          if (r) map[Number(idx)] = { ...r, text: normalizeHunkText(r.text, p.eol) };
        }
        return { path: p.file.path, action: "content", content: buildResolved(p.segments, map) };
      });
      const res = await window.studio.worktreeConflictsResolve(worktree, out);
      if (res.ok) {
        settled.current = true;
        onClose("merged");
        return;
      }
      settled.current = false;
      setError(res.error);
    } catch (err) {
      settled.current = false;
      setError(err instanceof Error ? err.message : String(err));
    }
    if (mounted.current) setSubmitting(null);
  };

  // No conflicted files left (e.g. everything was staged previously): allow finishing straight away.
  const current = parsed[active];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector(".choice-dialog")) void abort();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anyWork, submitting]);

  return createPortal(
    <div className="modal-scrim">
      <div className="mc-dialog" role="dialog" aria-label="Resolve merge conflicts" onMouseDown={(e) => e.stopPropagation()}>
        <header className="mc-head">
          <GitMerge size={15} />
          <div className="mc-head__title">
            Resolve conflicts
            <span className="mc-head__sub">
              {worktree.branch} → {worktree.baseBranch}
            </span>
          </div>
          <span className={`mc-progress${allResolved ? " is-done" : ""}`}>
            {doneAll}/{totalAll} resolved
          </span>
          <button className="ui-btn ui-btn--ghost ui-btn--sm" onClick={() => void abort()} disabled={submitting !== null} title="Abort merge" aria-label="Abort merge">
            <X size={14} />
          </button>
        </header>

        <div className="mc-toolbar">
          <input
            className="mc-hint"
            value={hint}
            onChange={(e) => setHint(e.target.value)}
            placeholder="Optional instruction for the AI (e.g. keep the new API names)"
            aria-label="Instruction for the AI"
          />
          <button
            className="ui-btn ui-btn--sm mc-ai-btn"
            onClick={() => void resolveAllWithAi()}
            disabled={bulkBusy || allResolved || submitting !== null || parsed.every((p) => p.file.kind !== "text")}
            title={`Resolve every unresolved hunk with ${modelName || "AI"}; you can review and edit each result`}
          >
            {bulkBusy ? <Loader2 size={12} className="spin" /> : <Sparkles size={12} />} Resolve all with AI
          </button>
        </div>

        <div className="mc-body">
          <nav className="mc-files" aria-label="Conflicted files">
            {parsed.map((p, i) => {
              const d = doneCount(p);
              const t = total(p);
              return (
                <button
                  key={p.file.path}
                  className={`mc-file${i === active ? " is-active" : ""}${d === t ? " is-done" : ""}`}
                  onClick={() => setActive(i)}
                  title={p.file.path}
                >
                  {d === t ? <Check size={12} /> : <FileWarning size={12} />}
                  <span className="mc-file__name">{p.file.path}</span>
                  <span className="mc-file__count">
                    {d}/{t}
                  </span>
                </button>
              );
            })}
            {parsed.length === 0 && <div className="mc-empty">No conflicted files remain.</div>}
          </nav>

          <section className="mc-main">
            {current && current.file.kind !== "text" && (
              <div className="mc-other">
                <AlertTriangle size={16} />
                <p>
                  <code>{current.file.path}</code> can&apos;t be merged line by line (binary file, or one side deleted it). Pick which version to keep.
                </p>
                <div className="mc-actions">
                  {(["ours", "theirs"] as const).map((side) => (
                    <button
                      key={side}
                      className={`ui-btn ui-btn--sm${others[current.file.path] === side ? " is-selected" : ""}`}
                      onClick={() => setOthers((o) => ({ ...o, [current.file.path]: side }))}
                    >
                      {side === "ours" ? `Keep ${worktree.baseBranch}` : `Take ${worktree.branch}`}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {current?.file.kind === "text" &&
              current.segments
                .filter((s): s is ConflictSegment => s.type === "conflict")
                .map((seg) => {
                  const path = current.file.path;
                  const res = resolutions[path]?.[seg.index];
                  const key = keyOf(path, seg.index);
                  const busy = aiBusy.has(key);
                  const pick = (choice: "ours" | "theirs" | "both") => setHunk(path, seg.index, { choice, text: choiceText(seg, choice) });
                  return (
                    <article key={key} className={`mc-hunk${res ? " is-resolved" : ""}`}>
                      <div className="mc-hunk__head">
                        <strong>
                          Conflict {seg.index + 1} of {conflictCount(current.segments)}
                        </strong>
                        {res && (
                          <span className="mc-tag">
                            <Check size={11} /> {res.choice === "ai" ? "AI merge" : res.choice === "custom" ? "edited" : res.choice === "both" ? "both" : res.choice === "ours" ? "base" : "session"}
                          </span>
                        )}
                      </div>
                      <div className="mc-sides">
                        <div className="mc-side mc-side--ours">
                          <div className="mc-side__label" title={seg.oursLabel}>
                            {worktree.baseBranch} <em>(base)</em>
                          </div>
                          <pre>{seg.ours || <span className="mc-nothing">(empty)</span>}</pre>
                        </div>
                        <div className="mc-side mc-side--theirs">
                          <div className="mc-side__label" title={seg.theirsLabel}>
                            {worktree.branch} <em>(session)</em>
                          </div>
                          <pre>{seg.theirs || <span className="mc-nothing">(empty)</span>}</pre>
                        </div>
                      </div>
                      <div className="mc-actions">
                        <button className="ui-btn ui-btn--sm" onClick={() => pick("ours")} disabled={busy}>
                          Accept base
                        </button>
                        <button className="ui-btn ui-btn--sm" onClick={() => pick("theirs")} disabled={busy}>
                          Accept session
                        </button>
                        <button className="ui-btn ui-btn--sm" onClick={() => pick("both")} disabled={busy}>
                          Accept both
                        </button>
                        <button className="ui-btn ui-btn--sm mc-ai-btn" onClick={() => void runAi(current, seg)} disabled={busy || bulkBusy}>
                          {busy ? <Loader2 size={12} className="spin" /> : <Sparkles size={12} />} {res?.choice === "ai" ? "Retry AI" : "Resolve with AI"}
                        </button>
                        {res && (
                          <button className="ui-btn ui-btn--ghost ui-btn--sm" onClick={() => setHunk(path, seg.index, undefined)} disabled={busy}>
                            Reset
                          </button>
                        )}
                      </div>
                      {aiErrors[key] && (
                        <div className="mc-error" role="alert">
                          {aiErrors[key]}
                        </div>
                      )}
                      {res && (
                        <div className="mc-result">
                          <div className="mc-side__label">Result (editable)</div>
                          <textarea
                            value={res.text}
                            spellCheck={false}
                            rows={Math.min(14, Math.max(2, res.text.split("\n").length))}
                            onChange={(e) => setHunk(path, seg.index, { choice: "custom", text: e.target.value })}
                            aria-label={`Resolved text for conflict ${seg.index + 1}`}
                          />
                        </div>
                      )}
                    </article>
                  );
                })}
          </section>
        </div>

        <footer className="mc-foot">
          {error ? (
            <span className="mc-error" role="alert" title={error}>
              {error}
            </span>
          ) : (
            <span className="mc-foot__hint">Nothing is committed until you complete the merge. Abort restores the main tree.</span>
          )}
          <button className="ui-btn ui-btn--ghost ui-btn--sm" onClick={() => void abort()} disabled={submitting !== null}>
            {submitting === "abort" && <Loader2 size={12} className="spin" />} Abort merge
          </button>
          <button className="ui-btn ui-btn--sm ui-btn--primary" onClick={() => void complete()} disabled={!allResolved || submitting !== null || bulkBusy}>
            {submitting === "merge" ? <Loader2 size={12} className="spin" /> : <GitMerge size={12} />} Complete merge
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
};
