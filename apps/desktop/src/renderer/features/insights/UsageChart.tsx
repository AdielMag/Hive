/** Stacked column & animated spline line chart (SVG) with gridlines, axis labels and interactive tooltip. */
import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import { niceScale, type Series, type StackedColumn, type UsageMetric } from "./usage-series.ts";
import { formatCost, formatTokens } from "../../lib/format.ts";

export type ChartType = "bars" | "line";

interface Props {
  series: Series[];
  columns: StackedColumn[];
  max: number;
  metric: UsageMetric;
  chartType?: ChartType;
  xLabel(x: string, index: number): string;
  xTitle(x: string): string;
  /** Show every n-th x label. */
  labelEvery?: number;
}

const H = 220;
const PAD = { top: 12, right: 8, bottom: 26, left: 52 };

/** Catmull-Rom spline converted to cubic bezier SVG path string */
function getSmoothSplinePath(points: Array<[number, number]>): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0]![0]},${points[0]![1]}`;

  let d = `M ${points[0]![0].toFixed(1)},${points[0]![1].toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[Math.min(points.length - 1, i + 2)]!;

    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;

    d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

export const UsageChart: React.FC<Props> = ({
  series,
  columns,
  max,
  metric,
  chartType = "bars",
  xLabel,
  xTitle,
  labelEvery = 1,
}) => {
  const [hover, setHover] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const fmt = metric === "cost" ? formatCost : formatTokens;
  const scale = useMemo(() => niceScale(max), [max]);
  const n = columns.length;

  const [W, setW] = useState(800);
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(200, Math.round(e!.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const slot = innerW / Math.max(1, n);
  const barW = Math.max(2, Math.min(42, slot * 0.62));
  const y = (v: number) => PAD.top + innerH - (scale.max > 0 ? (v / scale.max) * innerH : 0);

  const ticks: number[] = [];
  for (let v = 0; v <= scale.max + 1e-9; v += scale.step) ticks.push(v);

  const hovered = hover !== null ? columns[hover] : null;

  // Build points for line / area charts
  const totalPoints = useMemo<Array<[number, number]>>(() => {
    return columns.map((c, i) => {
      const cx = PAD.left + slot * i + slot / 2;
      return [cx, y(c.total)];
    });
  }, [columns, slot, scale.max]);

  const seriesPoints = useMemo(() => {
    return series.map((_, si) => {
      return columns.map((c, i) => {
        const cx = PAD.left + slot * i + slot / 2;
        return [cx, y(c.values[si] ?? 0)] as [number, number];
      });
    });
  }, [series, columns, slot, scale.max]);

  const totalSpline = useMemo(() => getSmoothSplinePath(totalPoints), [totalPoints]);

  const areaPath = useMemo(() => {
    if (totalPoints.length === 0) return "";
    const firstX = totalPoints[0]![0];
    const lastX = totalPoints[totalPoints.length - 1]![0];
    const bottomY = PAD.top + innerH;
    return `${totalSpline} L ${lastX.toFixed(1)},${bottomY.toFixed(1)} L ${firstX.toFixed(1)},${bottomY.toFixed(1)} Z`;
  }, [totalSpline, totalPoints, innerH]);

  return (
    <div className="usage-chart" ref={wrapRef} onMouseLeave={() => setHover(null)}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        className="usage-chart__svg"
        role="img"
        aria-label="Usage over time"
      >
        <defs>
          <linearGradient id="usageTotalAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent-base)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="var(--accent-base)" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Gridlines */}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className="usage-chart__grid" />
          </g>
        ))}

        {/* LINE & AREA MODE */}
        {chartType === "line" && (
          <g className="usage-chart__lines">
            {/* Area Fill */}
            {totalPoints.length > 1 && (
              <path
                d={areaPath}
                fill="url(#usageTotalAreaGrad)"
                className="usage-chart__area"
              />
            )}

            {/* Individual Series Curves */}
            {series.map((s, si) => {
              const pts = seriesPoints[si];
              if (!pts || pts.length < 2) return null;
              const pathD = getSmoothSplinePath(pts);
              return (
                <path
                  key={s.key}
                  d={pathD}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={hover !== null && (columns[hover]?.values[si] ?? 0) > 0 ? 2.6 : 1.8}
                  strokeOpacity={hover === null ? 0.85 : (columns[hover]?.values[si] ?? 0) > 0 ? 1 : 0.35}
                  className="usage-chart__line"
                />
              );
            })}

            {/* Total Line Curve */}
            {totalPoints.length > 1 && (
              <path
                d={totalSpline}
                fill="none"
                stroke="var(--accent-base)"
                strokeWidth={2.5}
                className="usage-chart__line"
              />
            )}

            {/* Hover Crosshair & Data Points */}
            {hover !== null && (
              <g pointerEvents="none">
                <line
                  x1={PAD.left + slot * hover + slot / 2}
                  x2={PAD.left + slot * hover + slot / 2}
                  y1={PAD.top}
                  y2={PAD.top + innerH}
                  className="usage-chart__crosshair"
                />
                {/* Total point */}
                {totalPoints[hover] && (
                  <circle
                    cx={totalPoints[hover]![0]}
                    cy={totalPoints[hover]![1]}
                    r={5}
                    fill="var(--accent-base)"
                    stroke="#fff"
                    strokeWidth={2}
                    className="usage-chart__dot"
                  />
                )}
                {/* Series points */}
                {series.map((s, si) => {
                  const pt = seriesPoints[si]?.[hover];
                  const val = columns[hover]?.values[si] ?? 0;
                  if (!pt || val <= 0) return null;
                  return (
                    <circle
                      key={s.key}
                      cx={pt[0]}
                      cy={pt[1]}
                      r={4}
                      fill={s.color}
                      stroke="var(--bg-card)"
                      strokeWidth={1.5}
                      className="usage-chart__dot"
                    />
                  );
                })}
              </g>
            )}
          </g>
        )}

        {/* BAR COLUMNS MODE */}
        {chartType === "bars" &&
          columns.map((c, i) => {
            const cx = PAD.left + slot * i + slot / 2;
            let acc = 0;
            return (
              <g key={c.x} onMouseEnter={() => setHover(i)} className={hover === i ? "is-hover" : undefined}>
                <rect x={PAD.left + slot * i} y={PAD.top} width={slot} height={innerH} className="usage-chart__hit" />
                {c.values.map((v, si) => {
                  if (v <= 0) return null;
                  const y0 = y(acc);
                  acc += v;
                  const y1 = y(acc);
                  const isTop = acc >= c.total - 1e-9;
                  return (
                    <rect
                      key={si}
                      x={cx - barW / 2}
                      y={y1}
                      width={barW}
                      height={Math.max(0.5, y0 - y1)}
                      rx={isTop ? Math.min(4, barW / 3) : 0}
                      fill={series[si]!.color}
                      className="usage-chart__bar"
                    />
                  );
                })}
              </g>
            );
          })}

        {/* Hit Rectangles for Line Mode */}
        {chartType === "line" &&
          columns.map((c, i) => (
            <rect
              key={c.x}
              x={PAD.left + slot * i}
              y={PAD.top}
              width={slot}
              height={innerH}
              className="usage-chart__hit"
              onMouseEnter={() => setHover(i)}
            />
          ))}
      </svg>

      {/* HTML overlays keep text crisp regardless of SVG scaling */}
      <div className="usage-chart__yaxis" style={{ top: 0, height: H }}>
        {ticks.map((t) => (
          <span key={t} style={{ top: `${(y(t) / H) * 100}%` }}>
            {fmt(t)}
          </span>
        ))}
      </div>
      <div className="usage-chart__xaxis" style={{ left: `${(PAD.left / W) * 100}%`, right: `${(PAD.right / W) * 100}%` }}>
        {columns.map((c, i) => (
          <span key={c.x} style={{ left: `${((i + 0.5) / n) * 100}%` }} className={hover === i ? "is-hover" : undefined}>
            {i % labelEvery === 0 || hover === i ? xLabel(c.x, i) : ""}
          </span>
        ))}
      </div>

      {hovered && hover !== null && (
        <div
          className="usage-chart__tip"
          style={{
            left: `${((PAD.left + slot * hover + slot / 2) / W) * 100}%`,
            transform: hover > n * 0.6 ? "translateX(calc(-100% - 12px))" : "translateX(12px)",
          }}
        >
          <div className="usage-chart__tip-title">{xTitle(hovered.x)}</div>
          <div className="usage-chart__tip-total">{fmt(hovered.total)}</div>
          {series.map((s, si) =>
            hovered.values[si]! > 0 ? (
              <div key={s.key} className="usage-chart__tip-row">
                <i style={{ background: s.color }} />
                <span>{s.label}</span>
                <b>{fmt(hovered.values[si]!)}</b>
              </div>
            ) : null,
          )}
          {hovered.total === 0 && <div className="usage-chart__tip-row">No activity</div>}
        </div>
      )}
    </div>
  );
};
