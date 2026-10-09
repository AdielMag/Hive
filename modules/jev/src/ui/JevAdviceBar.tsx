import React, { useEffect, useState } from "react";
import { Gauge, Loader2, X } from "lucide-react";
import type { ModuleHost } from "@hive/module-sdk/renderer";
import { JEV_COMPACT_KIND } from "../shared.ts";
import { decideTier, type CompactTier } from "../tiering.ts";
import { jevStore, useJev } from "./jev-store.ts";
import "./jev.css";

/** If Pi never reports the compaction ending, stop showing the spinner. */
const COMPACTING_TIMEOUT_MS = 120_000;

const fmtK = (n: number): string => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));

const LABEL: Record<Exclude<CompactTier, "silent">, string> = {
  notice: "Compact soon?",
  recommend: "Good time to compact",
  request: "Compact now",
};

export interface JevAdviceBarProps {
  host: ModuleHost;
  /** Session key of the active tab (passed by core's composer.above slot). */
  activeKey?: string | null;
}

export const JevAdviceBar: React.FC<JevAdviceBarProps> = ({ host, activeKey }) => {
  const { advice, dismissed, compacting } = useJev();
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);

  // Idle time drives the cache-cold signal, so re-evaluate while advice is on screen.
  const hasAdvice = !!(activeKey && advice[activeKey]);
  useEffect(() => {
    if (!hasAdvice) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, [hasAdvice]);

  const startedAt = activeKey ? compacting[activeKey] : undefined;
  useEffect(() => {
    if (!activeKey || startedAt === undefined) return;
    const t = setTimeout(() => jevStore.stopCompacting(activeKey), Math.max(0, startedAt + COMPACTING_TIMEOUT_MS - Date.now()));
    return () => clearTimeout(t);
  }, [activeKey, startedAt]);

  // Funnel: the hint counts as shown once the bar is visible with a non-silent tier (logged once per advice entry).
  const current = activeKey ? advice[activeKey] : undefined;
  const visibleTier: CompactTier =
    activeKey && current && startedAt === undefined && dismissed[activeKey] !== current.entryId
      ? decideTier({ advice: current, idleMs: now - current.at, floorPct: 0 }).tier
      : "silent";
  useEffect(() => {
    if (activeKey && visibleTier !== "silent") jevStore.markShown(activeKey, visibleTier);
  }, [activeKey, current?.entryId, visibleTier]);

  if (!activeKey) return null;

  if (startedAt !== undefined) {
    return (
      <div className="jev-bar is-busy" role="status">
        <Loader2 size={13} className="jev-bar__icon jev-spin" />
        <span className="jev-bar__label">Compacting…</span>
        <span className="jev-bar__hint">Summarizing earlier turns</span>
      </div>
    );
  }

  const a = advice[activeKey];
  if (!a || dismissed[activeKey] === a.entryId) return null;
  const { tier, reasons } = decideTier({ advice: a, idleMs: now - a.at, floorPct: 0 });
  if (tier === "silent") return null;

  const compact = () => {
    setError(null);
    jevStore.requestCompact(activeKey);
    host.sessions.emitToBridge(activeKey, { kind: JEV_COMPACT_KIND }).catch((err: unknown) => {
      jevStore.stopCompacting(activeKey);
      setError(err instanceof Error ? err.message : String(err));
    });
  };

  const detail = `${Math.round(a.usagePct)}% of context (${fmtK(a.tokens)} / ${fmtK(a.contextWindow)})`;
  return (
    <div className={`jev-bar jev-bar--${tier}${error ? " is-error" : ""}`} role="status" title={`Jev: ${reasons.join("; ") || "context is getting full"}`}>
      <Gauge size={13} className="jev-bar__icon" />
      <span className="jev-bar__label">{LABEL[tier]}</span>
      <span className="jev-bar__hint">{error ?? `${detail}${reasons.length ? ` · ${reasons[0]}` : ""}`}</span>
      <button className="jev-bar__btn" onClick={compact} title="Summarize earlier turns now">
        Compact
      </button>
      <button className="jev-bar__btn jev-bar__btn--ghost" onClick={() => jevStore.dismiss(activeKey)} title="Dismiss">
        <X size={11} />
      </button>
    </div>
  );
};
