import React, { useMemo } from "react";
import {
  Coins,
  Cpu,
  Layers,
  Zap,
  X,
  Activity,
  BarChart2,
  ArrowRight,
  MessageSquare,
  Wrench,
  Bot,
  Sparkles,
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useSessionStore } from "../store/session-store.ts";
import { formatCost, formatTokens } from "../lib/format.ts";
import { ProviderIcon } from "./ProviderIcon.tsx";
import { COMMANDS_BY_ID } from "../features/commands/registry.ts";
import type { SessionStats } from "@hive/protocol";

export interface TokenMetrics {
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  inputPct: number;
  outputPct: number;
  cacheReadPct: number;
  cacheWritePct: number;
  cacheHitRate: number;
  contextTokens: number;
  contextWindow: number;
  contextPercent: number;
  remainingTokens: number;
  isHighContext: boolean;
  isCriticalContext: boolean;
}

export function computeTokenMetrics(
  stats: SessionStats | null,
  fallbackContextWindow = 0,
): TokenMetrics {
  const tokens = stats?.tokens;
  const inputTokens = tokens?.input ?? 0;
  const outputTokens = tokens?.output ?? 0;
  const cacheReadTokens = tokens?.cacheRead ?? 0;
  const cacheWriteTokens = tokens?.cacheWrite ?? 0;
  const totalTokens =
    tokens?.total || inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens;

  const inputPct = totalTokens > 0 ? (inputTokens / totalTokens) * 100 : 0;
  const outputPct = totalTokens > 0 ? (outputTokens / totalTokens) * 100 : 0;
  const cacheReadPct = totalTokens > 0 ? (cacheReadTokens / totalTokens) * 100 : 0;
  const cacheWritePct = totalTokens > 0 ? (cacheWriteTokens / totalTokens) * 100 : 0;

  const promptTokens = inputTokens + cacheReadTokens + cacheWriteTokens;
  const cacheHitRate = promptTokens > 0 ? (cacheReadTokens / promptTokens) * 100 : 0;

  const contextUsage = stats?.contextUsage;
  const contextTokens = contextUsage?.tokens ?? 0;
  const contextWindow = contextUsage?.contextWindow ?? fallbackContextWindow;
  const contextPercent =
    contextUsage?.percent != null
      ? Math.round(contextUsage.percent)
      : contextWindow > 0
        ? Math.round((contextTokens / contextWindow) * 100)
        : 0;
  const remainingTokens = Math.max(0, contextWindow - contextTokens);
  const isHighContext = contextPercent >= 80;
  const isCriticalContext = contextPercent >= 90;

  return {
    totalTokens,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    inputPct,
    outputPct,
    cacheReadPct,
    cacheWritePct,
    cacheHitRate,
    contextTokens,
    contextWindow,
    contextPercent,
    remainingTokens,
    isHighContext,
    isCriticalContext,
  };
}

