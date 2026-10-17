import React, { useEffect, useRef, useState } from "react";
import { Compass, Sparkles, MessageCircleQuestion, CheckSquare, Bug, ChevronDown, Check, TriangleAlert } from "lucide-react";
import type { AgentMode } from "@hive/protocol";
import { useSessionStore } from "../store/session-store.ts";
import { getStoredItem, setStoredItem } from "../lib/storage.ts";

export const AUTO_EDIT_HINT_KEY = "hive.hint.auto-edit";

/** Show the one-time Auto Edit callout while Auto Edit is selected and it hasn't been dismissed. */
export function shouldShowAutoEditHint(mode: AgentMode | undefined, stored: string | null): boolean {
  return (mode ?? "auto-edit") === "auto-edit" && stored !== "seen";
}

export interface ModeMeta {
  id: AgentMode;
  label: string;
  desc: string;
  icon: React.ReactNode;
  color: string;
  bgTint: string;
  writes: boolean;
}

export const MODES: ModeMeta[] = [
  {
    id: "auto-edit",
    label: "Auto Edit",
    desc: "Autonomous agent execution and file edits",
    icon: <Sparkles size={13} />,
    color: "#3fb950",
    bgTint: "rgba(63, 185, 80, 0.15)",
    writes: true,
  },
  {
    id: "ask",
    label: "Ask",
    desc: "Answer questions and explain code without modifying files",
    icon: <MessageCircleQuestion size={13} />,
    color: "#38bdf8",
    bgTint: "rgba(56, 189, 248, 0.15)",
    writes: false,
  },
  {
    id: "plan",
    label: "Plan",
    desc: "Architect and research without modifying files directly",
    icon: <Compass size={13} />,
    color: "#e3b341",
    bgTint: "rgba(227, 179, 65, 0.15)",
    writes: false,
  },
  {
    id: "manual",
    label: "Manual",
    desc: "Propose diffs and request user confirmation",
    icon: <CheckSquare size={13} />,
    color: "#58a6ff",
    bgTint: "rgba(88, 166, 255, 0.15)",
    writes: true,
  },
  {
    id: "debug",
    label: "Debug",
    desc: "In-depth root cause diagnostics and error traces",
    icon: <Bug size={13} />,
    color: "#bc8cff",
    bgTint: "rgba(188, 140, 255, 0.15)",
    writes: true,
  },
];

export const ModePicker: React.FC = () => {
  const { selectedMode, setMode } = useSessionStore();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hintSeen, setHintSeen] = useState(() => getStoredItem(AUTO_EDIT_HINT_KEY) === "seen");
  const markHintSeen = () => {
    setStoredItem(AUTO_EDIT_HINT_KEY, "seen");
    setHintSeen(true);
  };
  const showHint = !open && shouldShowAutoEditHint(selectedMode, hintSeen ? "seen" : null);

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

  const activeMode = MODES.find((m) => m.id === selectedMode) ?? MODES.find((m) => m.id === "auto-edit") ?? MODES[0]!;

  const handleSelect = (mode: AgentMode) => {
    setMode(mode);
    setOpen(false);
    if (!hintSeen) markHintSeen();
  };

  return (
    <div ref={containerRef} className="composer-mode" style={{ position: "relative", minWidth: 0, flexShrink: 2 }}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        title={`Execution Mode: ${activeMode.label} - ${activeMode.desc}`}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          background: open
            ? "var(--bg-elevated)"
            : activeMode.writes
            ? "color-mix(in srgb, var(--warning) 14%, transparent)"
            : "var(--bg-card)",
          border: activeMode.writes
            ? "1px solid color-mix(in srgb, var(--warning) 40%, transparent)"
            : "1px solid var(--border-subtle)",
          borderRadius: 4,
          padding: "3px 8px",
          fontSize: 11,
          color: activeMode.writes ? "var(--warning)" : "var(--text-secondary)",
          cursor: "pointer",
          maxWidth: 140,
          minWidth: 0,
          transition: "background-color 150ms ease-out, border-color 150ms ease-out",
        }}
      >
        <span style={{ display: "inline-flex", flexShrink: 0, color: activeMode.writes ? "var(--warning)" : "var(--text-secondary)" }}>{activeMode.icon}</span>
        <span
          className="composer-hide-md"
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

      {showHint && (
        <div className="auto-edit-hint" role="status">
          <TriangleAlert size={13} className="auto-edit-hint__icon" aria-hidden="true" />
          <div className="auto-edit-hint__body">
            <span>Auto Edit: Pi changes files without asking. Switch to Manual to approve each edit.</span>
            <button type="button" className="auto-edit-hint__btn" onClick={markHintSeen}>
              Got it
            </button>
          </div>
        </div>
      )}

      {open && (
        <div
          className="composer-popup"
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
