import React, { useEffect, useMemo, useRef, useState } from "react";
import { Brain, Check, ChevronDown, Sparkles } from "lucide-react";
import { useSessionStore } from "../store/session-store.ts";
import { clampThinkingLevel, getSupportedThinkingLevels } from "../lib/models/thinking.ts";

interface ThinkingLevelMeta {
  label: string;
  desc: string;
  badge?: string;
}

const THINKING_META: Record<string, ThinkingLevelMeta> = {
  off: { label: "Off", desc: "No reasoning tokens (fastest response)" },
  minimal: { label: "Minimal", desc: "Brief reasoning before answer" },
  low: { label: "Low", desc: "Light reasoning budget" },
  medium: { label: "Medium", desc: "Balanced reasoning effort (recommended)" },
  high: { label: "High", desc: "Deep reasoning for complex code and logic" },
  xhigh: { label: "X-High", desc: "Extra deep reasoning" },
  max: { label: "Max", desc: "Maximum available reasoning budget", badge: "Max" },
};

export const ThinkingPicker: React.FC = () => {
  const { thinkingLevels, selectedThinkingLevel, setThinkingLevel, selectedModel } = useSessionStore();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    if (!open) return;
    const handleDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleDown);
    return () => document.removeEventListener("mousedown", handleDown);
  }, [open]);

  // Determine available levels dynamically
  const availableLevels = useMemo(() => {
    if (thinkingLevels && thinkingLevels.length > 0) {
      return thinkingLevels;
    }
    return getSupportedThinkingLevels(selectedModel);
  }, [thinkingLevels, selectedModel]);

  const supportsReasoning = Boolean(selectedModel?.reasoning) && availableLevels.some((l) => l !== "off");

  const currentLevel = useMemo(() => {
    if (!supportsReasoning) return "off";
    if (availableLevels.includes(selectedThinkingLevel)) return selectedThinkingLevel;
    return clampThinkingLevel(selectedModel, selectedThinkingLevel);
  }, [supportsReasoning, availableLevels, selectedThinkingLevel, selectedModel]);

  // If the active level doesn't match the store's level (e.g. model clamped it), sync store
  useEffect(() => {
    if (supportsReasoning && selectedThinkingLevel !== currentLevel && availableLevels.includes(currentLevel)) {
      void setThinkingLevel(currentLevel);
    }
  }, [supportsReasoning, selectedThinkingLevel, currentLevel, availableLevels, setThinkingLevel]);

  const isReasoningActive = currentLevel !== "off" && supportsReasoning;

  const currentMeta = THINKING_META[currentLevel] || {
    label: currentLevel.charAt(0).toUpperCase() + currentLevel.slice(1),
    desc: `Reasoning level: ${currentLevel}`,
  };

  const handleSelect = (lvl: string) => {
    void setThinkingLevel(lvl);
    setOpen(false);
  };

  return (
    <div ref={containerRef} style={{ position: "relative", minWidth: 0, flexShrink: 2 }}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        title={
          supportsReasoning
            ? `Reasoning effort: ${currentMeta.label} (${currentMeta.desc}) · Supported: ${availableLevels.join(", ")}`
            : selectedModel
            ? `Thinking mode is not supported by ${selectedModel.name || selectedModel.id}`
            : "Thinking mode not supported by the selected model"
        }
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          background: open ? "var(--bg-elevated)" : "var(--bg-card)",
          border: `1px solid ${isReasoningActive ? "rgba(var(--accent-rgb), 0.4)" : "var(--border-subtle)"}`,
          borderRadius: 4,
          padding: "3px 8px",
          fontSize: 11,
          color: isReasoningActive ? "var(--accent-base)" : "var(--text-secondary)",
          cursor: "pointer",
          maxWidth: 160,
          minWidth: 0,
          boxShadow: isReasoningActive ? "0 0 6px rgba(var(--accent-rgb), 0.12)" : "none",
          transition: "all 0.15s ease",
        }}
      >
        <Brain
          size={13}
          style={{
            flexShrink: 0,
            color: isReasoningActive ? "var(--accent-base)" : "var(--text-muted)",
          }}
        />
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontWeight: isReasoningActive ? 600 : 400,
          }}
        >
          {supportsReasoning ? `Thinking: ${currentMeta.label}` : "Thinking: Off"}
        </span>
        <ChevronDown
          size={11}
          style={{
            flexShrink: 0,
            color: "var(--text-muted)",
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 0.15s ease",
          }}
        />
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            bottom: "100%",
            left: 0,
            marginBottom: 6,
            width: 250,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-prominent)",
            borderRadius: 8,
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
            zIndex: 1000,
            padding: "4px 0",
            overflow: "hidden",
            animation: "modalFadeIn 0.12s ease-out",
          }}
        >
          <div
            style={{
              padding: "6px 10px",
              borderBottom: "1px solid var(--border-subtle)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "var(--bg-card)",
            }}
          >
            <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
              Reasoning Level
            </span>
            {supportsReasoning && (
              <span style={{ fontSize: 9, color: "var(--accent-base)", display: "flex", alignItems: "center", gap: 3 }}>
                <Sparkles size={10} /> {availableLevels.length} level{availableLevels.length === 1 ? "" : "s"} supported
              </span>
            )}
          </div>

          {!supportsReasoning ? (
            <div style={{ padding: "10px 12px", fontSize: 11, color: "var(--text-muted)", fontStyle: "italic", lineHeight: 1.4 }}>
              The selected model (<code style={{ color: "var(--text-primary)" }}>{selectedModel?.name || selectedModel?.id || "current"}</code>) does not support reasoning/thinking mode.
            </div>
          ) : (
            <div style={{ maxHeight: 240, overflowY: "auto", padding: "2px 0" }}>
              {availableLevels.map((lvl) => {
                const meta = THINKING_META[lvl] || { label: lvl, desc: "" };
                const isSelected = currentLevel === lvl;

                return (
                  <div
                    key={lvl}
                    onClick={() => handleSelect(lvl)}
                    style={{
                      padding: "6px 10px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                      cursor: "pointer",
                      fontSize: 11,
                      background: isSelected ? "rgba(var(--accent-rgb), 0.12)" : "transparent",
                      color: isSelected ? "var(--accent-base)" : "var(--text-primary)",
                      transition: "background 0.1s ease",
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) e.currentTarget.style.background = "var(--bg-card-hover)";
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontWeight: isSelected ? 600 : 500 }}>{meta.label}</span>
                        {meta.badge && (
                          <span
                            style={{
                              fontSize: 9,
                              fontWeight: 700,
                              background: "rgba(var(--accent-rgb), 0.2)",
                              color: "var(--accent-base)",
                              padding: "1px 4px",
                              borderRadius: 3,
                            }}
                          >
                            {meta.badge}
                          </span>
                        )}
                      </div>
                      {meta.desc && (
                        <span style={{ fontSize: 10, color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {meta.desc}
                        </span>
                      )}
                    </div>
                    {isSelected && <Check size={12} color="var(--accent-base)" style={{ flexShrink: 0 }} />}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
