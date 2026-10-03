import React from "react";
import type { ResolvedFeatureModel } from "../store/feature-models-store.ts";
import { useUi } from "../store/ui-store.ts";

export interface AiModelChipProps {
  model: ResolvedFeatureModel;
  className?: string;
  style?: React.CSSProperties;
  /** Allow clicking chip to open Settings > Models (defaults to false for valid HTML button embedding) */
  clickable?: boolean;
  /** Custom tooltip string override */
  title?: string;
}

/**
 * Ultra-compact model indicator chip designed to fit tightly inside compact toolbars,
 * action buttons (like AI Message and Analyze with AI), and modal headers without bloating dimensions.
 */
export const AiModelChip: React.FC<AiModelChipProps> = ({
  model,
  className,
  style,
  clickable = false,
  title,
}) => {
  const handleClick = (e: React.MouseEvent) => {
    if (!clickable) return;
    e.stopPropagation();
    e.preventDefault();
    useUi.getState().openSettings("models");
  };

  const defaultTitle = `AI Model: ${model.name || model.id} (${model.sourceLabel})${
    clickable ? "\nClick to configure in Settings > Models" : ""
  }`;

  return (
    <span
      className={`ai-model-chip ${className || ""}`}
      onClick={clickable ? handleClick : undefined}
      title={title ?? defaultTitle}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      style={{
        display: "inline-flex",
        alignItems: "center",
        fontSize: "9px",
        fontWeight: 600,
        lineHeight: 1.1,
        letterSpacing: "0.02em",
        padding: "1.5px 5px",
        borderRadius: "3.5px",
        background: "rgba(var(--accent-rgb), 0.12)",
        color: "var(--accent-base)",
        border: "1px solid rgba(var(--accent-rgb), 0.22)",
        userSelect: "none",
        cursor: clickable ? "pointer" : "inherit",
        verticalAlign: "middle",
        transition: "all 0.12s ease",
        ...style,
      }}
      onMouseEnter={(e) => {
        if (clickable) {
          e.currentTarget.style.background = "rgba(var(--accent-rgb), 0.22)";
          e.currentTarget.style.borderColor = "rgba(var(--accent-rgb), 0.4)";
        }
      }}
      onMouseLeave={(e) => {
        if (clickable) {
          e.currentTarget.style.background = style?.background?.toString() || "rgba(var(--accent-rgb), 0.12)";
          e.currentTarget.style.borderColor = style?.borderColor?.toString() || "rgba(var(--accent-rgb), 0.22)";
        }
      }}
    >
      <span
        style={{
          maxWidth: 62,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          display: "inline-block",
        }}
      >
        {model.shortName}
      </span>
    </span>
  );
};
