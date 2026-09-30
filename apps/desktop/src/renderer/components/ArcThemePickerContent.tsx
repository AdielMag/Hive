import React, { useState, useRef, useEffect, useCallback } from "react";
import { Sparkles, Sun, Moon, Layers } from "lucide-react";
import { generateTheme, tokensToCssVars } from "@pi-studio/theme-engine";

interface ColorPin {
  id: string;
  x: number; // 0 to 1 -> Hue: 0 to 360
  y: number; // 0 to 1 -> Chroma: 0.04 to 0.26
  color: string;
}

const ARC_SIGNATURE_PRESETS = [
  {
    name: "Arc Cobalt",
    pins: [{ x: 0.68, y: 0.45 }],
    mode: "dark" as const,
    split: ["#388bfd", "#1f6feb"],
  },
  {
    name: "Sunset Coral",
    pins: [
      { x: 0.04, y: 0.45 },
      { x: 0.82, y: 0.5 },
    ],
    mode: "dark" as const,
    split: ["#ff6b6b", "#9d4edd"],
  },
  {
    name: "Matcha Sage",
    pins: [
      { x: 0.38, y: 0.4 },
      { x: 0.48, y: 0.35 },
    ],
    mode: "dark" as const,
    split: ["#52b788", "#2d6a4f"],
  },
  {
    name: "Cyber Neon",
    pins: [
      { x: 0.92, y: 0.5 },
      { x: 0.53, y: 0.45 },
    ],
    mode: "dark" as const,
    split: ["#f72585", "#4cc9f0"],
  },
  {
    name: "Cosmic",
    pins: [
      { x: 0.78, y: 0.45 },
      { x: 0.65, y: 0.5 },
    ],
    mode: "dark" as const,
    split: ["#7209b7", "#4361ee"],
  },
  {
    name: "Obsidian",
    pins: [{ x: 0.65, y: 0.05 }],
    mode: "dark" as const,
    split: ["#2d3748", "#1a202c"],
  },
  {
    name: "Nordic Clean",
    pins: [
      { x: 0.55, y: 0.35 },
      { x: 0.08, y: 0.25 },
    ],
    mode: "light" as const,
    split: ["#48cae4", "#caf0f8"],
  },
];

function pinToOklch(x: number, y: number): string {
  const hue = Math.round(x * 360);
  const chroma = 0.04 + y * 0.22;
  return `oklch(0.72 ${chroma.toFixed(3)} ${hue})`;
}

