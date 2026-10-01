/**
 * Arc-style colour pad: angle around the centre = hue, distance from the centre = saturation.
 * Dragging the primary dot moves the whole palette together (keeps the harmony); dragging any other dot
 * moves just that dot. Clicking empty space moves the selected dot there.
 */
import React, { useCallback, useMemo, useRef, useState } from "react";
import { arcDotColor, type ArcColor } from "@pi-studio/theme-engine";

interface Props {
  colors: ArcColor[];
  onChange(colors: ArcColor[]): void;
  size?: number;
}

const HUE_STOPS = Array.from({ length: 13 }, (_, i) => `oklch(0.74 0.16 ${i * 30}) ${i * 30}deg`).join(", ");

function toXY(c: ArcColor): { x: number; y: number } {
  const rad = (c.hue * Math.PI) / 180;
  const r = c.sat * 0.44; // keep dots inside the rounded square
  return { x: 0.5 + Math.sin(rad) * r, y: 0.5 - Math.cos(rad) * r };
}

function fromXY(x: number, y: number): ArcColor {
  const dx = x - 0.5;
  const dy = y - 0.5;
  const hue = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
  const sat = Math.min(1, Math.hypot(dx, dy) / 0.44);
  return { hue, sat };
}

export const ArcColorPad: React.FC<Props> = ({ colors, onChange, size = 236 }) => {
  const padRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const drag = useRef<{ index: number; origin: ArcColor[] } | null>(null);

  const pointToColor = useCallback((clientX: number, clientY: number): ArcColor | null => {
    const rect = padRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return fromXY((clientX - rect.left) / rect.width, (clientY - rect.top) / rect.height);
  }, []);

  const move = useCallback(
    (index: number, target: ArcColor, origin: ArcColor[]) => {
      if (index === 0 && origin.length > 1) {
        const base = origin[0]!;
        const dHue = target.hue - base.hue;
        const dSat = target.sat - base.sat;
        onChange(
          origin.map((c, i) =>
            i === 0 ? target : { hue: (c.hue + dHue + 360) % 360, sat: Math.max(0, Math.min(1, c.sat + dSat)) },
          ),
        );
      } else {
        onChange(origin.map((c, i) => (i === index ? target : c)));
      }
    },
    [onChange],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    const dot = (e.target as HTMLElement).closest<HTMLElement>("[data-dot]");
    const index = dot ? Number(dot.dataset.dot) : Math.min(active, colors.length - 1);
    setActive(index);
    drag.current = { index, origin: colors };
    padRef.current?.setPointerCapture(e.pointerId);
    if (!dot) {
      const c = pointToColor(e.clientX, e.clientY);
      if (c) move(index, c, colors);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const c = pointToColor(e.clientX, e.clientY);
    if (c) move(drag.current.index, c, drag.current.origin);
  };

  const endDrag = () => {
    drag.current = null;
  };

  const points = useMemo(() => colors.map(toXY), [colors]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const c = colors[active];
    if (!c) return;
    const step = e.shiftKey ? 10 : 2;
    const next = { ...c };
    if (e.key === "ArrowLeft") next.hue = (c.hue - step + 360) % 360;
    else if (e.key === "ArrowRight") next.hue = (c.hue + step) % 360;
    else if (e.key === "ArrowUp") next.sat = Math.min(1, c.sat + step / 100);
    else if (e.key === "ArrowDown") next.sat = Math.max(0, c.sat - step / 100);
    else return;
    e.preventDefault();
    move(active, next, colors);
  };

  return (
    <div
      ref={padRef}
      className="arc-pad"
      role="slider"
      tabIndex={0}
      aria-label="Theme colour pad. Arrow keys adjust hue and saturation."
      aria-valuetext={colors[active] ? `hue ${Math.round(colors[active]!.hue)}, saturation ${Math.round(colors[active]!.sat * 100)}%` : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
      style={{ width: size, height: size, ["--hue-stops" as string]: HUE_STOPS }}
    >
      <svg className="arc-pad__links" viewBox="0 0 1 1" preserveAspectRatio="none">
        {points.slice(1).map((p, i) => (
          <line key={i} x1={points[0]!.x} y1={points[0]!.y} x2={p.x} y2={p.y} />
        ))}
      </svg>
      {points.map((p, i) => (
        <div
          key={i}
          data-dot={i}
          className={`arc-pad__dot${i === 0 ? " arc-pad__dot--primary" : ""}${i === active ? " is-active" : ""}`}
          style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%`, background: arcDotColor(colors[i]!) }}
        />
      ))}
    </div>
  );
};
