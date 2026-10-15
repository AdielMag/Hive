export interface EvalCase {
  id: string;
  tag: "bug" | "clean" | "log-fail" | "log-pass" | "security";
  label: boolean; // true = buggy/failing/insecure, false = clean/passing
  question: {
    type: "noul";
    instructions: string;
    true_means?: string;
    false_means?: string;
  };
  state: Record<string, unknown>;
}

export interface BucketStats {
  bucket: string;
  count: number;
  meanProb: number;
  observedRate: number;
}

export interface EvalMetrics {
  total: number;
  accuracy: number;
  brier: number;
  p50Ms: number;
  p95Ms: number;
  errors: number;
  byTag: Record<string, { total: number; correct: number; accuracy: number }>;
  buckets: BucketStats[];
  misclassified: Array<{ id: string; expected: boolean; actualProb: number; predicted: boolean }>;
}

export function computeMetrics(
  results: Array<{ id: string; tag: string; label: boolean; prob: number | null; ms: number; ok: boolean }>,
): EvalMetrics {
  const valid = results.filter((r) => r.ok && r.prob !== null && Number.isFinite(r.prob));
  const errors = results.length - valid.length;
  const misclassified: EvalMetrics["misclassified"] = [];
  const byTag: EvalMetrics["byTag"] = {};

  let correctCount = 0;
  let brierSum = 0;

  for (const r of results) {
    if (!byTag[r.tag]) {
      byTag[r.tag] = { total: 0, correct: 0, accuracy: 0 };
    }
    const t = byTag[r.tag]!;
    t.total += 1;
  }

  for (const r of valid) {
    const p = r.prob!;
    const predicted = p >= 0.5;
    const isCorrect = predicted === r.label;
    if (isCorrect) {
      correctCount += 1;
      const t = byTag[r.tag]!;
      t.correct += 1;
    } else {
      misclassified.push({ id: r.id, expected: r.label, actualProb: p, predicted });
    }
    const y = r.label ? 1 : 0;
    brierSum += Math.pow(p - y, 2);
  }

  for (const tag of Object.keys(byTag)) {
    const t = byTag[tag]!;
    t.accuracy = t.total > 0 ? t.correct / t.total : 0;
  }

  // 5 calibration buckets: [0, 0.2), [0.2, 0.4), [0.4, 0.6), [0.6, 0.8), [0.8, 1.0]
  const bucketRanges = [
    { name: "[0.0-0.2)", min: 0.0, max: 0.2 },
    { name: "[0.2-0.4)", min: 0.2, max: 0.4 },
    { name: "[0.4-0.6)", min: 0.4, max: 0.6 },
    { name: "[0.6-0.8)", min: 0.6, max: 0.8 },
    { name: "[0.8-1.0]", min: 0.8, max: 1.0001 },
  ];

  const buckets: BucketStats[] = bucketRanges.map((range) => {
    const inBucket = valid.filter((r) => r.prob! >= range.min && r.prob! < range.max);
    const count = inBucket.length;
    const meanProb = count > 0 ? inBucket.reduce((sum, r) => sum + r.prob!, 0) / count : 0;
    const observedRate = count > 0 ? inBucket.filter((r) => r.label).length / count : 0;
    return {
      bucket: range.name,
      count,
      meanProb,
      observedRate,
    };
  });

  const sortedMs = valid.map((r) => r.ms).sort((a, b) => a - b);
  const p50Ms = sortedMs.length > 0 ? (sortedMs[Math.floor(sortedMs.length * 0.5)] ?? 0) : 0;
  const p95Ms = sortedMs.length > 0 ? (sortedMs[Math.floor(sortedMs.length * 0.95)] ?? 0) : 0;

  return {
    total: results.length,
    accuracy: valid.length > 0 ? correctCount / valid.length : 0,
    brier: valid.length > 0 ? brierSum / valid.length : 0,
    p50Ms,
    p95Ms,
    errors,
    byTag,
    buckets,
    misclassified,
  };
}
