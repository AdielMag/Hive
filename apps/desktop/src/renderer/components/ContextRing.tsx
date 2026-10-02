import React from "react";

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
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clampedPercent = Math.min(100, Math.max(0, percent));
  const offset = circumference - (clampedPercent / 100) * circumference;

  let strokeColor = "#57ab5a"; // green
  if (clampedPercent > 80) strokeColor = "#e5534b"; // red
  else if (clampedPercent > 50) strokeColor = "#c69026"; // amber

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

  return (
    <div
      onClick={onClick}
      title={`Context: ${tokens.toLocaleString()} / ${total.toLocaleString()} tokens (${clampedPercent.toFixed(1)}%)`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        cursor: onClick ? "pointer" : "default",
        padding: "2px 6px",
        borderRadius: 4,
        background: "rgba(var(--fg-rgb), 0.04)",
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
      <span style={{ fontSize: 11, color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
        {formattedTokens}/{formattedTotal}
      </span>
    </div>
  );
};
