import React, { useState, useRef, useEffect, useCallback } from "react";
import { X, Sparkles, Sun, Moon, RotateCcw, Check } from "lucide-react";
import { generateTheme, tokensToCssVars, type ArcThemeConfig } from "@pi-studio/theme-engine";

interface ArcThemePickerProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ColorStop {
  id: string;
  x: number; // 0 to 1 (controls Hue: 0 to 360)
  y: number; // 0 to 1 (controls Lightness / Chroma: 0.1 to 0.25)
  color: string;
}

const ARC_PRESETS: Array<{ name: string; stops: Array<{ x: number; y: number }>; mode: "dark" | "light" }> = [
  {
    name: "Electric Blue",
    stops: [{ x: 0.65, y: 0.35 }],
    mode: "dark",
  },
  {
    name: "Sunset Aura",
    stops: [
      { x: 0.05, y: 0.3 },
      { x: 0.8, y: 0.4 },
    ],
    mode: "dark",
  },
  {
    name: "Botanical",
    stops: [
      { x: 0.38, y: 0.35 },
      { x: 0.55, y: 0.4 },
    ],
    mode: "dark",
  },
  {
    name: "Cyber Neon",
    stops: [
      { x: 0.9, y: 0.35 },
      { x: 0.52, y: 0.45 },
    ],
    mode: "dark",
  },
  {
    name: "Obsidian",
    stops: [{ x: 0.7, y: 0.05 }],
    mode: "dark",
  },
  {
    name: "Morning Mist",
    stops: [
      { x: 0.55, y: 0.3 },
      { x: 0.12, y: 0.25 },
    ],
    mode: "light",
  },
];

function posToColor(x: number, y: number): string {
  const hue = Math.round(x * 360);
  const chroma = 0.05 + y * 0.2; // 0.05 to 0.25
  return `oklch(0.72 ${chroma.toFixed(3)} ${hue})`;
}

