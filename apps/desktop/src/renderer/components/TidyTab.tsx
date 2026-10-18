/** Live view of an "Archive old" run: pipeline steps, counters, per-session verdicts, log, and the worktree picker. */
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  Bot,
  Check,
  CircleAlert,
  FolderGit2,
  GitBranch,
  Loader2,
  Play,
  ScanSearch,
  Sparkles,
  Square,
  Trash2,
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import type { TidyWorktreeCandidate } from "@hive/protocol";
import { useSessionStore } from "../store/session-store.ts";
import { resolveFeatureModel, useFeatureModelStore } from "../store/feature-models-store.ts";
import {
  cancelTidy,
  isTidyBusy,
  resolveWorktreePrompt,
  setTidyOptions,
  startTidy,
  undoTidy,
  useTidyStore,
  type TidyChoice,
  type TidyItem,
  type TidyPhase,
} from "../store/tidy-store.ts";
import { formatAgoShort } from "../lib/format.ts";
import "../styles/tidy.css";

type StepState = "todo" | "active" | "done";
const STEPS: Array<{ id: string; label: string; icon: React.ReactNode; phases: TidyPhase[] }> = [
  { id: "scan", label: "Scan", icon: <ScanSearch size={14} />, phases: ["scanning"] },
  { id: "ask", label: "Ask model", icon: <Bot size={14} />, phases: ["asking"] },
  { id: "archive", label: "Archive", icon: <Archive size={14} />, phases: ["archiving"] },
  { id: "wt", label: "Worktrees", icon: <GitBranch size={14} />, phases: ["worktrees"] },
];
const ORDER: TidyPhase[] = ["scanning", "asking", "archiving", "worktrees"];

function stepState(step: (typeof STEPS)[number], phase: TidyPhase): StepState {
  if (step.phases.includes(phase)) return "active";
  if (phase === "done") return "done";
  const cur = ORDER.indexOf(phase);
  const mine = ORDER.indexOf(step.phases[0]!);
  return cur > mine ? "done" : "todo";
}

const STATUS_LABEL: Record<TidyItem["status"], string> = {
  queued: "Queued",
  asking: "Asking…",
  archive: "To archive",
  keep: "Keep",
  archived: "Archived",
  failed: "Failed",
};

type Filter = "all" | "archived" | "keep";

const Stat: React.FC<{ value: number | string; label: string; tone?: "accent" | "ok" | "muted" }> = ({ value, label, tone }) => (
  <div className={`tidy-stat${tone ? ` tidy-stat--${tone}` : ""}`}>
    <div className="tidy-stat__value">{value}</div>
    <div className="tidy-stat__label">{label}</div>
  </div>
);

const REASON: Record<TidyWorktreeCandidate["reason"], string> = {
  "archived-session": "archived session",
  "no-session": "no session",
  "remote-only": "remote only",
};

function choiceOptions(c: TidyWorktreeCandidate): Array<{ id: TidyChoice; label: string }> {
  const out: Array<{ id: TidyChoice; label: string }> = [{ id: "keep", label: "Keep" }];
  if (c.hasLocalBranch || c.worktreePath) out.push({ id: "local", label: "Delete local" });
  if (c.hasRemoteBranch) out.push({ id: "all", label: c.hasLocalBranch || c.worktreePath ? "Local + remote" : "Delete remote" });
  return out;
}

