import React, { useState } from "react";
import { type ResolvedFeatureModel } from "../store/feature-models-store.ts";
import { useUi } from "../store/ui-store.ts";
import { ModelPickerPopover, type ModelPickerAnchor } from "./ModelPickerPopover.tsx";

/** Which setting a right-click on the chip changes. */
export type AiModelChipFeature = "gitCommit" | "usageAnalysis" | "session";

export interface AiModelChipProps {
  model: ResolvedFeatureModel;
  className?: string;
  style?: React.CSSProperties;
  /** Allow clicking chip to open Settings > Models (defaults to false for valid HTML button embedding) */
  clickable?: boolean;
  /** Custom tooltip string override */
  title?: string;
  /** When set, right-clicking the chip opens a menu to change the model used by this feature. */
  feature?: AiModelChipFeature;
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
  feature,
}) => {
  const [picker, setPicker] = useState<ModelPickerAnchor | null>(null);

  const handleContextMenu = (e: React.MouseEvent) => {
    if (!feature) return;
    e.preventDefault();
    e.stopPropagation();
    setPicker({ x: e.clientX, y: e.clientY });
  };

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
    <>
    <span
      className={`ai-model-chip ${className || ""}`}
      onClick={clickable ? handleClick : undefined}
      onContextMenu={feature ? handleContextMenu : undefined}
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
          maxWidth: 96,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          display: "inline-block",
        }}
      >
        {model.shortName}
      </span>
    </span>
    {feature && (
      // React portals bubble events to the parent button; keep menu clicks from triggering it.
      <span
        style={{ display: "contents" }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.stopPropagation()}
      >
        <ModelPickerPopover anchor={picker} feature={feature} onClose={() => setPicker(null)} />
      </span>
    )}
    </>
  );
};
