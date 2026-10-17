/** Monotone cubic (Fritsch–Carlson) interpolation → cubic-bezier SVG path. Never overshoots the data, so a curve can't dip below the zero line. */
export function monotoneSplinePath(points: Array<[number, number]>, minY = -Infinity, maxY = Infinity): string {
  const n = points.length;
  if (n === 0) return "";
  const clamp = (v: number): number => Math.min(maxY, Math.max(minY, v));
  const f = (v: number): string => v.toFixed(1);
  if (n === 1) return `M ${f(points[0]![0])},${f(clamp(points[0]![1]))}`;

  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const w = points[i + 1]![0] - points[i]![0];
    dx.push(w);
    slope.push(w === 0 ? 0 : (points[i + 1]![1] - points[i]![1]) / w);
  }
  const m: number[] = new Array<number>(n);
  m[0] = slope[0]!;
  m[n - 1] = slope[n - 2]!;
  for (let i = 1; i < n - 1; i++) m[i] = slope[i - 1]! * slope[i]! <= 0 ? 0 : (slope[i - 1]! + slope[i]!) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i]! / slope[i]!;
    const b = m[i + 1]! / slope[i]!;
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * slope[i]!;
      m[i + 1] = t * b * slope[i]!;
    }
  }

  let d = `M ${f(points[0]![0])},${f(clamp(points[0]![1]))}`;
  for (let i = 0; i < n - 1; i++) {
    const [x1, y1] = points[i]!;
    const [x2, y2] = points[i + 1]!;
    const w = dx[i]! / 3;
    d += ` C ${f(x1 + w)},${f(clamp(y1 + m[i]! * w))} ${f(x2 - w)},${f(clamp(y2 - m[i + 1]! * w))} ${f(x2)},${f(clamp(y2))}`;
  }
  return d;
}