const WorktreePicker: React.FC<{ candidates: TidyWorktreeCandidate[] }> = ({ candidates }) => {
  const [choices, setChoices] = useState<Record<string, TidyChoice>>(() =>
    Object.fromEntries(candidates.map((c) => [c.branch, "keep" as TidyChoice])),
  );
  const count = Object.values(choices).filter((c) => c !== "keep").length;
  const setAll = (mode: "keep" | "safe" | "all") =>
    setChoices(
      Object.fromEntries(
        candidates.map((c) => {
          const risky = c.unmerged > 0 || c.dirty > 0;
          const opts = choiceOptions(c);
          const choice: TidyChoice = mode === "keep" || (mode === "safe" && risky) ? "keep" : opts[opts.length - 1]!.id;
          return [c.branch, choice];
        }),
      ),
    );

  return (
    <section className="tidy-card tidy-wt-picker">
      <header className="tidy-card__head">
        <FolderGit2 size={15} />
        <h3>Unused worktrees &amp; branches</h3>
        <span className="tidy-card__count">{candidates.length}</span>
      </header>
      <p className="tidy-card__hint">Nothing is deleted unless you choose it. Risky ones (unmerged or uncommitted work) are flagged.</p>
      <div className="tidy-wt-picker__bulk">
        <button className="ui-btn ui-btn--sm" onClick={() => setAll("keep")}>Keep all</button>
        <button className="ui-btn ui-btn--sm" onClick={() => setAll("safe")} title="Only those with no unmerged commits or uncommitted changes">
          <Check size={12} /> Delete clean
        </button>
        <button className="ui-btn ui-btn--sm tidy-btn-danger" onClick={() => setAll("all")}>
          <Trash2 size={12} /> Delete everything
        </button>
      </div>
      <div className="tidy-wt-picker__list">
        {candidates.map((c) => {
          const risky = c.unmerged > 0 || c.dirty > 0;
          const opts = choiceOptions(c);
          return (
            <div key={c.branch} className={`tidy-wt-row${risky ? " is-risky" : ""}`}>
              <div className="tidy-wt-row__info">
                <div className="tidy-wt-row__branch" title={c.worktreePath ?? c.branch}>{c.branch}</div>
                <div className="tidy-wt-row__meta">
                  <span className="tidy-chip">{REASON[c.reason]}</span>
                  {c.worktreePath && <span className="tidy-chip">worktree</span>}
                  {c.hasLocalBranch && <span className="tidy-chip">local</span>}
                  {c.hasRemoteBranch && <span className="tidy-chip">remote</span>}
                  {c.unmerged > 0 && <span className="tidy-chip tidy-chip--warn">{c.unmerged} unmerged</span>}
                  {c.dirty > 0 && <span className="tidy-chip tidy-chip--warn">{c.dirty} uncommitted</span>}
                  {c.merged && <span className="tidy-chip tidy-chip--ok">merged</span>}
                </div>
              </div>
              <div className="tidy-seg" role="radiogroup" aria-label={`Action for ${c.branch}`}>
                {opts.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    role="radio"
                    aria-checked={choices[c.branch] === o.id}
                    className={`tidy-seg__btn${choices[c.branch] === o.id ? " is-on" : ""}${o.id !== "keep" ? " is-danger" : ""}`}
                    onClick={() => setChoices((prev) => ({ ...prev, [c.branch]: o.id }))}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <footer className="tidy-wt-picker__actions">
        <button className="ui-btn ui-btn--sm" onClick={() => resolveWorktreePrompt(null)}>Skip</button>
        <button
          className="ui-btn ui-btn--sm ui-btn--primary"
          disabled={count === 0}
          onClick={() => resolveWorktreePrompt(choices)}
        >
          {count === 0 ? "Nothing selected" : `Delete ${count}`}
        </button>
      </footer>
    </section>
  );
};

function useElapsed(running: boolean, startedAt: number, finishedAt: number): string {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [running]);
  if (!startedAt) return "";
  const secs = Math.max(0, Math.round(((running ? Date.now() : finishedAt || Date.now()) - startedAt) / 1000));
  return secs >= 60 ? `${Math.floor(secs / 60)}m ${secs % 60}s` : `${secs}s`;
}

export const TidyTab: React.FC = () => {
  const t = useTidyStore();
  const busy = isTidyBusy();
  const elapsed = useElapsed(busy, t.startedAt, t.finishedAt);
  const [filter, setFilter] = useState<Filter>("all");
  const logEnd = useRef<HTMLDivElement>(null);

  const { selectedModel, defaultModel, models } = useSessionStore(
    useShallow((s) => ({ selectedModel: s.selectedModel, defaultModel: s.defaultModel, models: s.models })),
  );
  const tidyPref = useFeatureModelStore((s) => s.config.sessionTidy);
  const resolved = useMemo(
    () => resolveFeatureModel(tidyPref, selectedModel, defaultModel, models),
    [tidyPref, selectedModel, defaultModel, models],
  );

  useEffect(() => {
    logEnd.current?.scrollIntoView({ block: "end" });
  }, [t.log.length]);

  const count = (st: TidyItem["status"][]) => t.items.filter((i) => st.includes(i.status)).length;
  const archived = count(["archived"]);
  const toArchive = archived + count(["archive"]);
  const kept = count(["keep"]);
  const failed = count(["failed"]);
  const ruleCount = t.items.filter((i) => i.source === "rule" && (i.status === "archive" || i.status === "archived")).length;
  const decided = t.items.length - count(["queued", "asking"]);
  const pct =
    t.phase === "done" || t.phase === "cancelled"
      ? 100
      : t.items.length
        ? Math.round((decided / t.items.length) * 100)
        : t.phase === "scanning"
          ? 4
          : 0;

  const shown = t.items.filter((i) =>
    filter === "all" ? true : filter === "archived" ? i.status === "archived" || i.status === "archive" : i.status === "keep",
  );
  // Newest decisions first feels alive; keep stable order (oldest first) for scanning instead.
  const idle = !busy;
  const phaseTitle: Record<TidyPhase, string> = {
    idle: "Ready",
    scanning: "Scanning sessions…",
    asking: "Model is reviewing sessions…",
    archiving: "Archiving…",
    worktrees: t.worktreePrompt ? "Waiting for your choice" : "Checking worktrees…",
    done: "All done",
    cancelled: "Stopped",
    error: "Something went wrong",
  };

  const run = () => void startTidy({ id: resolved.id, label: resolved.name || resolved.id });

  return (
    <div className="tidy">
      <div className="tidy__scroll">
        <header className="tidy-hero">
          <div className={`tidy-hero__icon${busy ? " is-busy" : ""}`}>
            {busy ? <Loader2 size={20} className="spin" /> : t.phase === "error" ? <CircleAlert size={20} /> : <Sparkles size={20} />}
          </div>
          <div className="tidy-hero__text">
            <h2>Archive old sessions</h2>
            <p>
              {phaseTitle[t.phase]}
              {elapsed && <span className="tidy-hero__time"> · {elapsed}</span>}
              {t.modelLabel && <span className="tidy-hero__time"> · {t.modelLabel}</span>}
            </p>
          </div>
          <div className="tidy-hero__actions">
            {busy ? (
              <button className="ui-btn ui-btn--sm" onClick={cancelTidy}>
                <Square size={12} /> Stop
              </button>
            ) : (
              <>
                {archived > 0 && (
                  <button className="ui-btn ui-btn--sm" onClick={() => void undoTidy()}>
                    <ArchiveRestore size={12} /> Undo ({archived})
                  </button>
                )}
                <button className="ui-btn ui-btn--sm ui-btn--primary" onClick={run}>
                  <Play size={12} /> {t.phase === "idle" ? "Start" : "Run again"}
                </button>
              </>
            )}
          </div>
        </header>

        <div className="tidy-progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className={`tidy-progress__bar${busy ? " is-busy" : ""}`} style={{ width: `${pct}%` }} />
        </div>

        <ol className="tidy-steps">
          {STEPS.map((s, i) => {
            const st = idle && t.phase === "idle" ? "todo" : stepState(s, t.phase);
            return (
              <li key={s.id} className={`tidy-step is-${st}`}>
                <span className="tidy-step__dot">
                  {st === "done" ? <Check size={12} /> : st === "active" ? <Loader2 size={12} className="spin" /> : s.icon}
                </span>
                <span className="tidy-step__label">
                  {s.label}
                  {s.id === "ask" && t.batchesTotal > 0 && (
                    <em>
                      {" "}
                      {t.batchesDone}/{t.batchesTotal}
                    </em>
                  )}
                </span>
                {i < STEPS.length - 1 && <span className="tidy-step__line" />}
              </li>
            );
          })}
        </ol>

        <div className="tidy-stats">
          <Stat value={t.items.length} label="Eligible" />
          <Stat value={toArchive} label="To archive" tone="accent" />
          <Stat value={kept} label="Kept" tone="muted" />
          <Stat value={ruleCount} label="By age rule" />
          {failed > 0 && <Stat value={failed} label="Failed" />}
          {t.worktreesRemoved > 0 && <Stat value={t.worktreesRemoved} label="Worktrees cleaned" tone="ok" />}
        </div>

        <section className="tidy-card tidy-options">
          <header className="tidy-card__head">
            <h3>Options</h3>
            <span className="tidy-card__hint-inline">Applied on the next run</span>
          </header>
          <div className="tidy-options__row">
            <span>Auto-archive untouched for</span>
            <div className="tidy-seg">
              {[0, 7, 14, 30].map((d) => (
                <button
                  key={d}
                  type="button"
                  disabled={busy}
                  className={`tidy-seg__btn${t.options.autoDays === d ? " is-on" : ""}`}
                  onClick={() => setTidyOptions({ autoDays: d })}
                >
                  {d === 0 ? "Off" : `${d}d`}
                </button>
              ))}
            </div>
          </div>
          <label className="tidy-options__row tidy-options__check">
            <input type="checkbox" disabled={busy} checked={t.options.includeOpen} onChange={(e) => setTidyOptions({ includeOpen: e.target.checked })} />
            <span>Include sessions with open tabs (idle ones; their tab is closed)</span>
          </label>
          <label className="tidy-options__row tidy-options__check">
            <input
              type="checkbox"
              disabled={busy}
              checked={t.options.includeWorktrees}
              onChange={(e) => setTidyOptions({ includeWorktrees: e.target.checked })}
            />
            <span>Include worktree sessions (worktrees are offered for cleanup afterwards)</span>
          </label>
          <p className="tidy-card__hint">Running sessions, ones waiting on you, the open tab, and anything touched in the last 2 hours are always kept.</p>
        </section>

        {t.worktreePrompt && <WorktreePicker key={t.worktreePrompt.candidates.map((c) => c.branch).join("|")} candidates={t.worktreePrompt.candidates} />}

        <div className="tidy-grid">
          <section className="tidy-card tidy-sessions">
            <header className="tidy-card__head">
              <h3>Sessions</h3>
              <div className="tidy-seg tidy-seg--sm">
                {(["all", "archived", "keep"] as Filter[]).map((f) => (
                  <button key={f} type="button" className={`tidy-seg__btn${filter === f ? " is-on" : ""}`} onClick={() => setFilter(f)}>
                    {f === "all" ? "All" : f === "archived" ? "Archive" : "Keep"}
                  </button>
                ))}
              </div>
            </header>
            <div className="tidy-sessions__list">
              {shown.length === 0 && <div className="tidy-empty">{t.items.length ? "No sessions in this view" : busy ? "Scanning…" : "Nothing here yet"}</div>}
              {shown.map((i) => (
                <div key={i.path} className={`tidy-item is-${i.status}`}>
                  <span className="tidy-item__status">
                    {i.status === "asking" ? <Loader2 size={12} className="spin" /> : i.status === "archived" ? <Archive size={12} /> : i.status === "keep" ? <Check size={12} /> : i.status === "failed" ? <CircleAlert size={12} /> : i.status === "archive" ? <Archive size={12} /> : <span className="tidy-item__dot" />}
                  </span>
                  <span className="tidy-item__title" title={i.title}>{i.title}</span>
                  {i.source && <span className="tidy-chip">{i.source === "rule" ? "age" : "AI"}</span>}
                  {i.hadTab && <span className="tidy-chip">tab</span>}
                  {i.hasWorktree && <span className="tidy-chip">worktree</span>}
                  <span className="tidy-item__meta">{i.messageCount} msg · {formatAgoShort(i.modified)}</span>
                  <span className={`tidy-item__badge is-${i.status}`}>{STATUS_LABEL[i.status]}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="tidy-card tidy-log">
            <header className="tidy-card__head">
              <h3>Activity</h3>
            </header>
            <div className="tidy-log__list">
              {t.log.map((l, idx) => (
                <div key={idx} className={`tidy-log__line is-${l.kind ?? "info"}`}>
                  <span className="tidy-log__time">{new Date(l.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                  <span>{l.text}</span>
                </div>
              ))}
              {t.log.length === 0 && <div className="tidy-empty">Press Start to begin</div>}
              <div ref={logEnd} />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
