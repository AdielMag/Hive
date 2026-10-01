/** Bottom status bar on the window frame: Pi version, run state, extension statuses, live quota meters. */
import React, { useMemo } from "react";
import { BarChart3 } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { parseAnsi } from "@pi-studio/pi-adapter";
import { useSessionStore } from "../store/session-store.ts";
import { useUi } from "../store/ui-store.ts";
import { useInsights, useQuotaPolling } from "../features/insights/insights-store.ts";
import { usageTone } from "../features/insights/QuotaPanel.tsx";
import { formatCost } from "../lib/format.ts";

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
  const toggleRight = useUi((s) => s.toggleRight);
  const openUsageTab = useSessionStore((s) => s.openUsageTab);
  const piVersion = bootstrap?.pi.ok ? bootstrap.pi.info.version : "not found";

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
        <button className="sb-quota" onClick={() => toggleRight("limits")} title="Subscription limits — click for details">
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
