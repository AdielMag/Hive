import React, { useState } from "react";
import { type ResolvedFeatureModel } from "../store/feature-models-store.ts";
import { useSessionStore } from "../store/session-store.ts";
import { useUi } from "../store/ui-store.ts";
import { ModelPickerPopover, type ModelPickerAnchor } from "./ModelPickerPopover.tsx";

/** Which setting a right-click on the chip changes. */
export type AiModelChipFeature = "gitCommit" | "usageAnalysis" | "sessionTidy" | "session";

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
  const defaultModel = useSessionStore((s) => s.defaultModel);
  // Slightly brighter when this feature uses a model other than the session default.
  const isCustom = Boolean(defaultModel) && model.id !== defaultModel;
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

  const defaultTitle = `${model.name || model.id} (${model.sourceLabel})${
    clickable ? " · Click to change in Settings › Models" : feature ? " · Right-click to change" : ""
  }`;

  const classes = ["ai-model-chip", isCustom && "is-custom", clickable && "is-clickable", className].filter(Boolean).join(" ");

  return (
    <>
    <span
      className={classes}
      onClick={clickable ? handleClick : undefined}
      onContextMenu={feature ? handleContextMenu : undefined}
      title={title ?? defaultTitle}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      style={style}
    >
      {model.shortName}
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
