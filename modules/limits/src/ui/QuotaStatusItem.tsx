import React, { useMemo } from "react";
import { createPortal } from "react-dom";
import { Gauge, RefreshCw, X } from "lucide-react";
import type { ModuleHost } from "@hive/module-sdk/renderer";
import { formatAgo, formatDuration } from "@hive/module-sdk/format";
import { useLimits, useNow } from "./limits-store.ts";
import { ProviderQuotaCard, usageTone } from "./quota-ui.tsx";
import { useHoverPopover } from "./useHoverPopover.ts";
import { buildMeters } from "./meters.ts";

const SHORT: Record<string, string> = { anthropic: "Claude", antigravity: "AGY", "google-antigravity": "AGY", "openai-codex": "Codex" };
/** Antigravity quota pools: Gemini models vs. third-party (Claude + GPT-OSS) models. */
const POOL_LABEL: Record<string, string> = { Gemini: "Gemini", "Claude·GPT": "Claude/GPT" };
const TONE_COLOR = { ok: "var(--success)", warn: "var(--warning)", danger: "var(--danger)" } as const;

/** One thin track; the 5h bar sits above the 7d bar so a subscription costs ~one icon + 28px + a number. */
const Track: React.FC<{ used?: number }> = ({ used }) => (
  <span className="sb-quota__track">
    {used !== undefined && <i style={{ width: `${Math.min(100, Math.max(4, used))}%`, background: TONE_COLOR[usageTone(used)] }} />}
  </span>
);

/** Status-bar meters + the hover/pin popover with full window details. */
export const QuotaStatusItem: React.FC<{ host: ModuleHost }> = ({ host }) => {
  const quota = useLimits((s) => s.quota);
  const quotaLoading = useLimits((s) => s.loading);
  const refreshQuota = useLimits((s) => s.refresh);
  const now = useNow(30_000);
  const quotaPop = useHoverPopover();
  const ProviderIcon = host.ui.ProviderIcon;

  const model = host.hooks.useActiveSession().model;
  const meters = useMemo(
    () => buildMeters(quota?.providers ?? [], model).map((m) => ({ ...m, label: (SHORT[m.providerId] ?? m.providerId) + (m.pool ? ` ${m.pool}` : "") })),
    [quota, model?.provider, model?.id],
  );

  const exhausted = useMemo(
    () =>
      meters
        .map((m) => ({ label: m.label, pct: Math.max(m.w5?.usedPercent ?? 0, m.wk?.usedPercent ?? 0), active: m.active }))
        .filter((m) => m.pct >= 95 && m.active !== false)
        .sort((a, b) => b.pct - a.pct)[0],
    [meters],
  );

  const subscriptions = useMemo(() => (quota?.providers ?? []).filter((p) => p.status !== "unsupported"), [quota]);

  return (
    <>
      {meters.length > 0 && (
        <button
          ref={quotaPop.btnRef}
          className={`sb-quota${quotaPop.open ? " is-active" : ""}`}
          onClick={quotaPop.onClick}
          onMouseEnter={quotaPop.onEnter}
          onMouseLeave={quotaPop.onLeave}
          onFocus={quotaPop.onEnter}
          onBlur={quotaPop.onLeave}
          title="Subscription limits — hover for full window details · Click to pin details"
          aria-haspopup="dialog"
          aria-expanded={quotaPop.open}
        >
          {meters.map((m) => {
            const used5 = m.w5?.usedPercent;
            const usedWk = m.wk?.usedPercent;
            const worst = Math.max(used5 ?? 0, usedWk ?? 0);
            const tone = usageTone(worst);
            const detail = [used5 !== undefined && `5h ${Math.round(used5)}%`, usedWk !== undefined && `7d ${Math.round(usedWk)}%`].filter(Boolean).join(" · ");
            const resetAt = (used5 !== undefined ? m.w5?.resetsAt : undefined) ?? m.wk?.resetsAt;
            const poolName = m.pool ? (POOL_LABEL[m.pool] ?? m.pool) : undefined;
            const resets = resetAt ? `, resets in ${formatDuration(resetAt - now)}` : "";
            const tip = poolName
              ? `Quota pool: ${poolName} (${m.label}) — ${Math.round(worst)}% used${resets} · ${detail}${m.active === true ? " (active model)" : ""}`
              : `${m.label} — ${Math.round(worst)}% used${resets} · ${detail}`;
            return (
              <span
                key={m.key}
                className={`sb-quota__item${m.active === true ? " is-active-pool" : ""}${m.active === false ? " is-idle-pool" : ""}`}
                title={tip}
              >
                <ProviderIcon provider={m.providerId} size={12} />
                {m.pool && <span className="sb-quota__pool">{POOL_LABEL[m.pool] ?? m.pool}</span>}
                <span className="sb-quota__tracks" aria-hidden>
                  <Track used={used5} />
                  <Track used={usedWk} />
                </span>
                <span className={`sb-quota__pct sb-quota__pct--${tone} mono`}>{Math.round(worst)}%</span>
              </span>
            );
          })}
        </button>
      )}

      {quotaPop.open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="quota-popover"
            style={{ bottom: quotaPop.pos.bottom, right: quotaPop.pos.right }}
            onMouseEnter={quotaPop.onEnter}
            onMouseLeave={quotaPop.onLeave}
            role="dialog"
            aria-label="Subscription limits"
          >
            <div className="quota-popover__head">
              <div className="quota-popover__title">
                <Gauge size={14} /> Subscription limits
                {quotaPop.pinned && <span className="quota-popover__pin-hint">(pinned)</span>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button
                  className="ui-btn ui-btn--sm ui-btn--ghost ui-btn--icon"
                  onClick={() => void refreshQuota(true)}
                  title="Refresh now"
                  disabled={quotaLoading}
                >
                  <RefreshCw size={12} className={quotaLoading ? "spin" : undefined} />
                </button>
                {quotaPop.pinned && (
                  <button
                    className="ui-btn ui-btn--sm ui-btn--ghost ui-btn--icon"
                    onClick={quotaPop.close}
                    title="Close popover (Esc)"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>

            {exhausted && (
              <div className="quota-popover__exhausted" role="alert">
                <span>
                  {exhausted.label} quota is {Math.round(exhausted.pct) >= 100 ? "exhausted" : `at ${Math.round(exhausted.pct)}%`} — switch model to keep working.
                </span>
                <button
                  className="ui-btn ui-btn--sm"
                  onClick={() => {
                    quotaPop.close();
                    host.settings.open("models");
                  }}
                >
                  Change model…
                </button>
              </div>
            )}

            <div className="quota-popover__body ui-scroll">
              {subscriptions.length === 0 ? (
                <div className="ui-empty" style={{ padding: "16px 8px" }}>
                  <Gauge size={20} />
                  <div>No subscription accounts connected</div>
                </div>
              ) : (
                subscriptions.map((p) => <ProviderQuotaCard key={p.providerId} provider={p} now={now} />)
              )}
            </div>

            {quota && (
              <div className="quota-popover__foot">
                Updated {formatAgo(quota.fetchedAt, now)} · auto-refreshes every 2 min
              </div>
            )}
          </div>,
          document.body,
        )}
    </>
  );
};
