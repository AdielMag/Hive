#!/usr/bin/env node
/**
 * Auto-model router benchmark. Measures how well Jev (ROUTER_QUESTIONS) picks the right tier/model,
 * and compares against the offline heuristic baseline (routeTaskLocally).
 *
 *   node modules/jev/eval/run-router-eval.ts --dry     # validate cases + baseline only, no API
 *   node modules/jev/eval/run-router-eval.ts           # live run (needs HIVE_JEV_CONFIG)
 *   flags: --json  --limit=N  --concurrency=N
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { callJev, loadSettings } from "../agent/extensions/jev.ts";
import {
  buildRouterState,
  classifyModelTier,
  resolveRouterDecision,
  ROUTER_QUESTIONS,
  routeTaskLocally,
  selectModelForTier,
} from "../src/router.ts";
import type { CandidateModel } from "../src/shared.ts";
import { ROUTER_CASES, type RouterCase } from "./router-cases.ts";
import { computeRouterMetrics, TIERS, type RouterMetrics, type RouterResult } from "./router-metrics.ts";

/** Fixed candidate pool so model selection is reproducible. */
export const CANDIDATES: CandidateModel[] = [
  { id: "claude-haiku-4-5", provider: "anthropic", name: "Claude Haiku 4.5", cost: { input: 1 }, contextWindow: 200000 },
  { id: "claude-sonnet-4-6", provider: "anthropic", name: "Claude Sonnet 4.6", cost: { input: 3 }, contextWindow: 200000 },
  { id: "claude-opus-4-6", provider: "anthropic", name: "Claude Opus 4.6", cost: { input: 15 }, reasoning: true, contextWindow: 200000 },
  { id: "gpt-5-nano", provider: "openai", name: "GPT-5 nano", cost: { input: 0.05 }, contextWindow: 400000 },
  { id: "gpt-5", provider: "openai", name: "GPT-5", cost: { input: 1.25 }, reasoning: true, contextWindow: 400000 },
  { id: "gpt-5-pro", provider: "openai", name: "GPT-5 Pro", cost: { input: 15 }, reasoning: true, contextWindow: 400000 },
  { id: "gemini-3-flash", provider: "google", name: "Gemini 3 Flash", cost: { input: 0.3 }, contextWindow: 1000000 },
  { id: "gemini-3-pro", provider: "google", name: "Gemini 3 Pro", cost: { input: 2 }, reasoning: true, contextWindow: 1000000 },
];

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

function print(title: string, m: RouterMetrics) {
  console.log(`\n=== ${title} ===`);
  console.log(`Cases: ${m.total} | Errors: ${m.errors}`);
  console.log(`Tier accuracy:      ${pct(m.tierAccuracy)}`);
  console.log(`Within-one tier:    ${pct(m.withinOneAccuracy)}`);
  console.log(`Over-provisioned:   ${pct(m.overProvisioned)} (wasted cost)`);
  console.log(`Under-provisioned:  ${pct(m.underProvisioned)} (quality risk)`);
  console.log(`Reasoning accuracy: ${pct(m.reasoningAccuracy)}`);
  console.log(`Model selection:    ${pct(m.selectionAccuracy)}`);
  console.log(`Latency:            p50=${m.p50Ms}ms p95=${m.p95Ms}ms | mean confidence ${m.meanConfidence.toFixed(2)}`);
  console.log("Confusion (rows=expected, cols=predicted fast/balanced/heavy):");
  for (const e of TIERS) {
    const row = TIERS.map((p) => String(m.confusion[e][p]).padStart(3)).join(" ");
    console.log(`  ${e.padEnd(9)} ${row}   acc ${pct(m.perTier[e].accuracy)}`);
  }
  if (m.misrouted.length > 0) {
    console.log("Misrouted:");
    for (const x of m.misrouted) {
      const conf = x.confidence != null ? ` conf=${x.confidence.toFixed(2)}` : "";
      console.log(`  [${x.id}] expected=${x.expected} got=${x.predicted}${conf}`);
    }
  }
}

function baseline(cases: RouterCase[]): RouterResult[] {
  return cases.map((c) => {
    const r = routeTaskLocally(c.task, CANDIDATES);
    const sel = selectModelForTier(r.tier, CANDIDATES);
    return {
      id: c.id,
      expectedTier: c.tier,
      expectedReasoning: c.reasoning,
      predictedTier: r.tier,
      predictedReasoning: r.reasoning,
      selectedModel: sel ? `${sel.provider}/${sel.id}` : null,
      selectedTier: sel ? classifyModelTier(sel) : null,
      confidence: r.confidence,
      ms: 0,
      ok: r.ok,
    };
  });
}