export const UsagePanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { stats, selectedModel, activeTab, activeSessionPath } = useSessionStore(
    useShallow((s) => ({
      stats: s.stats,
      selectedModel: s.selectedModel,
      activeTab: s.tabs.find((t) => t.id === s.activeTabId),
      activeSessionPath: s.tabs.find((t) => t.id === s.activeTabId)?.sessionPath,
    })),
  );

  const {
    totalTokens,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    inputPct,
    outputPct,
    cacheReadPct,
    cacheWritePct,
    cacheHitRate,
    contextTokens,
    contextWindow,
    contextPercent,
    remainingTokens,
    isHighContext,
    isCriticalContext,
  } = useMemo(
    () => computeTokenMetrics(stats, selectedModel?.contextWindow ?? 0),
    [stats, selectedModel?.contextWindow],
  );

  return (
    <div className="usage-panel">
      {/* Header */}
      <div className="usage-panel__header">
        <div className="usage-panel__title-row">
          <div className="usage-panel__title">
            <Coins size={14} className="usage-panel__title-icon" />
            <span>Session Usage & Cost</span>
          </div>
          <button
            type="button"
            className="usage-panel__close-btn"
            onClick={onClose}
            title="Close panel"
          >
            <X size={14} />
          </button>
        </div>
        {activeTab?.title && (
          <div className="usage-panel__subtitle" title={activeTab.title}>
            {activeTab.title}
          </div>
        )}
      </div>

      <div className="usage-panel__body ui-scroll">
        {stats ? (
          <>
            {/* Section 1: Hero Cost Card */}
            <div className="usage-panel__card usage-panel__card--hero">
              <div className="usage-hero__top">
                <div className="usage-hero__label-row">
                  <span className="usage-hero__label">Session Cost</span>
                  <span
                    className={`usage-hero__chip ${stats.cost === 0 ? "is-free" : "is-active"}`}
                  >
                    {stats.cost === 0 ? "No Charge" : "Live Session"}
                  </span>
                </div>
                <div className="usage-hero__amount mono">
                  {formatCost(stats.cost)}
                </div>
              </div>
              <div className="usage-hero__pills">
                <div className="usage-hero__pill">
                  <span className="usage-hero__pill-num mono">
                    {formatTokens(totalTokens)}
                  </span>
                  <span className="usage-hero__pill-label">Total Tokens</span>
                </div>
                <div className="usage-hero__pill-sep" />
                <div className="usage-hero__pill">
                  <span className="usage-hero__pill-num mono">
                    {stats.assistantMessages}
                  </span>
                  <span className="usage-hero__pill-label">Turns</span>
                </div>
                <div className="usage-hero__pill-sep" />
                <div className="usage-hero__pill">
                  <span className="usage-hero__pill-num mono">
                    {stats.toolCalls}
                  </span>
                  <span className="usage-hero__pill-label">Tool Calls</span>
                </div>
              </div>
            </div>

            {/* Section 2: Token Distribution with Segmented Bar */}
            <div className="usage-panel__section">
              <div className="usage-panel__section-title">
                <Cpu size={12} />
                <span>Token Distribution</span>
                <span className="usage-panel__section-badge mono">
                  {formatTokens(totalTokens)}
                </span>
              </div>

              <div className="usage-panel__card">
                {/* Proportional Segmented Bar */}
                <div
                  className="usage-panel__bar-track"
                  role="meter"
                  aria-label="Token distribution"
                >
                  {inputPct > 0 && (
                    <div
                      className="usage-panel__bar-seg usage-panel__bar-seg--input"
                      style={{ width: `${inputPct}%` }}
                      title={`Input: ${formatTokens(inputTokens)} (${inputPct.toFixed(1)}%)`}
                    />
                  )}
                  {outputPct > 0 && (
                    <div
                      className="usage-panel__bar-seg usage-panel__bar-seg--output"
                      style={{ width: `${outputPct}%` }}
                      title={`Output: ${formatTokens(outputTokens)} (${outputPct.toFixed(1)}%)`}
                    />
                  )}
                  {cacheReadPct > 0 && (
                    <div
                      className="usage-panel__bar-seg usage-panel__bar-seg--cache-read"
                      style={{ width: `${cacheReadPct}%` }}
                      title={`Cache Read: ${formatTokens(cacheReadTokens)} (${cacheReadPct.toFixed(1)}%)`}
                    />
                  )}
                  {cacheWritePct > 0 && (
                    <div
                      className="usage-panel__bar-seg usage-panel__bar-seg--cache-write"
                      style={{ width: `${cacheWritePct}%` }}
                      title={`Cache Write: ${formatTokens(cacheWriteTokens)} (${cacheWritePct.toFixed(1)}%)`}
                    />
                  )}
                </div>

                {/* 2x2 Token Breakdown Tiles */}
                <div className="usage-panel__token-grid">
                  <div className="usage-panel__token-cell">
                    <div className="usage-panel__token-meta">
                      <span className="usage-panel__dot usage-panel__dot--input" />
                      <span className="usage-panel__label">Prompt Input</span>
                    </div>
                    <div className="usage-panel__token-val-row">
                      <span className="usage-panel__value mono">
                        {formatTokens(inputTokens)}
                      </span>
                      <span className="usage-panel__token-share mono">
                        {inputPct.toFixed(0)}%
                      </span>
                    </div>
                  </div>

                  <div className="usage-panel__token-cell">
                    <div className="usage-panel__token-meta">
                      <span className="usage-panel__dot usage-panel__dot--output" />
                      <span className="usage-panel__label">Output Generated</span>
                    </div>
                    <div className="usage-panel__token-val-row">
                      <span className="usage-panel__value mono">
                        {formatTokens(outputTokens)}
                      </span>
                      <span className="usage-panel__token-share mono">
                        {outputPct.toFixed(0)}%
                      </span>
                    </div>
                  </div>

                  <div className="usage-panel__token-cell">
                    <div className="usage-panel__token-meta">
                      <span className="usage-panel__dot usage-panel__dot--cache-read" />
                      <span className="usage-panel__label">Cache Read</span>
                    </div>
                    <div className="usage-panel__token-val-row">
                      <span className="usage-panel__value mono">
                        {formatTokens(cacheReadTokens)}
                      </span>
                      <span className="usage-panel__token-share mono">
                        {cacheReadPct.toFixed(0)}%
                      </span>
                    </div>
                  </div>

                  <div className="usage-panel__token-cell">
                    <div className="usage-panel__token-meta">
                      <span className="usage-panel__dot usage-panel__dot--cache-write" />
                      <span className="usage-panel__label">Cache Write</span>
                    </div>
                    <div className="usage-panel__token-val-row">
                      <span className="usage-panel__value mono">
                        {formatTokens(cacheWriteTokens)}
                      </span>
                      <span className="usage-panel__token-share mono">
                        {cacheWritePct.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                </div>

                {/* Prompt Cache Hit Efficiency Callout */}
                {cacheReadTokens > 0 && (
                  <div className="usage-panel__cache-banner">
                    <div className="usage-panel__cache-banner-left">
                      <Zap size={13} className="usage-panel__cache-banner-icon" />
                      <span className="usage-panel__cache-banner-text">
                        Prompt Cache Hit Rate
                      </span>
                    </div>
                    <span className="usage-panel__cache-banner-rate mono">
                      {cacheHitRate.toFixed(1)}%
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Section 3: Context Window Utilization */}
            {contextWindow > 0 && (
              <div className="usage-panel__section">
                <div className="usage-panel__section-title">
                  <Layers size={12} />
                  <span>Context Window</span>
                  <span
                    className={`usage-panel__section-badge mono ${
                      isCriticalContext
                        ? "is-critical"
                        : isHighContext
                          ? "is-warn"
                          : ""
                    }`}
                  >
                    {contextPercent}%
                  </span>
                </div>

                <div className="usage-panel__card">
                  <div className="usage-panel__stat-row">
                    <span className="usage-panel__label">Current Usage</span>
                    <span className="usage-panel__value mono">
                      {formatTokens(contextTokens)} / {formatTokens(contextWindow)}
                    </span>
                  </div>
                  <div className="usage-panel__meter-bar">
                    <div
                      className={`usage-panel__meter-fill ${
                        isCriticalContext
                          ? "is-critical"
                          : isHighContext
                            ? "is-warn"
                            : ""
                      }`}
                      style={{ width: `${Math.min(100, contextPercent)}%` }}
                    />
                  </div>
                  <div className="usage-panel__stat-row usage-panel__stat-sub">
                    <span className="usage-panel__subtext">
                      {formatTokens(remainingTokens)} tokens available
                    </span>
                    {contextPercent >= 85 && (
                      <span className="usage-panel__subtext is-warn">
                        Auto-compacts at 85%
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Section 4: Session Activity */}
            <div className="usage-panel__section">
              <div className="usage-panel__section-title">
                <Activity size={12} />
                <span>Session Activity</span>
              </div>
              <div className="usage-panel__activity-grid">
                <div className="usage-panel__activity-card">
                  <div className="usage-panel__activity-head">
                    <MessageSquare size={12} className="usage-panel__activity-icon" />
                    <span className="usage-panel__activity-label">Prompts</span>
                  </div>
                  <span className="usage-panel__activity-value mono">
                    {stats.userMessages || 0}
                  </span>
                </div>

                <div className="usage-panel__activity-card">
                  <div className="usage-panel__activity-head">
                    <Bot size={12} className="usage-panel__activity-icon" />
                    <span className="usage-panel__activity-label">Responses</span>
                  </div>
                  <span className="usage-panel__activity-value mono">
                    {stats.assistantMessages || 0}
                  </span>
                </div>

                <div className="usage-panel__activity-card">
                  <div className="usage-panel__activity-head">
                    <Wrench size={12} className="usage-panel__activity-icon" />
                    <span className="usage-panel__activity-label">Tool Calls</span>
                  </div>
                  <span className="usage-panel__activity-value mono">
                    {stats.toolCalls || 0}
                  </span>
                </div>

                <div className="usage-panel__activity-card">
                  <div className="usage-panel__activity-head">
                    <Sparkles size={12} className="usage-panel__activity-icon" />
                    <span className="usage-panel__activity-label">Tool Results</span>
                  </div>
                  <span className="usage-panel__activity-value mono">
                    {stats.toolResults || 0}
                  </span>
                </div>
              </div>
            </div>

            {/* Section 5: Active Model */}
            {selectedModel && (
              <div className="usage-panel__section">
                <div className="usage-panel__model-card">
                  <div className="usage-panel__model-left">
                    <ProviderIcon
                      provider={selectedModel.provider}
                      size={16}
                      className="usage-panel__model-icon"
                    />
                    <div className="usage-panel__model-info">
                      <span className="usage-panel__model-name">
                        {selectedModel.name || selectedModel.id}
                      </span>
                      <span className="usage-panel__model-meta">
                        {selectedModel.provider}
                        {selectedModel.contextWindow
                          ? ` · ${formatTokens(selectedModel.contextWindow)} ctx`
                          : ""}
                        {selectedModel.maxTokens
                          ? ` · ${formatTokens(selectedModel.maxTokens)} max out`
                          : ""}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="usage-panel__card usage-panel__card--empty">
            <Coins size={28} className="usage-panel__empty-icon" />
            <span className="usage-panel__empty-title">No Session Stats Yet</span>
            <span className="usage-panel__empty-desc">
              Send a prompt to begin tracking live tokens, prompt caching efficiency, and session LLM costs.
            </span>
          </div>
        )}

        {/* Footer: Full Workspace Analytics Shortcut */}
        {COMMANDS_BY_ID.has("view.usage") && (
          <div className="usage-panel__footer">
            <button
              type="button"
              className="usage-panel__analytics-btn"
              onClick={() => {
                void COMMANDS_BY_ID.get("view.usage")?.run({
                  focusSession: activeSessionPath ?? null,
                });
              }}
            >
              <div className="usage-panel__analytics-btn-content">
                <BarChart2 size={13} />
                <span>Full Workspace Analytics</span>
              </div>
              <ArrowRight size={12} />
            </button>
            <span className="usage-panel__analytics-hint">
              Explore multi-project history, model breakdowns & spend trends
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
