import React, { useMemo } from "react";
import { createPortal } from "react-dom";
import { Gauge, RefreshCw, X } from "lucide-react";
import type { ModuleHost } from "@hive/module-sdk/renderer";
import { formatAgo } from "@hive/module-sdk/format";
import { useLimits, useNow } from "./limits-store.ts";
import { ProviderQuotaCard, usageTone } from "./quota-ui.tsx";
import { useHoverPopover } from "./useHoverPopover.ts";

const SHORT: Record<string, string> = { anthropic: "Claude", antigravity: "AGY", "openai-codex": "Codex" };
const TONE_COLOR = { ok: "#3fb27f", warn: "#e0a43a", danger: "#e5534b" } as const;

const Mini: React.FC<{ label: string; used: number }> = ({ label, used }) => {
  const tone = usageTone(used);
  return (
    <span className="sb-quota__item" title={`${label}: ${Math.round(used)}% used`}>
      <span className="sb-quota__mini">
        <i style={{ width: `${Math.max(4, used)}%`, background: TONE_COLOR[tone] }} />
      </span>
      <span className="mono" style={{ opacity: 0.8 }}>
        {label} {Math.round(used)}%
      </span>
    </span>
  );
};

/** Status-bar meters + the hover/pin popover with full window details. */
export const QuotaStatusItem: React.FC<{ host: ModuleHost }> = () => {
  const quota = useLimits((s) => s.quota);
  const quotaLoading = useLimits((s) => s.loading);
  const refreshQuota = useLimits((s) => s.refresh);
  const now = useNow(30_000);
  const quotaPop = useHoverPopover();

  const meters = useMemo(
    () =>
      (quota?.providers ?? [])
        .filter((p) => p.status === "ok")
        .map((p) => {
          const windows = p.groups.flatMap((g) => g.windows);
          const w5 = windows.filter((w) => w.kind === "5h").sort((a, b) => b.usedPercent - a.usedPercent)[0];
          const wk = windows.filter((w) => w.kind === "weekly").sort((a, b) => b.usedPercent - a.usedPercent)[0];
          return { id: p.providerId, label: SHORT[p.providerId] ?? p.name, w5, wk };
        }),
    [quota],
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
          title="Subscription limits — hover or click for full window details"
          aria-haspopup="dialog"
          aria-expanded={quotaPop.open}
        >
          {meters.map((m) => (
            <span key={m.id} className="sb-quota__item">
              <span>{m.label}</span>
              {m.w5 && <Mini label="5h" used={m.w5.usedPercent} />}
              {m.wk && <Mini label="7d" used={m.wk.usedPercent} />}
            </span>
          ))}
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
