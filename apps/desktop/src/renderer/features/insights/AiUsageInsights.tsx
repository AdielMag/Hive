import React from "react";
import {
  Sparkles,
  X,
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
  Zap,
  RefreshCw,
} from "lucide-react";
import type { AiUsageAnalysisResult } from "./insights-analyzer.ts";
import type { ResolvedFeatureModel } from "../../store/feature-models-store.ts";
import { AiModelChip } from "../../components/AiModelChip.tsx";

interface Props {
  analysis: AiUsageAnalysisResult | null;
  isOpen: boolean;
  onClose: () => void;
  onReanalyze: () => void;
  isLoading: boolean;
  model?: ResolvedFeatureModel;
}

export const AiUsageInsightsModal: React.FC<Props> = ({
  analysis,
  isOpen,
  onClose,
  onReanalyze,
  isLoading,
  model,
}) => {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.65)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: 20,
        animation: "modalFadeIn 0.15s ease-out",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 680,
          maxHeight: "85vh",
          backgroundColor: "var(--bg-elevated)",
          border: "1px solid var(--border-prominent)",
          borderRadius: 12,
          boxShadow: "0 20px 48px rgba(0, 0, 0, 0.55)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--border-subtle)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "var(--bg-card)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: "linear-gradient(135deg, rgba(var(--accent-rgb), 0.25), rgba(var(--accent-rgb), 0.05))",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--accent-base)",
              }}
            >
              <Sparkles size={18} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 7 }}>
                <span>AI Usage Insights & Optimization</span>
                {model && <AiModelChip model={model} clickable={true} feature="usageAnalysis" />}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                Automated telemetry diagnosis and cost-saving recommendations
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              onClick={onReanalyze}
              disabled={isLoading}
              title={model ? `Re-analyze usage telemetry using ${model.name || model.id} (${model.sourceLabel})` : "Refresh telemetry analysis"}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                background: "transparent",
                border: "1px solid var(--border-subtle)",
                borderRadius: 6,
                color: "var(--text-secondary)",
                padding: "4px 10px",
                fontSize: 11,
                cursor: isLoading ? "default" : "pointer",
              }}
            >
              <RefreshCw size={12} className={isLoading ? "spin" : ""} />
              <span>Refresh</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
                padding: 4,
                display: "flex",
                borderRadius: 4,
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div style={{ padding: "18px 20px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
          {isLoading ? (
            <div
              style={{
                padding: "48px 20px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
                color: "var(--text-muted)",
              }}
            >
              <Sparkles size={28} className="spin" color="var(--accent-base)" />
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>
                Synthesizing AI telemetry insights...
              </div>
              <div style={{ fontSize: 11 }}>
                Analyzing token cache distributions, model cost curves, and throughput velocity
              </div>
            </div>
          ) : !analysis ? (
            <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}>
              No telemetry data available for the selected range.
            </div>
          ) : (
            <>
              {/* Score & Summary Banner */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "14px 18px",
                  background: "rgba(var(--accent-rgb), 0.08)",
                  border: "1px solid rgba(var(--accent-rgb), 0.25)",
                  borderRadius: 10,
                  gap: 16,
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--accent-base)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    Telemetry Health Score
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.45, maxWidth: 440 }}>
                    {analysis.summary}
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: 84,
                    padding: "8px 12px",
                    background: "var(--bg-card)",
                    borderRadius: 8,
                    border: "1px solid var(--border-subtle)",
                  }}
                >
                  <div style={{ fontSize: 24, fontWeight: 700, color: "var(--accent-base)", lineHeight: 1 }}>
                    {analysis.score}
                  </div>
                  <div style={{ fontSize: 9.5, fontWeight: 600, color: "var(--text-muted)", marginTop: 3 }}>
                    {analysis.scoreLabel}
                  </div>
                </div>
              </div>

              {/* Run-rate metric chip */}
              <div style={{ display: "flex", gap: 10 }}>
                <div
                  style={{
                    flex: 1,
                    padding: "10px 14px",
                    background: "var(--bg-card)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: 8,
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <TrendingUp size={16} color="var(--accent-base)" />
                  <div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>
                      Projected 30-Day Run Rate
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
                      {analysis.runRate30d}
                    </div>
                  </div>
                </div>
              </div>

              {/* Key Insights Section */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
                  Key Telemetry Findings
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {analysis.insights.map((item) => {
                    const isPositive = item.type === "positive";
                    const isWarning = item.type === "warning";
                    const isOpp = item.type === "opportunity";
                    const iconColor = isPositive
                      ? "var(--success)"
                      : isWarning
                      ? "var(--danger)"
                      : isOpp
                      ? "var(--accent-base)"
                      : "var(--text-secondary)";

                    return (
                      <div
                        key={item.id}
                        style={{
                          padding: "10px 14px",
                          background: "var(--bg-card)",
                          border: "1px solid var(--border-subtle)",
                          borderRadius: 8,
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 10,
                        }}
                      >
                        <div style={{ marginTop: 2, color: iconColor }}>
                          {isPositive ? (
                            <CheckCircle2 size={15} />
                          ) : isWarning ? (
                            <AlertTriangle size={15} />
                          ) : (
                            <Lightbulb size={15} />
                          )}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, marginBottom: 3 }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>
                              {item.title}
                            </span>
                            {item.metric && (
                              <span
                                style={{
                                  fontSize: 10,
                                  fontWeight: 600,
                                  color: iconColor,
                                  background: "rgba(var(--fg-rgb), 0.05)",
                                  padding: "1px 6px",
                                  borderRadius: 4,
                                }}
                              >
                                {item.metric}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 11.5, color: "var(--text-secondary)", lineHeight: 1.4 }}>
                            {item.description}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Actionable Recommendations */}
              {analysis.recommendations.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
                    Actionable Recommendations
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {analysis.recommendations.map((rec) => (
                      <div
                        key={rec.id}
                        style={{
                          padding: "10px 14px",
                          background: "var(--bg-card)",
                          border: "1px solid var(--border-subtle)",
                          borderRadius: 8,
                          display: "flex",
                          flexDirection: "column",
                          gap: 5,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <Zap size={13} color="var(--accent-base)" />
                            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>
                              {rec.title}
                            </span>
                          </div>
                          {rec.estimatedSavings && (
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                color: "var(--success)",
                                background: "rgba(63, 185, 80, 0.12)",
                                padding: "1px 6px",
                                borderRadius: 4,
                              }}
                            >
                              {rec.estimatedSavings}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 11.5, color: "var(--text-secondary)", lineHeight: 1.4 }}>
                          {rec.action}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
