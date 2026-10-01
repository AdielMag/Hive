import React, { useEffect, useRef, useState } from "react";
import { Compass, Sparkles, CheckSquare, Bug, ChevronDown, Check } from "lucide-react";
import type { AgentMode } from "@pi-studio/protocol";
import { useSessionStore } from "../store/session-store.ts";

export interface ModeMeta {
  id: AgentMode;
  label: string;
  desc: string;
  icon: React.ReactNode;
  color: string;
  bgTint: string;
}

export const MODES: ModeMeta[] = [
  {
    id: "plan",
    label: "Plan",
    desc: "Architect and research without modifying files directly",
    icon: <Compass size={13} />,
    color: "#e3b341",
    bgTint: "rgba(227, 179, 65, 0.15)",
  },
  {
    id: "auto-edit",
    label: "Auto Edit",
    desc: "Autonomous agent execution and file edits",
    icon: <Sparkles size={13} />,
    color: "#3fb950",
    bgTint: "rgba(63, 185, 80, 0.15)",
  },
  {
    id: "manual",
    label: "Manual",
    desc: "Propose diffs and request user confirmation",
    icon: <CheckSquare size={13} />,
    color: "#58a6ff",
    bgTint: "rgba(88, 166, 255, 0.15)",
  },
  {
    id: "debug",
    label: "Debug",
    desc: "In-depth root cause diagnostics and error traces",
    icon: <Bug size={13} />,
    color: "#bc8cff",
    bgTint: "rgba(188, 140, 255, 0.15)",
  },
];

export const ModePicker: React.FC = () => {
  const { selectedMode, setMode } = useSessionStore();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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

  const activeMode = MODES.find((m) => m.id === selectedMode) ?? MODES[1]!;

  const handleSelect = (mode: AgentMode) => {
    setMode(mode);
    setOpen(false);
  };

  return (
    <div ref={containerRef} style={{ position: "relative", minWidth: 0, flexShrink: 2 }}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        title={`Execution Mode: ${activeMode.label} - ${activeMode.desc}`}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          background: open ? "var(--bg-elevated)" : "var(--bg-card)",
          border: `1px solid ${activeMode.bgTint.replace("0.15", "0.4")}`,
          borderRadius: 4,
          padding: "3px 8px",
          fontSize: 11,
          color: activeMode.color,
          cursor: "pointer",
          maxWidth: 140,
          minWidth: 0,
          transition: "all 0.15s ease",
        }}
      >
        <span style={{ display: "inline-flex", color: activeMode.color }}>{activeMode.icon}</span>
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontWeight: 600,
          }}
        >
          {activeMode.label}
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
            width: 260,
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
              background: "var(--bg-card)",
              fontSize: 10,
              fontWeight: 700,
              color: "var(--text-muted)",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            Agent Execution Mode
          </div>

          <div style={{ padding: "2px 0" }}>
            {MODES.map((m) => {
              const isSelected = selectedMode === m.id;
              return (
                <div
                  key={m.id}
                  onClick={() => handleSelect(m.id)}
                  style={{
                    padding: "7px 10px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    cursor: "pointer",
                    fontSize: 11,
                    background: isSelected ? m.bgTint : "transparent",
                    color: isSelected ? m.color : "var(--text-primary)",
                    transition: "background 0.1s ease",
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.background = "var(--bg-card-hover)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) e.currentTarget.style.background = "transparent";
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 8, minWidth: 0 }}>
                    <div style={{ marginTop: 2, color: m.color, flexShrink: 0 }}>{m.icon}</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
                      <span style={{ fontWeight: isSelected ? 600 : 500, color: isSelected ? m.color : "var(--text-primary)" }}>
                        {m.label}
                      </span>
                      <span style={{ fontSize: 10, color: "var(--text-muted)", lineHeight: 1.3 }}>
                        {m.desc}
                      </span>
                    </div>
                  </div>
                  {isSelected && <Check size={13} color={m.color} style={{ flexShrink: 0 }} />}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
