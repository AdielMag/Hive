/**
 * One-line nudge above the composer after a mid-session model switch: the new model has its own (cold)
 * prompt cache, so the next message would re-send the whole conversation uncached. Compacting first
 * lets the new model start from a summary + recent turns. See lib/models/cache-switch.ts.
 */
import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, Minimize2, TriangleAlert, X, Zap } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import type { Model, SessionStats } from "@hive/protocol";
import { useSessionStore } from "../store/session-store.ts";
import {
  DEFAULT_KEEP_RECENT_PERCENT,
  estimateSwitchSavings,
  isRecent,
  isWorthCompacting,
  lastResponse,
  sameModel,
} from "../lib/models/cache-switch.ts";
import "../styles/model-switch-cache-bar.css";

const fmtK = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return String(Math.round(n));
};
const modelName = (m: Pick<Model<any>, "id" | "name"> | null | undefined, fallback: string) => m?.name || m?.id || fallback;

/** Dismissed (tab, last response, target model) combos; module-level so remounts don't resurrect them. */
const dismissed = new Set<string>();
/**
 * (tab, last response) pairs a compaction happened after. Live sessions don't receive compaction entries,
 * so `lastResponse` alone can't tell that the history was already summarized.
 */
const compactedAfter = new Set<string>();

let keepRecentPercentCache: number | null = null;
function useKeepRecentPercent(): number {
  const [pct, setPct] = useState(keepRecentPercentCache ?? DEFAULT_KEEP_RECENT_PERCENT);
  useEffect(() => {
    if (keepRecentPercentCache !== null || !window.studio?.getCompactionSettings) return;
    let alive = true;
    window.studio
      .getCompactionSettings()
      .then((s) => {
        keepRecentPercentCache = s?.keepRecentPercent || DEFAULT_KEEP_RECENT_PERCENT;
        if (alive) setPct(keepRecentPercentCache);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return pct;
}

/** Action state, scoped to the session (Pi process key) it was started in. */
type Phase =
  | { kind: "idle" }
  | { kind: "compacting"; key: string; saved: number; toName: string }
  | { kind: "done"; key: string; tokens: number; toName: string }
  | { kind: "error"; key: string; message: string };

export const ModelSwitchCacheBar: React.FC = () => {
  const { transcript, stats, selectedModel, activeKey, activeTabId } = useSessionStore(
    useShallow((s) => ({
      transcript: s.transcript,
      stats: s.stats,
      selectedModel: s.selectedModel,
      activeKey: s.activeKey,
      activeTabId: s.activeTabId,
    })),
  );
  const keepRecentPercent = useKeepRecentPercent();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [, bump] = useState(0);

  // Nothing to advise mid-turn; skip the branch walk on every streamed delta.
  const last = useMemo(() => (transcript.running ? null : lastResponse(transcript)), [transcript]);
  const switched = !!last && !!selectedModel && !sameModel(selectedModel, last.provider, last.model);
  const responseKey = last ? `${activeTabId}|${last.key}` : "";
  const dismissKey = last && selectedModel ? `${responseKey}|${selectedModel.provider}/${selectedModel.id}` : "";
  const contextTokens = stats?.contextUsage?.tokens ?? transcript.lastUsage?.totalTokens ?? 0;
  const ctxWindow = selectedModel?.contextWindow ?? stats?.contextUsage?.contextWindow ?? 200_000;

  const advice = useMemo(() => {
    if (!switched || !last) return null;
    return estimateSwitchSavings({
      contextTokens,
      baselineTokens: last.baselineTokens,
      // Pi compacts with the current (new) model's per-model override.
      keepRecentTokens: Math.round((ctxWindow * keepRecentPercent) / 100),
    });
  }, [switched, last, contextTokens, ctxWindow, keepRecentPercent]);

  // Any compaction (manual, auto, or ours) supersedes the advice for the response it followed.
  const compacting = !!transcript.compaction;
  useEffect(() => {
    if (!compacting) return;
    const s = useSessionStore.getState();
    const before = lastResponse(s.transcript);
    if (before) compactedAfter.add(`${s.activeTabId}|${before.key}`);
  }, [compacting]);

  // Result lines fade out on their own.
  useEffect(() => {
    if (phase.kind !== "done" && phase.kind !== "error") return;
    const t = setTimeout(() => setPhase({ kind: "idle" }), phase.kind === "done" ? 5000 : 15000);
    return () => clearTimeout(t);
  }, [phase]);

  const toName = modelName(selectedModel, "the new model");
  const phaseHere = phase.kind !== "idle" && phase.key === activeKey ? phase : null;

  // Only one compaction at a time (the phase slot is shared by all tabs).
  const busyElsewhere = phase.kind === "compacting" && phase.key !== activeKey;

  const dismiss = () => {
    if (dismissKey) dismissed.add(dismissKey);
    bump((n) => n + 1);
  };
  const clearResult = () => {
    if (phaseHere) setPhase({ kind: "idle" });
  };

  const compactFirst = async () => {
    if (!activeKey || !advice || phase.kind === "compacting" || transcript.running) return;
    const key = activeKey;
    const doneKey = responseKey;
    setPhase({ kind: "compacting", key, saved: advice.savedTokens, toName });
    try {
      const res = await window.studio.rpc(key, { type: "compact" });
      if (!res.ok) throw new Error(res.error || "compaction failed");
      if (doneKey) compactedAfter.add(doneKey);
      const st = await window.studio.rpc(key, { type: "get_session_stats" }).catch(() => null);
      const measured = st?.ok ? (st.data as SessionStats).contextUsage?.tokens : undefined;
      if (st?.ok && useSessionStore.getState().activeKey === key) useSessionStore.setState({ stats: st.data as SessionStats });
      setPhase({ kind: "done", key, tokens: measured ?? advice.afterCompactTokens, toName });
    } catch (err) {
      setPhase({ kind: "error", key, message: err instanceof Error ? err.message : String(err) });
    }
  };

  if (phaseHere?.kind === "compacting") {
    return (
      <div className="cache-switch-bar is-busy" role="status">
        <Loader2 size={13} className="cache-switch-bar__icon spin" />
        <span className="cache-switch-bar__label">Compacting to save ~{fmtK(phaseHere.saved)} tokens…</span>
        <span className="cache-switch-bar__hint cache-switch-bar__hint--grow">
          Summarizing earlier turns so {phaseHere.toName} doesn't re-read the full history
        </span>
      </div>
    );
  }

  if (phaseHere?.kind === "done") {
    return (
      <div className="cache-switch-bar is-done" role="status">
        <CheckCircle2 size={13} className="cache-switch-bar__icon" />
        <span className="cache-switch-bar__label">Compacted</span>
        <span className="cache-switch-bar__hint cache-switch-bar__hint--grow">
          {phaseHere.toName} starts from ~{fmtK(phaseHere.tokens)} tokens instead of the full history
        </span>
      </div>
    );
  }

  if (phaseHere?.kind === "error") {
    return (
      <div className="cache-switch-bar is-error" role="alert">
        <TriangleAlert size={13} className="cache-switch-bar__icon" />
        <span className="cache-switch-bar__label">Compaction failed</span>
        <span className="cache-switch-bar__hint cache-switch-bar__hint--grow" title={phaseHere.message}>
          {phaseHere.message}
        </span>
        <button className="cache-switch-bar__btn cache-switch-bar__btn--ghost" onClick={clearResult} title="Dismiss">
          <X size={11} />
        </button>
      </div>
    );
  }

  const eligible =
    !!advice &&
    !!last &&
    !!activeKey &&
    !transcript.running &&
    !transcript.compaction &&
    isRecent(last) &&
    isWorthCompacting(advice) &&
    !compactedAfter.has(responseKey) &&
    !dismissed.has(dismissKey);
  if (!eligible || !advice) return null;

  const tooltip =
    `Each model keeps its own prompt cache, so your next message on ${toName} re-sends all ~${fmtK(advice.contextTokens)} tokens ` +
    `of this conversation without cache hits (slower, billed at the full rate), and every turn after keeps carrying them.\n\n` +
    `Compacting summarizes the earlier turns once, so from then on each request to ${toName} carries ~${fmtK(advice.afterCompactTokens)} ` +
    `tokens instead. A model switch is a natural break between tasks — a good moment to compact.`;

  return (
    <div className="cache-switch-bar" title={tooltip} role="status">
      <Zap size={13} className="cache-switch-bar__icon" />
      <span className="cache-switch-bar__label">Compact first to save ~{fmtK(advice.savedTokens)} tokens per message</span>
      <span className="cache-switch-bar__hint cache-switch-bar__hint--grow">
        {toName} starts with a cold cache and would re-read all {fmtK(advice.contextTokens)}
      </span>
      <button
        className="cache-switch-bar__btn"
        onClick={() => void compactFirst()}
        disabled={busyElsewhere}
        title={busyElsewhere ? "Another session is compacting" : "Summarize earlier turns now"}
      >
        <Minimize2 size={11} />
        Compact first
      </button>
      <button className="cache-switch-bar__btn cache-switch-bar__btn--ghost" onClick={dismiss} title="Keep the full history on the new model">
        <X size={11} />
      </button>
    </div>
  );
};
