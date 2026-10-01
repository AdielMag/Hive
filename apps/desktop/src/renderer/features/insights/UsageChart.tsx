/** Stacked column chart (SVG) with gridlines, axis labels and a hover tooltip. */
import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import { niceScale, type Series, type StackedColumn, type UsageMetric } from "./usage-series.ts";
import { formatCost, formatTokens } from "../../lib/format.ts";

interface Props {
  series: Series[];
  columns: StackedColumn[];
  max: number;
  metric: UsageMetric;
  xLabel(x: string, index: number): string;
  xTitle(x: string): string;
  /** Show every n-th x label. */
  labelEvery?: number;
}

const H = 220;
const PAD = { top: 12, right: 8, bottom: 26, left: 52 };

export const UsageChart: React.FC<Props> = ({ series, columns, max, metric, xLabel, xTitle, labelEvery = 1 }) => {
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
  const y = (v: number) => PAD.top + innerH - (v / scale.max) * innerH;

  const ticks: number[] = [];
  for (let v = 0; v <= scale.max + 1e-9; v += scale.step) ticks.push(v);

  const hovered = hover !== null ? columns[hover] : null;

  return (
    <div className="usage-chart" ref={wrapRef} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="usage-chart__svg" role="img" aria-label="Usage over time">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className="usage-chart__grid" />
          </g>
        ))}
        {columns.map((c, i) => {
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
