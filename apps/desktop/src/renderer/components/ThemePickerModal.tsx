import React, { useState } from "react";
import { X, Sparkles, Sun, Moon } from "lucide-react";
import { generateTheme, tokensToCssVars, type ArcThemeConfig } from "@pi-studio/theme-engine";

interface ThemePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PRESETS = [
  { name: "Arc Default", colors: ["#539bf5"], mode: "dark" as const },
  { name: "Sunset", colors: ["#ff7b72", "#d2a8ff"], mode: "dark" as const },
  { name: "Emerald", colors: ["#7ee787", "#388bfd"], mode: "dark" as const },
  { name: "Cyberpunk", colors: ["#f778ba", "#79c0ff"], mode: "dark" as const },
  { name: "Mono Dark", colors: ["#8b949e"], mode: "dark" as const },
  { name: "Nordic Clean", colors: ["#58a6ff"], mode: "light" as const },
];

export const ThemePickerModal: React.FC<ThemePickerModalProps> = ({ isOpen, onClose }) => {
  const [colors, setColors] = useState<string[]>(["#539bf5"]);
  const [intensity, setIntensity] = useState(0.4);
  const [grain, setGrain] = useState(0.08);
  const [mode, setMode] = useState<"dark" | "light">("dark");

  if (!isOpen) return null;

  const applyCurrentTheme = (newConfig: ArcThemeConfig) => {
    const tokens = generateTheme(newConfig);
    const vars = tokensToCssVars(tokens);
    for (const [key, val] of Object.entries(vars)) {
      document.documentElement.style.setProperty(key, val);
    }
  };

  const handleColorChange = (index: number, color: string) => {
    const next = [...colors];
    next[index] = color;
    setColors(next);
    applyCurrentTheme({ colors: next, intensity, grain, mode });
  };

  const handleAddColor = () => {
    if (colors.length >= 3) return;
    const next = [...colors, "#79c0ff"];
    setColors(next);
    applyCurrentTheme({ colors: next, intensity, grain, mode });
  };

  const handleRemoveColor = (index: number) => {
    if (colors.length <= 1) return;
    const next = colors.filter((_, i) => i !== index);
    setColors(next);
    applyCurrentTheme({ colors: next, intensity, grain, mode });
  };

  const handleIntensity = (val: number) => {
    setIntensity(val);
    applyCurrentTheme({ colors, intensity: val, grain, mode });
  };

  const handleGrain = (val: number) => {
    setGrain(val);
    applyCurrentTheme({ colors, intensity, grain: val, mode });
  };

  const handleMode = (newMode: "dark" | "light") => {
    setMode(newMode);
    applyCurrentTheme({ colors, intensity, grain, mode: newMode });
  };

  const handleApplyPreset = (p: (typeof PRESETS)[number]) => {
    setColors(p.colors);
    setMode(p.mode);
    applyCurrentTheme({ colors: p.colors, intensity, grain, mode: p.mode });
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.65)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      }}
    >
      <div
        style={{
          width: 480,
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-prominent)",
          borderRadius: 10,
          padding: 24,
          boxShadow: "0 16px 40px rgba(0,0,0,0.5)",
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Sparkles size={18} color="var(--accent-base)" />
            <span style={{ fontSize: 16, fontWeight: 600 }}>Arc Color Engine</span>
          </div>
          <button
            onClick={onClose}
            style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Presets */}
        <div>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>
            Presets
          </span>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
            {PRESETS.map((p) => (
              <button
                key={p.name}
                onClick={() => handleApplyPreset(p)}
                style={{
                  padding: "4px 10px",
                  borderRadius: 4,
                  border: "1px solid var(--border-subtle)",
                  background: "var(--bg-card)",
                  color: "var(--text-secondary)",
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>

        {/* Color Palette Dots */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>
              Palette Colors ({colors.length}/3)
            </span>
            {colors.length < 3 && (
              <button
                onClick={handleAddColor}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--accent-base)",
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                + Add Color
              </button>
            )}
          </div>

          <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
            {colors.map((c, idx) => (
              <div key={idx} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="color"
                  value={c}
                  onChange={(e) => handleColorChange(idx, e.target.value)}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                    background: "transparent",
                  }}
                />
                {colors.length > 1 && (
                  <button
                    onClick={() => handleRemoveColor(idx)}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "var(--text-muted)",
                      cursor: "pointer",
                      padding: 2,
                    }}
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Intensity slider */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-muted)" }}>
            <span>TINT INTENSITY</span>
            <span>{Math.round(intensity * 100)}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={intensity}
            onChange={(e) => handleIntensity(parseFloat(e.target.value))}
            style={{ width: "100%", marginTop: 6, accentColor: "var(--accent-base)" }}
          />
        </div>

        {/* Grain slider */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-muted)" }}>
            <span>GRAIN</span>
            <span>{Math.round(grain * 100)}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="0.3"
            step="0.02"
            value={grain}
            onChange={(e) => handleGrain(parseFloat(e.target.value))}
            style={{ width: "100%", marginTop: 6, accentColor: "var(--accent-base)" }}
          />
        </div>

        {/* Dark / Light Toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={() => handleMode("dark")}
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              padding: "8px",
              borderRadius: 6,
              border: mode === "dark" ? "1px solid var(--accent-base)" : "1px solid var(--border-subtle)",
              background: mode === "dark" ? "var(--accent-subtle)" : "var(--bg-card)",
              color: mode === "dark" ? "var(--text-primary)" : "var(--text-muted)",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            <Moon size={14} /> Dark
          </button>
          <button
            onClick={() => handleMode("light")}
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              padding: "8px",
              borderRadius: 6,
              border: mode === "light" ? "1px solid var(--accent-base)" : "1px solid var(--border-subtle)",
              background: mode === "light" ? "var(--accent-subtle)" : "var(--bg-card)",
              color: mode === "light" ? "var(--text-primary)" : "var(--text-muted)",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            <Sun size={14} /> Light
          </button>
        </div>

        <button
          onClick={onClose}
          style={{
            marginTop: 4,
            padding: "8px 16px",
            borderRadius: 6,
            border: "none",
            background: "var(--accent-base)",
            color: "#fff",
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Done
        </button>
      </div>
    </div>
  );
};
