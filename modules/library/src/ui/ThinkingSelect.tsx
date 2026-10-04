import React, { useEffect, useRef, useState } from "react";
import { Brain, Check, ChevronDown, RotateCcw } from "lucide-react";

interface ThinkingOption {
  value: string | null;
  label: string;
  description: string;
}

const THINKING_OPTIONS: ThinkingOption[] = [
  { value: null, label: "Inherit (parent level)", description: "Use whatever reasoning budget the parent session runs" },
  { value: "off", label: "Off", description: "No reasoning tokens (fastest response)" },
  { value: "minimal", label: "Minimal", description: "Brief reasoning before answer" },
  { value: "low", label: "Low", description: "Light reasoning budget" },
  { value: "medium", label: "Medium", description: "Balanced reasoning effort (recommended)" },
  { value: "high", label: "High", description: "Deep reasoning for complex code and logic" },
  { value: "xhigh", label: "X-High", description: "Extra deep reasoning budget" },
  { value: "max", label: "Max", description: "Maximum available reasoning budget" },
];

interface Props {
  currentValue?: string | null;
  disabled?: boolean;
  onSelect: (level: string | null) => void;
}

export const ThinkingSelect: React.FC<Props> = ({ currentValue, disabled, onSelect }) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const activeOption = THINKING_OPTIONS.find((o) => o.value === (currentValue ?? null)) ?? {
    value: currentValue ?? null,
    label: currentValue ?? "Inherit",
    description: "Custom thinking level",
  };

  const handleSelect = (val: string | null) => {
    onSelect(val);
    setOpen(false);
  };

  return (
    <div className="lib-thinking-select" ref={containerRef}>
      <button
        type="button"
        className={`lib-thinking-select__trigger ui-btn ${open ? "is-open" : ""}`}
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        title={activeOption.description}
      >
        <span className="lib-thinking-select__trigger-icon">
          {currentValue ? <Brain size={14} /> : <RotateCcw size={13} className="text-muted" />}
        </span>
        <span className="lib-thinking-select__trigger-label">
          {currentValue ? (
            <span className="lib-thinking-select__name">{activeOption.label}</span>
          ) : (
            <span className="text-muted" style={{ fontStyle: "italic" }}>
              Inherit (parent level)
            </span>
          )}
        </span>
        <ChevronDown size={13} className="lib-thinking-select__chevron text-muted" />
      </button>

      {open && (
        <div className="lib-thinking-select__popover ui-card">
          <div className="lib-thinking-select__list">
            {THINKING_OPTIONS.map((opt) => {
              const isSelected = (currentValue ?? null) === opt.value;
              return (
                <button
                  key={String(opt.value)}
                  type="button"
                  className={`lib-thinking-select__item ${isSelected ? "is-selected" : ""}`}
                  onClick={() => handleSelect(opt.value)}
                >
                  <div className="lib-thinking-select__item-icon">
                    {opt.value ? <Brain size={13} /> : <RotateCcw size={13} className="text-muted" />}
                  </div>
                  <div className="lib-thinking-select__item-info">
                    <span className="lib-thinking-select__item-name">{opt.label}</span>
                    <span className="lib-thinking-select__item-sub text-muted">{opt.description}</span>
                  </div>
                  {isSelected && <Check size={14} className="lib-thinking-select__item-check" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
