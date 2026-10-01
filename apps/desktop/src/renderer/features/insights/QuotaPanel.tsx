/**
 * Subscription limits: every connected account's rolling 5-hour and weekly windows, how much is used,
 * and exactly when each one resets.
 */
import React from "react";
import { Clock, Gauge, RefreshCw, TriangleAlert } from "lucide-react";
import type { ProviderQuota, QuotaWindow } from "@pi-studio/protocol";
import { ProviderIcon } from "../../components/ProviderIcon.tsx";
import { formatAgo, formatDuration, formatResetAt } from "../../lib/format.ts";
import { useInsights, useNow, useQuotaPolling } from "./insights-store.ts";

export function usageTone(used: number): "ok" | "warn" | "danger" {
  return used >= 90 ? "danger" : used >= 70 ? "warn" : "ok";
}

export const QuotaPanel: React.FC = () => {
  useQuotaPolling();
  const quota = useInsights((s) => s.quota);
  const loading = useInsights((s) => s.quotaLoading);
  const error = useInsights((s) => s.quotaError);
  const refresh = useInsights((s) => s.refreshQuota);
  const now = useNow(30_000);

  const subscriptions = quota?.providers.filter((p) => p.status !== "unsupported") ?? [];
  const payg = quota?.providers.filter((p) => p.status === "unsupported") ?? [];

  return (
    <div className="insight-panel">
      <div className="ui-panel-header">
        <div className="ui-panel-title">
          <Gauge size={14} /> Subscription limits
        </div>
        <button className="ui-btn ui-btn--sm ui-btn--ghost ui-btn--icon" onClick={() => void refresh(true)} title="Refresh now" disabled={loading}>
          <RefreshCw size={13} className={loading ? "spin" : undefined} />
        </button>
      </div>

      <div className="insight-panel__body ui-scroll">
        {!quota && loading && (
          <>
            <div className="ui-skeleton" style={{ height: 150 }} />
            <div className="ui-skeleton" style={{ height: 110 }} />
          </>
        )}
        {error && !quota && (
          <div className="ui-empty">
            <TriangleAlert size={18} />
            <div>Couldn’t load limits</div>
            <div style={{ fontSize: 11 }}>{error}</div>
          </div>
        )}
        {quota && subscriptions.length === 0 && (
          <div className="ui-empty">
            <Gauge size={20} />
            <div>No subscription accounts connected</div>
            <div style={{ fontSize: 11 }}>Sign in to Claude, Antigravity or ChatGPT in Settings → AI Providers.</div>
          </div>
        )}

        {subscriptions.map((p) => (
          <ProviderCard key={p.providerId} provider={p} now={now} />
        ))}

        {payg.length > 0 && (
          <div className="quota-payg">
            <span className="ui-section-label">Pay-as-you-go</span>
            {payg.map((p) => (
              <div key={p.providerId} className="quota-payg__row">
                <ProviderIcon provider={p.providerId} size={14} />
                <span>{p.name}</span>
                <span className="quota-payg__hint">no rate windows</span>
              </div>
            ))}
          </div>
        )}

        {quota && <div className="insight-panel__foot">Updated {formatAgo(quota.fetchedAt, now)} · auto-refreshes every 2 min</div>}
      </div>
    </div>
  );
};

const ProviderCard: React.FC<{ provider: ProviderQuota; now: number }> = ({ provider, now }) => {
  const worst = Math.max(0, ...provider.groups.flatMap((g) => g.windows.map((w) => w.usedPercent)));
  return (
    <div className="quota-card ui-card">
      <div className="quota-card__head">
        <div className="quota-card__logo">
          <ProviderIcon provider={provider.providerId} size={16} />
        </div>
        <div className="quota-card__title">
          <div className="quota-card__name">{provider.name}</div>
          {provider.account && <div className="quota-card__account">{provider.account}</div>}
        </div>
        {provider.status === "error" ? (
          <span className="ui-chip ui-chip--danger" title={provider.error}>
            error
          </span>
        ) : provider.source === "cache" ? (
          <span className="ui-chip ui-chip--warn" title={`Live request failed (${provider.error}). Showing last known values.`}>
            cached
          </span>
        ) : (
          <span className={`ui-chip ui-chip--${usageTone(worst)}`}>{worst >= 90 ? "near limit" : "live"}</span>
        )}
      </div>

      {provider.status === "error" && <div className="quota-card__error">{provider.error}</div>}

      {provider.groups.map((g) => (
        <div key={g.id} className="quota-group">
          {provider.groups.length > 1 && (
            <div className="quota-group__label" title={g.description}>
              {g.label}
            </div>
          )}
          {g.windows.map((w) => (
            <WindowMeter key={w.id} window={w} now={now} />
          ))}
        </div>
      ))}
    </div>
  );
};

const WindowMeter: React.FC<{ window: QuotaWindow; now: number }> = ({ window: w, now }) => {
  const tone = usageTone(w.usedPercent);
  const left = 100 - w.usedPercent;
  return (
    <div className="quota-meter">
      <div className="quota-meter__top">
        <span className="quota-meter__label">{w.label}</span>
        <span className={`quota-meter__pct is-${tone}`}>
          {Math.round(w.usedPercent)}% <span>used</span>
        </span>
      </div>
      <div className="quota-meter__bar" role="meter" aria-valuenow={Math.round(w.usedPercent)} aria-valuemin={0} aria-valuemax={100} aria-label={`${w.label} usage`}>
        <div className={`quota-meter__fill is-${tone}`} style={{ width: `${Math.max(1.5, w.usedPercent)}%` }} />
      </div>
      <div className="quota-meter__sub">
        <span>{Math.round(left)}% left</span>
        {w.resetsAt ? (
          <span className="quota-meter__reset" title={new Date(w.resetsAt).toLocaleString()}>
            <Clock size={11} /> resets in <strong>{formatDuration(w.resetsAt - now)}</strong> · {formatResetAt(w.resetsAt, now)}
          </span>
        ) : (
          <span className="quota-meter__reset">reset time unknown</span>
        )}
      </div>
    </div>
  );
};