export const ArcThemePickerContent: React.FC = () => {
  const [pins, setPins] = useState<ColorPin[]>([
    { id: "p1", x: 0.68, y: 0.45, color: pinToOklch(0.68, 0.45) },
  ]);
  const [activePinId, setActivePinId] = useState<string>("p1");
  const [intensity, setIntensity] = useState(0.45);
  const [grain, setGrain] = useState(0.08);
  const [mode, setMode] = useState<"dark" | "light">("dark");

  const canvasRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  const applyLiveTheme = useCallback(
    (curPins: ColorPin[], curIntensity: number, curGrain: number, curMode: "dark" | "light") => {
      const colors = curPins.map((p) => p.color);
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
      document.documentElement.style.setProperty("--grain-opacity", String(curGrain));
    },
    [],
  );

  const updatePinFromClient = (id: string, clientX: number, clientY: number) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const rawX = (clientX - rect.left) / rect.width;
    const rawY = 1 - (clientY - rect.top) / rect.height;

    const x = Math.max(0, Math.min(1, rawX));
    const y = Math.max(0, Math.min(1, rawY));
    const color = pinToOklch(x, y);

    setPins((prev) => {
      const next = prev.map((p) => (p.id === id ? { ...p, x, y, color } : p));
      applyLiveTheme(next, intensity, grain, mode);
      return next;
    });
  };

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    updatePinFromClient(activePinId, e.clientX, e.clientY);
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      updatePinFromClient(activePinId, e.clientX, e.clientY);
    };
    const onUp = () => {
      isDraggingRef.current = false;
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [activePinId, intensity, grain, mode]);

  const toggleDualMode = () => {
    if (pins.length === 1) {
      const p1 = pins[0]!;
      const secondX = (p1.x + 0.25) % 1;
      const secondY = 0.45;
      const next: ColorPin[] = [
        p1,
        { id: "p2", x: secondX, y: secondY, color: pinToOklch(secondX, secondY) },
      ];
      setPins(next);
      setActivePinId("p2");
      applyLiveTheme(next, intensity, grain, mode);
    } else {
      const single = [pins[0]!];
      setPins(single);
      setActivePinId(single[0]!.id);
      applyLiveTheme(single, intensity, grain, mode);
    }
  };

  const handlePreset = (p: (typeof ARC_SIGNATURE_PRESETS)[number]) => {
    const next = p.pins.map((pin, idx) => ({
      id: `p${idx + 1}`,
      x: pin.x,
      y: pin.y,
      color: pinToOklch(pin.x, pin.y),
    }));
    setPins(next);
    setActivePinId(next[0]!.id);
    setMode(p.mode);
    applyLiveTheme(next, intensity, grain, p.mode);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* 2D Arc Color Canvas */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", letterSpacing: "0.04em" }}>
            ARC 2D COLOR BLEND
          </span>

          <button
            onClick={toggleDualMode}
            style={{
              background: "rgba(255, 255, 255, 0.06)",
              border: "1px solid var(--border-subtle)",
              borderRadius: 6,
              padding: "2px 8px",
              fontSize: 11,
              color: "var(--accent-hover)",
              cursor: "pointer",
              fontWeight: 500,
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <Layers size={11} />
            <span>{pins.length > 1 ? "Two-Tone Blend" : "+ Dual Color Blend"}</span>
          </button>
        </div>

        <div
          ref={canvasRef}
          onMouseDown={handleCanvasMouseDown}
          style={{
            width: "100%",
            height: 160,
            borderRadius: 12,
            position: "relative",
            cursor: "crosshair",
            overflow: "hidden",
            border: "1px solid rgba(255, 255, 255, 0.12)",
            background: `
              radial-gradient(ellipse at 50% 50%, rgba(255,255,255,0.15) 0%, transparent 80%),
              linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 70%),
              linear-gradient(to right,
                #ff3366 0%,
                #ff9933 16%,
                #ffea00 32%,
                #33cc66 48%,
                #00ccff 64%,
                #7733ff 80%,
                #ff00cc 92%,
                #ff3366 100%
              )
            `,
            boxShadow: "inset 0 2px 16px rgba(0, 0, 0, 0.45)",
          }}
        >
          {pins.map((pin) => {
            const isSelected = pin.id === activePinId;
            const left = `${pin.x * 100}%`;
            const top = `${(1 - pin.y) * 100}%`;

            return (
              <div
                key={pin.id}
                onClick={(e) => {
                  e.stopPropagation();
                  setActivePinId(pin.id);
                }}
                style={{
                  position: "absolute",
                  left,
                  top,
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  transform: "translate(-50%, -50%)",
                  background: pin.color,
                  border: "3px solid #ffffff",
                  boxShadow: isSelected
                    ? `0 0 0 3px var(--accent-base), 0 6px 18px rgba(0,0,0,0.6)`
                    : "0 4px 12px rgba(0,0,0,0.45)",
                  cursor: "grab",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  zIndex: isSelected ? 10 : 5,
                  transition: "box-shadow 0.15s ease",
                }}
              >
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff", opacity: 0.9 }} />
              </div>
            );
          })}
        </div>
      </div>

      {/* Sliders: Vibrancy & Grain */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-muted)" }}>
            <span style={{ fontWeight: 600 }}>VIBRANCY</span>
            <span style={{ fontFamily: "var(--font-mono)" }}>{Math.round(intensity * 100)}%</span>
          </div>
          <input
            type="range"
            min="0.05"
            max="1"
            step="0.05"
            value={intensity}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              setIntensity(val);
              applyLiveTheme(pins, val, grain, mode);
            }}
            style={{ width: "100%", accentColor: "var(--accent-base)", cursor: "pointer" }}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-muted)" }}>
            <span style={{ fontWeight: 600 }}>TEXTURE GRAIN</span>
            <span style={{ fontFamily: "var(--font-mono)" }}>{Math.round(grain * 100)}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="0.25"
            step="0.01"
            value={grain}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              setGrain(val);
              applyLiveTheme(pins, intensity, val, mode);
            }}
            style={{ width: "100%", accentColor: "var(--accent-base)", cursor: "pointer" }}
          />
        </div>
      </div>

      {/* Mode Switch & Presets */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        {/* Dark / Light Toggle */}
        <div
          style={{
            display: "flex",
            background: "rgba(0,0,0,0.3)",
            padding: 3,
            borderRadius: 8,
            border: "1px solid var(--border-subtle)",
          }}
        >
          <button
            onClick={() => {
              setMode("dark");
              applyLiveTheme(pins, intensity, grain, "dark");
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "5px 10px",
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
              applyLiveTheme(pins, intensity, grain, "light");
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "5px 10px",
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

        {/* Presets */}
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {ARC_SIGNATURE_PRESETS.slice(0, 5).map((p) => (
            <button
              key={p.name}
              onClick={() => handlePreset(p)}
              title={p.name}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "3px 7px",
                borderRadius: 5,
                border: "1px solid var(--border-subtle)",
                background: "rgba(255,255,255,0.04)",
                color: "var(--text-secondary)",
                fontSize: 10,
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background:
                    p.split.length > 1
                      ? `linear-gradient(135deg, ${p.split[0]} 50%, ${p.split[1]} 50%)`
                      : p.split[0],
                }}
              />
              <span>{p.name.split(" ")[0]}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
