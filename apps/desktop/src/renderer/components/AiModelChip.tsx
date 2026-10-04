import React, { useState } from "react";
import { Check, Settings } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useFeatureModelStore, type ResolvedFeatureModel } from "../store/feature-models-store.ts";
import { useSessionStore } from "../store/session-store.ts";
import { useUi } from "../store/ui-store.ts";
import { ContextMenu, type ContextMenuEntry, type ContextMenuState } from "./ContextMenu.tsx";

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

/** Builds the right-click menu entries for switching the model of a feature. */
function useModelMenuItems(feature: AiModelChipFeature, model: ResolvedFeatureModel): ContextMenuEntry[] {
  const { models, selectedModel, defaultModel, setModel } = useSessionStore(
    useShallow((s) => ({
      models: s.models,
      selectedModel: s.selectedModel,
      defaultModel: s.defaultModel,
      setModel: s.setModel,
    })),
  );
  const { config, setGitCommitConfig, setUsageAnalysisConfig } = useFeatureModelStore(
    useShallow((s) => ({
      config: s.config,
      setGitCommitConfig: s.setGitCommitConfig,
      setUsageAnalysisConfig: s.setUsageAnalysisConfig,
    })),
  );

  const items: ContextMenuEntry[] = [
    {
      label: feature === "session" ? "Switch session model" : "Model for this action",
      disabled: true,
      onSelect: () => {},
    },
  ];
  const tick = (on: boolean) => (on ? <Check size={12} /> : <span style={{ width: 12, display: "inline-block" }} />);
  const openSettings = {
    label: "Open Settings › Models…",
    icon: <Settings size={12} />,
    onSelect: () => useUi.getState().openSettings("models"),
  };

  if (feature === "session") {
    items.push({ kind: "separator" });
    for (const m of models) {
      const on = selectedModel?.id === m.id && selectedModel?.provider === m.provider;
      items.push({
        label: `${m.name || m.id} (${m.provider})`,
        icon: tick(on),
        onSelect: () => void setModel(m.provider, m.id),
      });
    }
    items.push({ kind: "separator" }, openSettings);
    return items;
  }

  const pref = feature === "gitCommit" ? config.gitCommit : config.usageAnalysis;
  const apply = feature === "gitCommit" ? setGitCommitConfig : setUsageAnalysisConfig;

  items.push(
    { kind: "separator" },
    {
      label: "Active session model",
      icon: tick(pref.source === "session"),
      onSelect: () => apply({ source: "session" }),
    },
    {
      label: `Pi CLI default${defaultModel ? ` (${defaultModel})` : ""}`,
      icon: tick(pref.source === "pi-default"),
      onSelect: () => apply({ source: "pi-default" }),
    },
  );
  if (feature === "usageAnalysis") {
    items.push({
      label: "Fast local rules (no LLM)",
      icon: tick(pref.source === "heuristic"),
      onSelect: () => apply({ source: "heuristic" }),
    });
  }
  if (models.length > 0) items.push({ kind: "separator" });
  for (const m of models) {
    const key = `${m.provider}/${m.id}`;
    const on = pref.source === "custom" && (pref.modelId === key || pref.modelId === m.id);
    items.push({
      label: `${m.name || m.id} (${m.provider})`,
      icon: tick(on),
      onSelect: () => apply({ source: "custom", modelId: key }),
    });
  }
  items.push({ kind: "separator" }, openSettings);
  void model;
  return items;
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
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const menuItems = useModelMenuItems(feature ?? "session", model);

  const handleContextMenu = (e: React.MouseEvent) => {
    if (!feature) return;
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, items: menuItems });
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
        <ContextMenu menu={menu} onClose={() => setMenu(null)} />
      </span>
    )}
    </>
  );
};