async function main() {
  const limit = Number(arg("limit")) || ROUTER_CASES.length;
  const cases = ROUTER_CASES.slice(0, limit);
  const asJson = process.argv.includes("--json");

  const ids = new Set<string>();
  for (const c of cases) {
    if (!c.id || !c.task || ids.has(c.id)) throw new Error(`Malformed/duplicate router case: ${c.id}`);
    ids.add(c.id);
  }
  const base = computeRouterMetrics(baseline(cases));

  if (process.argv.includes("--dry")) {
    console.log(`[RouterEval] Dry run: ${cases.length} cases valid.`);
    print("Heuristic baseline (routeTaskLocally)", base);
    return;
  }

  const settings = loadSettings();
  if (!settings || !settings.apiKey) {
    console.error("[RouterEval] No HIVE_JEV_CONFIG / apiKey. Set HIVE_JEV_CONFIG to your Jev config.json.");
    process.exit(1);
  }

  const results: RouterResult[] = new Array(cases.length);
  let idx = 0;
  const concurrency = Number(arg("concurrency")) || 4;

  async function worker() {
    while (idx < cases.length) {
      const i = idx++;
      const c = cases[i] as RouterCase;
      const started = Date.now();
      const fail: RouterResult = {
        id: c.id,
        expectedTier: c.tier,
        expectedReasoning: c.reasoning,
        predictedTier: null,
        predictedReasoning: null,
        selectedModel: null,
        selectedTier: null,
        confidence: null,
        ms: 0,
        ok: false,
      };
      try {
        // Same call shape as routeTaskWithJev in production.
        const res = await callJev({
          settings: settings!,
          feature: "eval",
          state: buildRouterState(c.task, c.context),
          questions: ROUTER_QUESTIONS,
          timeoutMs: 8_000,
        });
        const ms = Date.now() - started;
        if (!res.ok) {
          results[i] = { ...fail, ms };
          continue;
        }
        const d = resolveRouterDecision(res.answers);
        const sel = selectModelForTier(d.tier, CANDIDATES);
        results[i] = {
          ...fail,
          predictedTier: d.tier,
          predictedReasoning: d.reasoning,
          confidence: d.confidence,
          ms,
          ok: true,
          selectedModel: sel ? `${sel.provider}/${sel.id}` : null,
          selectedTier: sel ? classifyModelTier(sel) : null,
        };
      } catch {
        results[i] = { ...fail, ms: Date.now() - started };
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));

  const m = computeRouterMetrics(results);
  const reasonMiss = results.filter((x) => x.ok && x.predictedReasoning !== x.expectedReasoning).map((x) => `${x.id}(exp ${x.expectedReasoning}, got ${x.predictedReasoning})`);
  if (!asJson && reasonMiss.length) console.log(`
Reasoning misses: ${reasonMiss.join(", ")}`);
  const holdIds = new Set(cases.filter((c) => c.holdout).map((c) => c.id));
  const hold = computeRouterMetrics(results.filter((x) => holdIds.has(x.id)));
  const dev = computeRouterMetrics(results.filter((x) => !holdIds.has(x.id)));
  if (asJson) {
    console.log(JSON.stringify({ model: settings.model, jev: m, dev, holdout: hold, baseline: base }, null, 2));
  } else {
    console.log(`[RouterEval] Jev model: ${settings.model}`);
    print("Jev router", m);
    print("Heuristic baseline", base);
    console.log(`\nDev set (${dev.total}): tier ${pct(dev.tierAccuracy)}, under ${pct(dev.underProvisioned)}, over ${pct(dev.overProvisioned)}`);
    console.log(`Hold-out set (${hold.total}): tier ${pct(hold.tierAccuracy)}, under ${pct(hold.underProvisioned)}, over ${pct(hold.overProvisioned)}`);
    console.log(`\nJev vs baseline tier accuracy: ${pct(m.tierAccuracy)} vs ${pct(base.tierAccuracy)}`);
  }

  try {
    const usageFile = process.env.HIVE_JEV_USAGE || path.join(process.env.APPDATA || "", "@hive/desktop/hive/modules/jev/usage.jsonl");
    const file = path.join(path.dirname(usageFile), "router-eval-history.jsonl");
    const rec = {
      ts: Date.now(),
      model: settings.model,
      n: m.total,
      errors: m.errors,
      tierAccuracy: m.tierAccuracy,
      withinOne: m.withinOneAccuracy,
      over: m.overProvisioned,
      under: m.underProvisioned,
      reasoning: m.reasoningAccuracy,
      selection: m.selectionAccuracy,
      p50Ms: m.p50Ms,
      p95Ms: m.p95Ms,
      baselineAccuracy: base.tierAccuracy,
    };
    fs.appendFileSync(file, `${JSON.stringify(rec)}\n`, "utf8");
    if (!asJson) console.log(`[RouterEval] History saved to ${file}`);
  } catch (e) {
    console.warn("[RouterEval] Could not write history:", e);
  }
}

main().catch((e) => {
  console.error("[RouterEval] Fatal:", e);
  process.exit(1);
});
