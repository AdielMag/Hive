/**
 * One-line nudge above the composer when the next message would hit a cold prompt cache: either after a
 * mid-session model switch (the new model has its own cache) or once the cache TTL (5 min) has passed
 * since the conversation was last sent. The whole conversation would be re-sent uncached; compacting
 * first lets the next request start from a summary + recent turns. See lib/models/cache-switch.ts.
 */
import React, { useEffect, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, Loader2, Minimize2, Snowflake, TriangleAlert, X } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import type { Model } from "@hive/protocol";
import { applyCompactionResult, useSessionStore } from "../store/session-store.ts";
import {
  CACHE_TTL_MS,
  DEFAULT_KEEP_RECENT_MAX_TOKENS,
  DEFAULT_KEEP_RECENT_PERCENT,
  estimateSwitchSavings,
  isCacheExpired,
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

/** Before → after context size with a proportional meter (the filled part is what remains after compaction). */
const TokenDelta: React.FC<{ before: number; after: number; className?: string }> = ({ before, after, className }) => {
  const pct = before > 0 ? Math.min(100, Math.max(4, Math.round((after / before) * 100))) : 100;
  return (
    <span className={`cache-switch-bar__delta${className ? ` ${className}` : ""}`} title={`${fmtK(before)} → ~${fmtK(after)} tokens`}>
      <span className="cache-switch-bar__delta-nums">
        <span className="cache-switch-bar__num cache-switch-bar__num--before">{fmtK(before)}</span>
        <ArrowRight size={10} />
        <span className="cache-switch-bar__num">~{fmtK(after)}</span>
      </span>
      <span className="cache-switch-bar__meter" aria-hidden>
        <span className="cache-switch-bar__meter-fill" style={{ width: `${pct}%` }} />
      </span>
    </span>
  );
};

/** Dismissed (tab, last response, target model) combos; module-level so remounts don't resurrect them. */
const dismissed = new Set<string>();
/**
 * (tab, last response) pairs a compaction happened after. Live sessions don't receive compaction entries,
 * so `lastResponse` alone can't tell that the history was already summarized.
 */
const compactedAfter = new Set<string>();

interface KeepRecent {
  percent: number;
  /** Ceiling on the verbatim tail in tokens (0 = none). */
  maxTokens: number;
}
const DEFAULT_KEEP_RECENT: KeepRecent = { percent: DEFAULT_KEEP_RECENT_PERCENT, maxTokens: DEFAULT_KEEP_RECENT_MAX_TOKENS };
let keepRecentCache: KeepRecent | null = null;
function useKeepRecent(): KeepRecent {
  const [keep, setKeep] = useState(keepRecentCache ?? DEFAULT_KEEP_RECENT);
  useEffect(() => {
    if (keepRecentCache !== null || !window.studio?.getCompactionSettings) return;
    let alive = true;
    window.studio
      .getCompactionSettings()
      .then((s) => {
        keepRecentCache = {
          percent: s?.keepRecentPercent || DEFAULT_KEEP_RECENT_PERCENT,
          maxTokens: s?.keepRecentMaxTokens ?? DEFAULT_KEEP_RECENT_MAX_TOKENS,
        };
        if (alive) setKeep(keepRecentCache);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return keep;
}

/** Action state, scoped to the session (Pi process key) it was started in. */
type Phase =
  | { kind: "idle" }
  | { kind: "compacting"; key: string; saved: number; toName: string }
  | { kind: "done"; key: string; before: number; tokens: number; toName: string }
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
  const keepRecent = useKeepRecent();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [, bump] = useState(0);

  // Nothing to advise mid-turn; skip the branch walk on every streamed delta.
  const last = useMemo(() => (transcript.running ? null : lastResponse(transcript)), [transcript]);
  const switched = !!last && !!selectedModel && !sameModel(selectedModel, last.provider, last.model);
  const responseKey = last ? `${activeTabId}|${last.key}` : "";
  const dismissKey = last && selectedModel ? `${responseKey}|${selectedModel.provider}/${selectedModel.id}` : "";
  const contextTokens = stats?.contextUsage?.tokens ?? transcript.lastUsage?.totalTokens ?? 0;
  const ctxWindow = selectedModel?.contextWindow ?? stats?.contextUsage?.contextWindow ?? 200_000;

  // Re-render when the cache TTL elapses (nothing else changes at that moment).
  const lastAt = last?.at;
  useEffect(() => {
    if (lastAt === undefined) return;
    const delay = lastAt + CACHE_TTL_MS - Date.now();
    if (delay <= 0) return;
    const t = setTimeout(() => bump((n) => n + 1), delay + 250);
    return () => clearTimeout(t);
  }, [lastAt]);
  const expired = !!last && isCacheExpired(last);
  const coldCache = switched || expired;

  const advice = useMemo(() => {
    if (!coldCache || !last) return null;
    return estimateSwitchSavings({
      contextTokens,
      baselineTokens: last.baselineTokens,
      // Pi compacts with the current (new) model's per-model override.
      keepRecentTokens: Math.min(
        Math.round((ctxWindow * keepRecent.percent) / 100),
        keepRecent.maxTokens > 0 ? keepRecent.maxTokens : Infinity,
      ),
    });
  }, [coldCache, last, contextTokens, ctxWindow, keepRecent]);

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
      // Updates the context widgets (stats + transcript) and tells us what Pi actually compacted.
      const outcome = await applyCompactionResult(key, res.data, advice.afterCompactTokens);
      setPhase({
        kind: "done",
        key,
        before: outcome?.tokensBefore ?? advice.contextTokens,
        tokens: outcome?.tokensAfter ?? advice.afterCompactTokens,
        toName,
      });
    } catch (err) {
      setPhase({ kind: "error", key, message: err instanceof Error ? err.message : String(err) });
    }
  };

  if (phaseHere?.kind === "compacting") {
    return (
      <div className="cache-switch-bar is-busy" role="status">
        <span className="cache-switch-bar__badge">
          <Loader2 size={14} className="spin" />
        </span>
        <span className="cache-switch-bar__text">
          <span className="cache-switch-bar__title">Compacting to save ~{fmtK(phaseHere.saved)} tokens…</span>
          <span className="cache-switch-bar__sub">Summarizing earlier turns so {phaseHere.toName} doesn't re-read the full history</span>
        </span>
      </div>
    );
  }

  if (phaseHere?.kind === "done") {
    return (
      <div className="cache-switch-bar is-done" role="status">
        <span className="cache-switch-bar__badge">
          <CheckCircle2 size={14} />
        </span>
        <span className="cache-switch-bar__text">
          <span className="cache-switch-bar__title">Compacted — freed ~{fmtK(Math.max(0, phaseHere.before - phaseHere.tokens))} tokens</span>
          <span className="cache-switch-bar__sub">{phaseHere.toName} starts from the summary instead of the full history</span>
        </span>
        <TokenDelta before={phaseHere.before} after={phaseHere.tokens} />
      </div>
    );
  }

  if (phaseHere?.kind === "error") {
    return (
      <div className="cache-switch-bar is-error" role="alert">
        <span className="cache-switch-bar__badge">
          <TriangleAlert size={14} />
        </span>
        <span className="cache-switch-bar__text">
          <span className="cache-switch-bar__title">Compaction failed</span>
          <span className="cache-switch-bar__sub" title={phaseHere.message}>
            {phaseHere.message}
          </span>
        </span>
        <button className="cache-switch-bar__btn cache-switch-bar__btn--ghost" onClick={clearResult} title="Dismiss">
          <X size={12} />
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
    // A switch only counts as "mid-session" when recent; an expired cache is cold however old the session is.
    (expired || isRecent(last)) &&
    isWorthCompacting(advice) &&
    !compactedAfter.has(responseKey) &&
    !dismissed.has(dismissKey);
  if (!eligible || !advice) return null;

  const idleMin = last?.at !== undefined ? Math.max(1, Math.floor((Date.now() - last.at) / 60_000)) : null;
  const tooltip = switched
    ? `Each model keeps its own prompt cache, so your next message on ${toName} re-sends all ~${fmtK(advice.contextTokens)} tokens ` +
      `of this conversation without cache hits (slower, billed at the full rate), and every turn after keeps carrying them.

` +
      `Compacting summarizes the earlier turns once, so from then on each request to ${toName} carries ~${fmtK(advice.afterCompactTokens)} ` +
      `tokens instead. A model switch is a natural break between tasks — a good moment to compact.`
    : `The prompt cache only lives ${CACHE_TTL_MS / 60_000} minutes after a request, so your next message re-sends all ` +
      `~${fmtK(advice.contextTokens)} tokens of this conversation without cache hits (slower, billed at the full rate), and every turn after keeps carrying them.

` +
      `Compacting summarizes the earlier turns once, so from then on each request carries ~${fmtK(advice.afterCompactTokens)} tokens instead.`;

  return (
    <div className={`cache-switch-bar ${switched ? "is-switch" : "is-idle"}`} title={tooltip} role="status">
      <span className="cache-switch-bar__badge">
        <Snowflake size={14} />
      </span>
      <span className="cache-switch-bar__text">
        <span className="cache-switch-bar__title">{switched ? "Cold cache on the new model" : "Prompt cache went cold"}</span>
        <span className="cache-switch-bar__sub">
          {switched ? (
            <>
              <span className="cache-switch-bar__chip">{last?.model}</span>
              <ArrowRight size={10} className="cache-switch-bar__sub-arrow" />
              <span className="cache-switch-bar__chip cache-switch-bar__chip--to">{toName}</span>
              <span className="cache-switch-bar__sep">·</span>
              next message re-reads all {fmtK(advice.contextTokens)} uncached
            </>
          ) : (
            <>
              <span className="cache-switch-bar__chip">
                idle {idleMin}m
              </span>
              <span className="cache-switch-bar__sep">·</span>
              cache lasts {CACHE_TTL_MS / 60_000}m — next message re-reads all {fmtK(advice.contextTokens)} uncached
            </>
          )}
        </span>
      </span>
      <TokenDelta before={advice.contextTokens} after={advice.afterCompactTokens} />
      <button
        className="cache-switch-bar__btn"
        onClick={() => void compactFirst()}
        disabled={busyElsewhere}
        title={busyElsewhere ? "Another session is compacting" : `Summarize earlier turns now and save ~${fmtK(advice.savedTokens)} tokens per message`}
      >
        <Minimize2 size={11} />
        Compact · −{fmtK(advice.savedTokens)}
      </button>
      <button
        className="cache-switch-bar__btn cache-switch-bar__btn--ghost"
        onClick={dismiss}
        title={switched ? "Keep the full history on the new model" : "Keep the full history"}
      >
        <X size={12} />
      </button>
    </div>
  );
};
