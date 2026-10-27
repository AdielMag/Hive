import React from "react";
import { Tooltip } from "./Tooltip.tsx";
import { contextTone } from "../lib/context-tone.ts";

interface ContextRingProps {
  tokens: number;
  total: number;
  percent: number;
  size?: number;
  strokeWidth?: number;
  onClick?: () => void;
}

export const ContextRing: React.FC<ContextRingProps> = ({
  tokens,
  total,
  percent,
  size = 28,
  strokeWidth = 3,
  onClick,
}) => {
  const known = total > 0;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clampedPercent = known ? Math.min(100, Math.max(0, percent)) : 0;
  const offset = circumference - (clampedPercent / 100) * circumference;

  const tone = known ? contextTone(clampedPercent) : "unknown";
  const strokeColor =
    tone === "danger" ? "var(--danger)" : tone === "warning" ? "var(--warning)" : "rgba(var(--fg-rgb), 0.55)";
  const labelColor = tone === "danger" ? "var(--danger)" : tone === "warning" ? "var(--warning)" : "var(--text-secondary)";

  const formattedTokens =
    tokens >= 1_000_000
      ? `${(tokens / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`
      : tokens >= 1000
      ? `${Math.round(tokens / 1000)}k`
      : `${tokens}`;
  const formattedTotal =
    total >= 1_000_000
      ? `${(total / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`
      : total >= 1000
      ? `${Math.round(total / 1000)}k`
      : `${total}`;

  const label = known
    ? `Context: ${formattedTokens} of ${formattedTotal} tokens used (${Math.round(clampedPercent)}%). Open breakdown`
    : "Context limit unknown. Open breakdown";

  return (
    <Tooltip side="top" label={label}>
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        cursor: onClick ? "pointer" : "default",
        padding: "2px 6px",
        borderRadius: 4,
        border: "none",
        font: "inherit",
        color: "inherit",
        background: "rgba(var(--fg-rgb), 0.04)",
        opacity: known ? 1 : 0.5,
      }}
    >
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgba(var(--fg-rgb), 0.12)"
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          fill="transparent"
          style={{ transition: "stroke-dashoffset 0.3s ease" }}
        />
      </svg>
      <span style={{ fontSize: 12, fontWeight: 500, color: labelColor, fontVariantNumeric: "tabular-nums" }}>
        {known ? `${formattedTokens}/${formattedTotal}` : "—/—"}
      </span>
    </button>
    </Tooltip>
  );
};
