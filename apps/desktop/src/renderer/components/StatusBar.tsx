/** Bottom status bar on the window frame: Pi version, run state, extension statuses, live quota meters. */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Coins, ExternalLink, Volume2, VolumeX, X } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { parseAnsi } from "@hive/pi-adapter";
import { useSessionStore } from "../store/session-store.ts";
import { COMMANDS_BY_ID } from "../features/commands/registry.ts";
import { useContributions, useModules } from "../modules/registry.ts";
import { formatCost, formatTokens } from "../lib/format.ts";
import { useSoundStore } from "../store/sound-store.ts";

/** Hover-to-peek / click-to-pin popover anchored above a status bar button. */
function useHoverPopover() {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [pos, setPos] = useState<{ bottom: number; right: number }>({ bottom: 32, right: 16 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updatePos = () => {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    setPos({
      bottom: Math.max(32, window.innerHeight - rect.top + 8),
      right: Math.max(16, window.innerWidth - rect.right),
    });
  };
  const onEnter = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    updatePos();
    setOpen(true);
  };
  const onLeave = () => {
    if (pinned) return;
    closeTimerRef.current = setTimeout(() => setOpen(false), 150);
  };
  const onClick = () => {
    updatePos();
    if (!open) {
      setOpen(true);
      setPinned(true);
    } else {
      setPinned((prev) => !prev);
    }
  };
  const close = () => {
    setPinned(false);
    setOpen(false);
  };

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return { open, pinned, pos, btnRef, onEnter, onLeave, onClick, close };
}

export const StatusBar: React.FC = () => {
  // Modules that render their own version of an extension's status (e.g. limits meters) hide the duplicate.
  const barItems = useContributions("statusBar");
  const hiddenStatuses = useMemo(() => new Set(barItems.flatMap((i) => i.hideExtensionStatuses ?? [])), [barItems]);
  const { bootstrap, extensionStatus, running, stats, isSessionActive } = useSessionStore(
    useShallow((s) => ({
      bootstrap: s.bootstrap,
      extensionStatus: s.extensionStatus,
      running: s.transcript.running,
      stats: s.stats,
      isSessionActive: !!s.activeTabId && s.sessionActivity[s.activeTabId] === "running",
    })),
  );
  const isRunning = running || isSessionActive;
  const cost = stats?.cost ?? 0;
  const activeSessionPath = useSessionStore((s) => s.tabs.find((t) => t.id === s.activeTabId)?.sessionPath);
  const piVersion = bootstrap?.pi.ok ? bootstrap.pi.info.version : "not found";

  const costPop = useHoverPopover();
  const soundEnabled = useSoundStore((s) => s.enabled);
  const soundVolume = useSoundStore((s) => s.volume);
  const toggleMute = useSoundStore((s) => s.toggleMute);

  return (
    <footer className="statusbar">
      <span className="statusbar__item">pi {piVersion}</span>
      {isRunning && (
        <span className="statusbar__item statusbar__running">
          <span className="pulse-dot" /> running
        </span>
      )}

      <div className="statusbar__ext">
        {Object.entries(extensionStatus)
          .filter(([key]) => !hiddenStatuses.has(key))
          .map(([key, text]) => key === "mcp" ? <McpChip key={key} text={text} /> : (
            <span key={key} className="statusbar__item">
              {parseAnsi(text).map((seg, i) => (
                <span key={i} style={{ color: seg.style.color, fontWeight: seg.style.bold ? 600 : undefined }}>
                  {seg.text}
                </span>
              ))}
            </span>
          ))}
      </div>

      <ModuleStatusItems />

      <button
        className="statusbar__btn"
        onClick={toggleMute}
        title={soundEnabled ? `Sound effects: On (${Math.round(soundVolume * 100)}%) — Click to mute` : "Sound effects: Muted — Click to unmute"}
        aria-label={soundEnabled ? "Mute sounds" : "Unmute sounds"}
      >
        {soundEnabled ? <Volume2 size={12} /> : <VolumeX size={12} style={{ opacity: 0.6 }} />}
      </button>

      {cost > 0 && (
        <button
          ref={costPop.btnRef}
          className={`statusbar__btn mono${costPop.open ? " is-active" : ""}`}
          onClick={costPop.onClick}
          onMouseEnter={costPop.onEnter}
          onMouseLeave={costPop.onLeave}
          onFocus={costPop.onEnter}
          onBlur={costPop.onLeave}
          title="Cost of this session — hover or click for details"
          aria-haspopup="dialog"
          aria-expanded={costPop.open}
        >
          {formatCost(cost)}
        </button>
      )}
      {costPop.open &&
        stats &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="quota-popover quota-popover--cost"
            style={{ bottom: costPop.pos.bottom, right: costPop.pos.right }}
            onMouseEnter={costPop.onEnter}
            onMouseLeave={costPop.onLeave}
            role="dialog"
            aria-label="Session cost"
          >
            <div className="quota-popover__head">
              <div className="quota-popover__title">
                <Coins size={14} /> Session cost
                {costPop.pinned && <span className="quota-popover__pin-hint">(pinned)</span>}
              </div>
              {costPop.pinned && (
                <button
                  className="ui-btn ui-btn--sm ui-btn--ghost ui-btn--icon"
                  onClick={costPop.close}
                  title="Close popover (Esc)"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            <div className="quota-popover__body ui-scroll">
              <div className="sb-cost__total mono">{formatCost(stats.cost)}</div>
              <dl className="sb-cost__rows">
                <CostRow label="Input tokens" value={formatTokens(stats.tokens.input)} />
                <CostRow label="Output tokens" value={formatTokens(stats.tokens.output)} />
                <CostRow label="Cache read" value={formatTokens(stats.tokens.cacheRead)} />
                <CostRow label="Cache write" value={formatTokens(stats.tokens.cacheWrite)} />
                <CostRow label="Total tokens" value={formatTokens(stats.tokens.total)} strong />
                <CostRow label="Assistant turns" value={String(stats.assistantMessages)} />
                <CostRow label="Tool calls" value={String(stats.toolCalls)} />
                {stats.contextUsage?.percent != null && (
                  <CostRow
                    label="Context used"
                    value={`${Math.round(stats.contextUsage.percent)}% · ${formatTokens(stats.contextUsage.tokens ?? 0)} / ${formatTokens(stats.contextUsage.contextWindow)}`}
                  />
                )}
              </dl>
            </div>

            {COMMANDS_BY_ID.has("view.usage") && (
              <div className="quota-popover__foot">
                <button
                  className="ui-btn ui-btn--sm ui-btn--ghost"
                  disabled={!activeSessionPath}
                  onClick={() => {
                    costPop.close();
                    void COMMANDS_BY_ID.get("view.usage")?.run({ focusSession: activeSessionPath ?? null });
                  }}
                >
                  <ExternalLink size={12} /> Full usage breakdown
                </button>
              </div>
            )}
          </div>,
          document.body,
        )}
    </footer>
  );
};

/** Compact MCP indicator: "MCP 1" (or "MCP 1/2" once servers connect) with an explanatory tooltip. */
const McpChip: React.FC<{ text: string }> = ({ text }) => {
  const plain = parseAnsi(text).map((seg) => seg.text).join("");
  const enabled = Number(/(\d+)\s+servers?\s+enabled/.exec(plain)?.[1] ?? NaN);
  const connected = Number(/\((\d+) connected\)/.exec(plain)?.[1] ?? 0);
  if (!Number.isFinite(enabled)) {
    // Transient messages such as "connecting to x..." — show as-is, minus the emoji.
    return <span className="statusbar__item">{plain.replace("🔌", "").trim()}</span>;
  }
  const label = connected > 0 ? `MCP ${connected}/${enabled}` : `MCP ${enabled}`;
  const tip =
    `MCP (Model Context Protocol) servers give Pi extra tools.\n` +
    `${enabled} configured, ${connected} connected now (servers connect on first use).\n` +
    `Configured in ~/.pi/agent/mcp-adapter.json`;
  return (
    <span className="statusbar__item" title={tip} style={{ opacity: connected > 0 ? 1 : 0.7 }}>
      {label}
    </span>
  );
};

const CostRow: React.FC<{ label: string; value: string; strong?: boolean }> = ({ label, value, strong }) => (
  <div className={`sb-cost__row${strong ? " is-strong" : ""}`}>
    <dt>{label}</dt>
    <dd className="mono">{value}</dd>
  </div>
);

/** Status-bar items contributed by enabled modules. */
const ModuleStatusItems: React.FC = () => {
  const items = useContributions("statusBar");
  const loaded = useModules((s) => s.loaded);
  if (items.length === 0) return null;
  return (
    <>
      {items.map((item) => {
        const host = loaded[item.moduleId]?.host;
        const Item = item.component;
        return host ? <Item key={`${item.moduleId}:${item.id}`} host={host} /> : null;
      })}
    </>
  );
};
