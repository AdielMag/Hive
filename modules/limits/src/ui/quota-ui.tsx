/**
 * Reusable quota cards and window meters used by the status-bar hover popover
 * and account insights.
 */
import React from "react";
import { Clock } from "lucide-react";
import type { ProviderQuota, QuotaWindow } from "@hive/protocol";
import { formatDuration, formatResetAt } from "@hive/module-sdk/format";
import { limitsHost } from "./limits-host.ts";

export function usageTone(used: number): "ok" | "warn" | "danger" {
  return used >= 90 ? "danger" : used >= 70 ? "warn" : "ok";
}

export const ProviderQuotaCard: React.FC<{ provider: ProviderQuota; now: number }> = ({ provider, now }) => {
  const ProviderIcon = limitsHost().ui.ProviderIcon;
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

export const WindowMeter: React.FC<{ window: QuotaWindow; now: number }> = ({ window: w, now }) => {
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
