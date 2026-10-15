import React, { useEffect, useMemo, useState } from "react";
import { Coins, Cpu, Layers, Zap, X } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useSessionStore } from "../store/session-store.ts";
import { formatCost, formatTokens } from "../lib/format.ts";

export const UsagePanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { stats, activeProject, activeKey, allSessions } = useSessionStore(
    useShallow((s) => ({
      stats: s.stats,
      activeProject: s.activeProject,
      activeKey: s.activeKey,
      allSessions: s.allSessions,
    })),
  );

  const [scope, setScope] = useState<"project" | "global">("project");
  const [timeRange, setTimeRange] = useState<"today" | "7d" | "30d" | "all">("all");
  const [jevUsage, setJevUsage] = useState<{
    callsToday: number;
    maxCalls: number;
    sessionTokens: number;
    sessionCost: number;
    overallCost: number;
  }>({
    callsToday: 0,
    maxCalls: 500,
    sessionTokens: 0,
    sessionCost: 0,
    overallCost: 0,
  });

  useEffect(() => {
    let cancelled = false;
    const loadJev = async () => {
      try {
        const records = (await (window.studio as any).modulesInvoke?.("jev", "getUsage", {})) as any[];
        if (cancelled || !Array.isArray(records)) return;

        const now = Date.now();
        const oneDay = 24 * 60 * 60 * 1000;
        const todayStart = new Date().setHours(0, 0, 0, 0);

        const todayRecords = records.filter((r) => r.ts >= todayStart);
        const callsToday = todayRecords.length;

        // Session Jev records
        const sessionRecords = activeKey
          ? records.filter((r) => r.sessionId === activeKey || (r.cwd && activeProject?.path && r.cwd.startsWith(activeProject.path)))
          : [];
        const sessionTokens = sessionRecords.reduce((sum, r) => sum + (r.inputTokens || 0) + (r.outputTokens || 0), 0);
        const sessionCost = (sessionTokens / 1_000_000) * 0.042;

        // Overall Jev cost filtered
        const overallTokens = records.reduce((sum, r) => {
          if (timeRange === "today" && r.ts < todayStart) return sum;
          if (timeRange === "7d" && r.ts < now - 7 * oneDay) return sum;
          if (timeRange === "30d" && r.ts < now - 30 * oneDay) return sum;
          if (scope === "project" && activeProject?.path && (!r.cwd || !r.cwd.startsWith(activeProject.path))) return sum;
          return sum + (r.inputTokens || 0) + (r.outputTokens || 0);
        }, 0);
        const overallCost = (overallTokens / 1_000_000) * 0.042;

        setJevUsage({
          callsToday,
          maxCalls: 500,
          sessionTokens,
          sessionCost,
          overallCost,
        });
      } catch {
        // Jev module might be disabled or not configured
      }
    };

    void loadJev();
    return () => {
      cancelled = true;
    };
  }, [activeKey, activeProject, scope, timeRange]);

  const historicalLlmCost = useMemo(() => {
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    const todayStart = new Date().setHours(0, 0, 0, 0);

    const filtered = allSessions.filter((s) => {
      if (scope === "project" && s.projectId !== activeProject?.id) return false;
      const mod = new Date(s.modified).getTime();
      if (timeRange === "today" && mod < todayStart) return false;
      if (timeRange === "7d" && mod < now - 7 * oneDay) return false;
      if (timeRange === "30d" && mod < now - 30 * oneDay) return false;
      return true;
    });

    // Approximate cost from message counts if detailed cost cache is absent
    const totalMessages = filtered.reduce((sum, s) => sum + (s.messageCount || 0), 0);
    return (stats?.cost ?? 0) + totalMessages * 0.003;
  }, [allSessions, activeProject, scope, timeRange, stats]);

  const totalFilteredCost = historicalLlmCost + jevUsage.overallCost;

  return (
    <div className="usage-panel">
      <div className="usage-panel__header">
        <div className="usage-panel__title-row">
          <div className="usage-panel__title">
            <Coins size={14} />
            <span>Usage & Cost Breakdown</span>
          </div>
          <button type="button" className="usage-panel__close-btn" onClick={onClose} title="Close panel">
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="usage-panel__body ui-scroll">
        {/* Section 1: Active Session Detail */}
        <div className="usage-panel__section">
          <div className="usage-panel__section-title">
            <Cpu size={12} />
            <span>Active Session</span>
          </div>
          {stats ? (
            <div className="usage-panel__card">
              <div className="usage-panel__stat-row usage-panel__stat-row--hero">
                <span className="usage-panel__label">Session LLM Cost</span>
                <span className="usage-panel__value usage-panel__value--hero mono">
                  {formatCost(stats.cost)}
                </span>
              </div>
              <div className="usage-panel__divider" />
              <div className="usage-panel__grid">
                <div className="usage-panel__stat-col">
                  <span className="usage-panel__label">Input Tokens</span>
                  <span className="usage-panel__value mono">{formatTokens(stats.tokens.input)}</span>
                </div>
                <div className="usage-panel__stat-col">
                  <span className="usage-panel__label">Output Tokens</span>
                  <span className="usage-panel__value mono">{formatTokens(stats.tokens.output)}</span>
                </div>
                <div className="usage-panel__stat-col">
                  <span className="usage-panel__label">Cache Read</span>
                  <span className="usage-panel__value mono">{formatTokens(stats.tokens.cacheRead)}</span>
                </div>
                <div className="usage-panel__stat-col">
                  <span className="usage-panel__label">Cache Write</span>
                  <span className="usage-panel__value mono">{formatTokens(stats.tokens.cacheWrite)}</span>
                </div>
              </div>
              <div className="usage-panel__divider" />
              <div className="usage-panel__stat-row">
                <span className="usage-panel__label">Assistant Turns</span>
                <span className="usage-panel__value">{stats.assistantMessages}</span>
              </div>
              <div className="usage-panel__stat-row">
                <span className="usage-panel__label">Tool Calls</span>
                <span className="usage-panel__value">{stats.toolCalls}</span>
              </div>
              {stats.contextUsage?.percent != null && (
                <div className="usage-panel__stat-row">
                  <span className="usage-panel__label">Context Window</span>
                  <span className="usage-panel__value">
                    {Math.round(stats.contextUsage.percent)}% ({formatTokens(stats.contextUsage.tokens ?? 0)})
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="usage-panel__card usage-panel__card--empty">
              <span>No live session stats yet.</span>
            </div>
          )}
        </div>

        {/* Section 2: Jev Usage */}
        <div className="usage-panel__section">
          <div className="usage-panel__section-title">
            <Zap size={12} />
            <span>Jev Classifier Usage</span>
          </div>
          <div className="usage-panel__card">
            <div className="usage-panel__stat-row">
              <span className="usage-panel__label">Today's Quota</span>
              <span className="usage-panel__value">
                {jevUsage.callsToday} / {jevUsage.maxCalls} calls ({jevUsage.maxCalls - jevUsage.callsToday} remaining)
              </span>
            </div>
            <div className="usage-panel__meter-bar">
              <div
                className="usage-panel__meter-fill"
                style={{ width: `${Math.min(100, (jevUsage.callsToday / jevUsage.maxCalls) * 100)}%` }}
              />
            </div>
            <div className="usage-panel__divider" />
            <div className="usage-panel__stat-row">
              <span className="usage-panel__label">Session Jev Cost</span>
              <span className="usage-panel__value mono">{formatCost(jevUsage.sessionCost)}</span>
            </div>
            <div className="usage-panel__stat-row">
              <span className="usage-panel__label">Session Jev Tokens</span>
              <span className="usage-panel__value mono">{formatTokens(jevUsage.sessionTokens)}</span>
            </div>
          </div>
        </div>

        {/* Section 3: Overall Costs */}
        <div className="usage-panel__section">
          <div className="usage-panel__section-title">
            <Layers size={12} />
            <span>Historical & Total Costs</span>
          </div>
          <div className="usage-panel__filters">
            <div className="usage-panel__filter-group">
              <button
                type="button"
                className={`usage-panel__pill${scope === "project" ? " is-active" : ""}`}
                onClick={() => setScope("project")}
              >
                Project
              </button>
              <button
                type="button"
                className={`usage-panel__pill${scope === "global" ? " is-active" : ""}`}
                onClick={() => setScope("global")}
              >
                All Projects
              </button>
            </div>
            <div className="usage-panel__filter-group">
              {(["today", "7d", "30d", "all"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  className={`usage-panel__pill${timeRange === r ? " is-active" : ""}`}
                  onClick={() => setTimeRange(r)}
                >
                  {r.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="usage-panel__card">
            <div className="usage-panel__stat-row usage-panel__stat-row--hero">
              <span className="usage-panel__label">Total Estimated Cost</span>
              <span className="usage-panel__value usage-panel__value--hero mono">
                {formatCost(totalFilteredCost)}
              </span>
            </div>
            <div className="usage-panel__divider" />
            <div className="usage-panel__stat-row">
              <span className="usage-panel__label">LLM Spend</span>
              <span className="usage-panel__value mono">{formatCost(historicalLlmCost)}</span>
            </div>
            <div className="usage-panel__stat-row">
              <span className="usage-panel__label">Jev Classifier Spend</span>
              <span className="usage-panel__value mono">{formatCost(jevUsage.overallCost)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
