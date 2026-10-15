#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { callJev, loadSettings } from "../agent/extensions/jev.ts";
import { EVAL_CASES } from "./cases.ts";
import { computeMetrics } from "./metrics.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const args = process.argv.slice(2);
  const isDry = args.includes("--dry");

  if (isDry) {
    console.log(`[Eval] Dry run: validating ${EVAL_CASES.length} cases...`);
    for (const c of EVAL_CASES) {
      if (!c.id || typeof c.label !== "boolean" || !c.question?.instructions || !c.state) {
        throw new Error(`Malformed eval case: ${c.id}`);
      }
    }
    const mockResults = EVAL_CASES.map((c) => ({
      id: c.id,
      tag: c.tag,
      label: c.label,
      prob: c.label ? 0.9 : 0.1,
      ms: 150,
      ok: true,
    }));
    const metrics = computeMetrics(mockResults);
    console.log(`[Eval] Validation successful. Synthetic accuracy: ${(metrics.accuracy * 100).toFixed(1)}%`);
    return;
  }

  const settings = loadSettings();
  if (!settings || !settings.apiKey) {
    console.error("[Eval] Error: No HIVE_JEV_CONFIG or apiKey found. Please set HIVE_JEV_CONFIG.");
    process.exit(1);
  }

  console.log(`[Eval] Running evaluation on ${EVAL_CASES.length} cases using model ${settings.model}...`);

  const results: Array<{ id: string; tag: string; label: boolean; prob: number | null; ms: number; ok: boolean }> = [];
  const concurrency = 4;
  let idx = 0;

  async function worker() {
    while (idx < EVAL_CASES.length) {
      const currentIdx = idx++;
      const c = EVAL_CASES[currentIdx]!;
      const started = Date.now();
      try {
        const res = await callJev({
          settings,
          feature: "eval",
          state: c.state,
          questions: { q: c.question },
        });

        const ms = Date.now() - started;
        if (res.ok && res.answers.q && res.answers.q.type === "noul") {
          results[currentIdx] = {
            id: c.id,
            tag: c.tag,
            label: c.label,
            prob: res.answers.q.noul,
            ms,
            ok: true,
          };
        } else {
          results[currentIdx] = {
            id: c.id,
            tag: c.tag,
            label: c.label,
            prob: null,
            ms,
            ok: false,
          };
        }
      } catch {
        results[currentIdx] = {
          id: c.id,
          tag: c.tag,
          label: c.label,
          prob: null,
          ms: Date.now() - started,
          ok: false,
        };
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));

  const metrics = computeMetrics(results);

  console.log("\n=================== EVALUATION RESULTS ===================");
  console.log(`Model:       ${settings.model}`);
  console.log(`Total cases: ${metrics.total} | Errors: ${metrics.errors}`);
  console.log(`Accuracy:    ${(metrics.accuracy * 100).toFixed(1)}%`);
  console.log(`Brier Score: ${metrics.brier.toFixed(4)} (lower is better, 0=perfect)`);
  console.log(`Latency:     p50 = ${metrics.p50Ms}ms | p95 = ${metrics.p95Ms}ms`);

  console.log("\n--- By Tag ---");
  for (const [tag, stat] of Object.entries(metrics.byTag)) {
    console.log(`  ${tag.padEnd(12)}: ${stat.correct}/${stat.total} (${(stat.accuracy * 100).toFixed(1)}%)`);
  }

  console.log("\n--- Calibration Buckets ---");
  for (const b of metrics.buckets) {
    console.log(`  ${b.bucket.padEnd(12)}: count=${String(b.count).padEnd(2)} meanP=${b.meanProb.toFixed(2)} observedRate=${b.observedRate.toFixed(2)}`);
  }

  if (metrics.misclassified.length > 0) {
    console.log("\n--- Misclassified Cases ---");
    for (const m of metrics.misclassified) {
      console.log(`  [${m.id}] expected=${m.expected} actualProb=${m.actualProb.toFixed(3)} (predicted ${m.predicted})`);
    }
  }
  console.log("==========================================================\n");

  // Append history
  try {
    const usageFile = process.env.HIVE_JEV_USAGE || path.join(process.env.APPDATA || "", "@hive/desktop/hive/modules/jev/usage.jsonl");
    const historyFile = path.join(path.dirname(usageFile), "eval-history.jsonl");
    const record = {
      ts: Date.now(),
      model: settings.model,
      n: metrics.total,
      accuracy: Math.round(metrics.accuracy * 1000) / 1000,
      brier: Math.round(metrics.brier * 10000) / 10000,
      p50Ms: metrics.p50Ms,
      p95Ms: metrics.p95Ms,
      errors: metrics.errors,
      buckets: metrics.buckets,
    };
    fs.appendFileSync(historyFile, `${JSON.stringify(record)}\n`, "utf8");
    console.log(`[Eval] Saved history to ${historyFile}`);
  } catch (err) {
    console.warn("[Eval] Could not append to history file:", err);
  }
}

main().catch((err) => {
  console.error("[Eval] Fatal error:", err);
  process.exit(1);
});