export const ArcThemePicker: React.FC<ArcThemePickerProps> = ({ isOpen, onClose }) => {
  const [stops, setStops] = useState<ColorStop[]>([
    { id: "1", x: 0.65, y: 0.35, color: posToColor(0.65, 0.35) },
  ]);
  const [activeStopId, setActiveStopId] = useState<string>("1");
  const [intensity, setIntensity] = useState(0.5);
  const [grain, setGrain] = useState(0.08);
  const [mode, setMode] = useState<"dark" | "light">("dark");

  const canvasRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  // Apply theme to whole window live
  const applyTheme = useCallback(
    (currentStops: ColorStop[], curIntensity: number, curGrain: number, curMode: "dark" | "light") => {
      const colors = currentStops.map((s) => s.color);
      const tokens = generateTheme({
        colors,
        intensity: curIntensity,
        grain: curGrain,
        mode: curMode,
      });
      const cssVars = tokensToCssVars(tokens);
      for (const [k, v] of Object.entries(cssVars)) {
        document.documentElement.style.setProperty(k, v);
      }
      // Set grain opacity on background
      document.documentElement.style.setProperty("--grain-opacity", String(curGrain));
    },
    [],
  );

  const updateStopPosition = (id: string, clientX: number, clientY: number) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const rawX = (clientX - rect.left) / rect.width;
    const rawY = 1 - (clientY - rect.top) / rect.height;

    const x = Math.max(0, Math.min(1, rawX));
    const y = Math.max(0, Math.min(1, rawY));
    const color = posToColor(x, y);

    setStops((prev) => {
      const next = prev.map((s) => (s.id === id ? { ...s, x, y, color } : s));
      applyTheme(next, intensity, grain, mode);
      return next;
    });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!canvasRef.current) return;
    isDraggingRef.current = true;
    updateStopPosition(activeStopId, e.clientX, e.clientY);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      updateStopPosition(activeStopId, e.clientX, e.clientY);
    };
    const handleMouseUp = () => {
      isDraggingRef.current = false;
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [activeStopId, intensity, grain, mode]);

  const handleAddStop = () => {
    if (stops.length >= 3) return;
    const newId = String(Date.now());
    const x = (stops[stops.length - 1]?.x ?? 0.5) + 0.15;
    const y = 0.4;
    const normalizedX = x > 1 ? x - 1 : x;
    const newStop: ColorStop = {
      id: newId,
      x: normalizedX,
      y,
      color: posToColor(normalizedX, y),
    };
    const nextStops = [...stops, newStop];
    setStops(nextStops);
    setActiveStopId(newId);
    applyTheme(nextStops, intensity, grain, mode);
  };

  const handleRemoveStop = (id: string) => {
    if (stops.length <= 1) return;
    const nextStops = stops.filter((s) => s.id !== id);
    setStops(nextStops);
    setActiveStopId(nextStops[0]?.id ?? "1");
    applyTheme(nextStops, intensity, grain, mode);
  };

  const handleApplyPreset = (p: (typeof ARC_PRESETS)[number]) => {
    const nextStops = p.stops.map((s, idx) => ({
      id: String(idx + 1),
      x: s.x,
      y: s.y,
      color: posToColor(s.x, s.y),
    }));
    setStops(nextStops);
    setActiveStopId(nextStops[0]?.id ?? "1");
    setMode(p.mode);
    applyTheme(nextStops, intensity, grain, p.mode);
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.65)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        userSelect: "none",
      }}
    >
      <div
        style={{
          width: 520,
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-prominent)",
          borderRadius: 14,
          padding: 24,
          boxShadow: "0 24px 64px rgba(0, 0, 0, 0.6)",
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: 6,
                background: "linear-gradient(135deg, var(--accent-base), #ff7b72)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Sparkles size={13} color="#fff" />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>Theme Engine</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Arc-inspired full window color blend</div>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              padding: 4,
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* 2D Arc Color Playground Canvas */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
              Color Blend Wheel ({stops.length}/3)
            </span>
            {stops.length < 3 && (
              <button
                onClick={handleAddStop}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--accent-base)",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                + Add Blend Dot
              </button>
            )}
          </div>

          <div
            ref={canvasRef}
            onMouseDown={handleMouseDown}
            style={{
              width: "100%",
              height: 180,
              borderRadius: 10,
              position: "relative",
              cursor: "crosshair",
              overflow: "hidden",
              border: "1px solid var(--border-prominent)",
              background:
                "linear-gradient(to top, rgba(0,0,0,0.8), transparent), linear-gradient(to right, #ff4d4d, #ffaa00, #33cc33, #00ccff, #9933ff, #ff00aa, #ff4d4d)",
              boxShadow: "inset 0 2px 10px rgba(0,0,0,0.3)",
            }}
          >
            {/* Draggable Pins */}
            {stops.map((stop) => {
              const isActive = stop.id === activeStopId;
              const leftPercent = `${stop.x * 100}%`;
              const topPercent = `${(1 - stop.y) * 100}%`;

              return (
                <div
                  key={stop.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveStopId(stop.id);
                  }}
                  style={{
                    position: "absolute",
                    left: leftPercent,
                    top: topPercent,
                    width: 26,
                    height: 26,
                    borderRadius: "50%",
                    transform: "translate(-50%, -50%)",
                    background: stop.color,
                    border: "3px solid #fff",
                    boxShadow: isActive ? "0 0 0 3px var(--accent-base), 0 4px 12px rgba(0,0,0,0.5)" : "0 2px 8px rgba(0,0,0,0.4)",
                    cursor: "grab",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    zIndex: isActive ? 10 : 5,
                    transition: "box-shadow 0.15s ease",
                  }}
                >
                  {stops.length > 1 && (
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveStop(stop.id);
                      }}
                      title="Remove dot"
                      style={{
                        position: "absolute",
                        top: -8,
                        right: -8,
                        background: "#000",
                        color: "#fff",
                        borderRadius: "50%",
                        width: 14,
                        height: 14,
                        fontSize: 9,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                      }}
                    >
                      ×
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Sliders: Intensity & Grain */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {/* Intensity */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-muted)" }}>
              <span>TINT INTENSITY</span>
              <span style={{ fontWeight: 600 }}>{Math.round(intensity * 100)}%</span>
            </div>
            <input
              type="range"
              min="0.1"
              max="1"
              step="0.05"
              value={intensity}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                setIntensity(val);
                applyTheme(stops, val, grain, mode);
              }}
              style={{ width: "100%", marginTop: 6, accentColor: "var(--accent-base)" }}
            />
          </div>

          {/* Grain */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-muted)" }}>
              <span>ORGANIC GRAIN</span>
              <span style={{ fontWeight: 600 }}>{Math.round(grain * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="0.25"
              step="0.02"
              value={grain}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                setGrain(val);
                applyTheme(stops, intensity, val, mode);
              }}
              style={{ width: "100%", marginTop: 6, accentColor: "var(--accent-base)" }}
            />
          </div>
        </div>

        {/* Mode Toggle & Presets */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          {/* Light/Dark Pill Switcher */}
          <div
            style={{
              display: "flex",
              background: "var(--bg-card)",
              padding: 3,
              borderRadius: 8,
              border: "1px solid var(--border-subtle)",
            }}
          >
            <button
              onClick={() => {
                setMode("dark");
                applyTheme(stops, intensity, grain, "dark");
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "5px 12px",
                borderRadius: 6,
                border: "none",
                background: mode === "dark" ? "var(--bg-elevated)" : "transparent",
                color: mode === "dark" ? "var(--text-primary)" : "var(--text-muted)",
                fontSize: 11,
                fontWeight: mode === "dark" ? 600 : 400,
                cursor: "pointer",
              }}
            >
              <Moon size={12} /> Dark
            </button>
            <button
              onClick={() => {
                setMode("light");
                applyTheme(stops, intensity, grain, "light");
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "5px 12px",
                borderRadius: 6,
                border: "none",
                background: mode === "light" ? "var(--bg-elevated)" : "transparent",
                color: mode === "light" ? "var(--text-primary)" : "var(--text-muted)",
                fontSize: 11,
                fontWeight: mode === "light" ? 600 : 400,
                cursor: "pointer",
              }}
            >
              <Sun size={12} /> Light
            </button>
          </div>

          {/* Preset Buttons */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {ARC_PRESETS.map((p) => (
              <button
                key={p.name}
                onClick={() => handleApplyPreset(p)}
                style={{
                  padding: "4px 8px",
                  borderRadius: 6,
                  border: "1px solid var(--border-subtle)",
                  background: "var(--bg-card)",
                  color: "var(--text-secondary)",
                  fontSize: 10,
                  cursor: "pointer",
                  fontWeight: 500,
                }}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>

        {/* Done Button */}
        <button
          onClick={onClose}
          style={{
            marginTop: 4,
            padding: "10px",
            borderRadius: 8,
            border: "none",
            background: "var(--accent-base)",
            color: "#fff",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Apply Palette
        </button>
      </div>
    </div>
  );
};
