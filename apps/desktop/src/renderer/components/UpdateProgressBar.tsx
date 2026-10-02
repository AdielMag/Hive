/** Progress bar + status line for an in-flight app update (Settings → Updates). */
import React from "react";
import { AlertCircle, CheckCircle2, Download, ExternalLink, Loader2 } from "lucide-react";
import type { UpdateProgress } from "../store/update-store.ts";

const mb = (bytes: number) => `${(bytes / 1_048_576).toFixed(1)} MB`;

/** 0–100, or null when the total size is unknown (indeterminate). */
export function updatePercent(p: UpdateProgress): number | null {
  if (p.phase === "launching") return 100;
  if (!p.total) return null;
  return Math.min(100, Math.round((p.received / p.total) * 100));
}

export const UpdateProgressBar: React.FC<{ progress: UpdateProgress }> = ({ progress }) => {
  const pct = updatePercent(progress);
  const { phase } = progress;

  let icon: React.ReactNode;
  let label: string;
  if (phase === "downloading") {
    icon = <Download size={13} className="update-progress__bounce" />;
    label =
      progress.received === 0
        ? "Connecting to GitHub…"
        : progress.total
          ? `Downloading… ${mb(progress.received)} of ${mb(progress.total)}`
          : `Downloading… ${mb(progress.received)}`;
  } else if (phase === "launching") {
    icon = <Loader2 size={13} className="spin" />;
    label = progress.message ?? "Launching installer… Hive will restart";
  } else if (phase === "browser") {
    icon = <ExternalLink size={13} />;
    label = progress.message ?? "Opened download in your browser";
  } else {
    icon = <AlertCircle size={13} />;
    label = progress.message ?? "Update failed";
  }

  const showBar = phase === "downloading" || phase === "launching";
  return (
    <div className={`update-progress update-progress--${phase}`} role="status" aria-live="polite">
      <div className="update-progress__row">
        <span className="update-progress__label">
          {icon} {label}
        </span>
        {showBar && <span className="update-progress__pct">{phase === "launching" ? <CheckCircle2 size={13} /> : pct != null ? `${pct}%` : ""}</span>}
      </div>
      {showBar && (
        <div
          className={`update-progress__track${pct == null ? " is-indeterminate" : ""}`}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct ?? undefined}
        >
          <div className="update-progress__fill" style={pct != null ? { width: `${Math.max(pct, 2)}%` } : undefined} />
        </div>
      )}
    </div>
  );
};
