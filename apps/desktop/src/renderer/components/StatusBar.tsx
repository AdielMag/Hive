/** Bottom status bar on the window frame: Pi version, run state, extension statuses, live quota meters. */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BarChart3, Gauge, RefreshCw, X } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { parseAnsi } from "@hive/pi-adapter";
import { useSessionStore } from "../store/session-store.ts";
import { useInsights, useNow, useQuotaPolling } from "../features/insights/insights-store.ts";
import { ProviderQuotaCard, usageTone } from "../features/insights/quota-ui.tsx";
import { formatAgo, formatCost } from "../lib/format.ts";

const SHORT: Record<string, string> = { anthropic: "Claude", antigravity: "AGY", "openai-codex": "Codex" };
const TONE_COLOR = { ok: "#3fb27f", warn: "#e0a43a", danger: "#e5534b" } as const;

/** Extension statuses that duplicate the built-in quota meters. */
const HIDDEN_STATUS = new Set(["agy-sub", "quota", "pi-quota-status"]);

export const StatusBar: React.FC = () => {
  useQuotaPolling();
  const { bootstrap, extensionStatus, running, cost } = useSessionStore(
    useShallow((s) => ({ bootstrap: s.bootstrap, extensionStatus: s.extensionStatus, running: s.transcript.running, cost: s.stats?.cost ?? 0 })),
  );
  const quota = useInsights((s) => s.quota);
  const quotaLoading = useInsights((s) => s.quotaLoading);
  const refreshQuota = useInsights((s) => s.refreshQuota);
  const openUsageTab = useSessionStore((s) => s.openUsageTab);
  const piVersion = bootstrap?.pi.ok ? bootstrap.pi.info.version : "not found";
  const now = useNow(30_000);

  const [popoverOpen, setPopoverOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [popoverPos, setPopoverPos] = useState<{ bottom: number; right: number }>({ bottom: 32, right: 16 });

  const meterBtnRef = useRef<HTMLButtonElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const subscriptions = useMemo(
    () => (quota?.providers ?? []).filter((p) => p.status !== "unsupported"),
    [quota],
  );

  const updatePopoverPos = () => {
    if (meterBtnRef.current) {
      const rect = meterBtnRef.current.getBoundingClientRect();
      const bottom = Math.max(32, window.innerHeight - rect.top + 8);
      const right = Math.max(16, window.innerWidth - rect.right);
      setPopoverPos({ bottom, right });
    }
  };

  const handleMouseEnter = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    updatePopoverPos();
    setPopoverOpen(true);
  };

  const handleMouseLeave = () => {
    if (pinned) return;
    closeTimerRef.current = setTimeout(() => {
      setPopoverOpen(false);
    }, 150);
  };

  const handleClick = () => {
    updatePopoverPos();
    if (!popoverOpen) {
      setPopoverOpen(true);
      setPinned(true);
    } else {
      setPinned((prev) => !prev);
    }
  };

  // Close on Escape or click outside when pinned
  useEffect(() => {
    if (!popoverOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPinned(false);
        setPopoverOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [popoverOpen]);

  return (
    <footer className="statusbar">
      <span className="statusbar__item">pi {piVersion}</span>
      {running && (
        <span className="statusbar__item statusbar__running">
          <span className="pulse-dot" /> running
        </span>
      )}

      <div className="statusbar__ext">
        {Object.entries(extensionStatus)
          .filter(([key]) => !HIDDEN_STATUS.has(key))
          .map(([key, text]) => (
            <span key={key} className="statusbar__item">
              {parseAnsi(text).map((seg, i) => (
                <span key={i} style={{ color: seg.style.color, fontWeight: seg.style.bold ? 600 : undefined }}>
                  {seg.text}
                </span>
              ))}
            </span>
          ))}
      </div>

      {meters.length > 0 && (
        <button
          ref={meterBtnRef}
          className={`sb-quota${popoverOpen ? " is-active" : ""}`}
          onClick={handleClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onFocus={handleMouseEnter}
          onBlur={handleMouseLeave}
          title="Subscription limits — hover or click for full window details"
          aria-haspopup="dialog"
          aria-expanded={popoverOpen}
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

      {cost > 0 && (
        <span className="statusbar__item mono" title="Cost of this session">
          {formatCost(cost)}
        </span>
      )}
      <button className="statusbar__btn" onClick={openUsageTab} title="Usage analytics">
        <BarChart3 size={12} />
      </button>

      {popoverOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="quota-popover"
            style={{ bottom: popoverPos.bottom, right: popoverPos.right }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            role="dialog"
            aria-label="Subscription limits"
          >
            <div className="quota-popover__head">
              <div className="quota-popover__title">
                <Gauge size={14} /> Subscription limits
                {pinned && <span className="quota-popover__pin-hint">(pinned)</span>}
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
                {pinned && (
                  <button
                    className="ui-btn ui-btn--sm ui-btn--ghost ui-btn--icon"
                    onClick={() => {
                      setPinned(false);
                      setPopoverOpen(false);
                    }}
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
    </footer>
  );
};

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
