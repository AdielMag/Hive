import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  classifyRouteTier,
  loadRouterPrefs,
  pickRouteModel,
  buildRouterQuestions as extBuildRouterQuestions,
  ROUTER_QUESTIONS as EXT_ROUTER_QUESTIONS,
  routeTaskWithJev,
  selectRouteModel,
} from "../agent/extensions/jev.ts";
import {
  buildRouterQuestions,
  classifyModelTier,
  enabledCandidates,
  pickRoutedModel,
  resolveRouterDecision,
  ROUTER_QUESTIONS,
  routeTaskLocally,
  selectModelForTier,
} from "./router.ts";
import { applyPatch, DEFAULT_ROUTER_PROMPT, DEFAULT_ROUTER_SETTINGS, DEFAULT_SETTINGS, normalizeRouterSettings, normalizeSettings, type CandidateModel } from "./shared.ts";

const flash: CandidateModel = { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: "google", cost: { input: 0.15 } };
const haiku: CandidateModel = { id: "claude-haiku-4-5", name: "Claude Haiku", provider: "anthropic", cost: { input: 1 } };
const sonnet: CandidateModel = { id: "claude-sonnet-4-5", name: "Claude Sonnet", provider: "anthropic", cost: { input: 3 } };
const opus: CandidateModel = { id: "claude-opus-4-5", name: "Claude Opus", provider: "anthropic", reasoning: true, cost: { input: 15 } };
const all = [flash, haiku, sonnet, opus];

describe("router settings", () => {
  it("defaults keep the old behaviour", () => {
    expect(normalizeSettings(null).router).toEqual(DEFAULT_ROUTER_SETTINGS);
    expect(DEFAULT_SETTINGS.router.useJev).toBe(true);
  });

  it("normalizes untrusted input", () => {
    const r = normalizeRouterSettings({
      useJev: "no",
      tierModels: { fast: " google/gemini-2.5-flash ", balanced: "nope", heavy: 3 },
      excluded: ["a/b", "a/b", "bad", 4],
      minConfidence: 7,
      applyThinking: false,
    });
    expect(r).toEqual({
      useJev: true,
      tierModels: { fast: "google/gemini-2.5-flash", balanced: null, heavy: null },
      excluded: ["a/b"],
      applyThinking: false,
      minConfidence: 1,
      notify: true,
      jevModel: null,
      prompt: DEFAULT_ROUTER_PROMPT,
    });
  });

  it("normalizes jevModel: trimmed, non-empty, at most 100 chars", () => {
    expect(normalizeRouterSettings({ jevModel: "  jev-1.13.0 " }).jevModel).toBe("jev-1.13.0");
    expect(normalizeRouterSettings({ jevModel: "   " }).jevModel).toBeNull();
    expect(normalizeRouterSettings({ jevModel: "x".repeat(100) }).jevModel).toBe("x".repeat(100));
    expect(normalizeRouterSettings({ jevModel: "x".repeat(101) }).jevModel).toBeNull();
    expect(normalizeRouterSettings({ jevModel: 5 }).jevModel).toBeNull();
    expect(normalizeRouterSettings({}).jevModel).toBeNull();
  });

  it("normalizes prompt overrides: trim, cap, blank and non-strings become null", () => {
    const r = normalizeRouterSettings({
      prompt: {
        tierInstructions: `  ${"i".repeat(2_500)}  `,
        tierCriteria: { fast: "  quick  ", balanced: "   ", heavy: "h".repeat(1_500), extra: "ignored" },
        reasoningInstructions: 42,
        reasoningCriteria: { off: null, low: ["x"], high: "deep" },
      },
    }).prompt;
    expect(r.tierInstructions).toBe("i".repeat(2_000));
    expect(r.tierCriteria).toEqual({ fast: "quick", balanced: null, heavy: "h".repeat(1_000) });
    expect(r.reasoningInstructions).toBeNull();
    expect(r.reasoningCriteria).toEqual({ off: null, low: null, high: "deep" });
    for (const bad of [null, "x", 3, [], { tierCriteria: "x", reasoningCriteria: 7 }]) {
      expect(normalizeRouterSettings({ prompt: bad }).prompt).toEqual(DEFAULT_ROUTER_PROMPT);
    }
  });

  it("merges prompt patches per field and per criterion, and null resets", () => {
    let s = applyPatch(DEFAULT_SETTINGS, { router: { jevModel: "jev-x", prompt: { tierInstructions: "T", tierCriteria: { heavy: "H" } } } });
    s = applyPatch(s, { router: { prompt: { reasoningInstructions: "R", tierCriteria: { fast: "F" }, reasoningCriteria: { high: "HI" } } } });
    expect(s.router.jevModel).toBe("jev-x");
    expect(s.router.prompt).toEqual({
      tierInstructions: "T",
      tierCriteria: { fast: "F", balanced: null, heavy: "H" },
      reasoningInstructions: "R",
      reasoningCriteria: { off: null, low: null, high: "HI" },
    });
    s = applyPatch(s, { router: { jevModel: null, prompt: { tierCriteria: { heavy: null } } } });
    expect(s.router.jevModel).toBeNull();
    expect(s.router.prompt.tierCriteria).toEqual({ fast: "F", balanced: null, heavy: null });
    expect(s.router.prompt.tierInstructions).toBe("T");
    expect(applyPatch(s, { router: { useJev: false } }).router.prompt).toEqual(s.router.prompt);
    expect(DEFAULT_SETTINGS.router.prompt).toEqual(DEFAULT_ROUTER_PROMPT);
  });

  it("patches tier pins per tier and replaces the exclusion list", () => {
    let s = applyPatch(DEFAULT_SETTINGS, { router: { tierModels: { fast: "google/gemini-2.5-flash" }, excluded: ["x/y"] } });
    s = applyPatch(s, { router: { tierModels: { heavy: "anthropic/claude-opus-4-5" }, excluded: [] } });
    expect(s.router.tierModels).toEqual({ fast: "google/gemini-2.5-flash", balanced: null, heavy: "anthropic/claude-opus-4-5" });
    expect(s.router.excluded).toEqual([]);
    expect(applyPatch(s, { router: { tierModels: { fast: null } } }).router.tierModels.fast).toBeNull();
  });
});

describe("pickRoutedModel", () => {
  it("matches selectModelForTier without prefs", () => {
    for (const t of ["fast", "balanced", "heavy"] as const) expect(pickRoutedModel(t, all)).toEqual(selectModelForTier(t, all));
  });

  it("honours a pin that is still a candidate", () => {
    expect(pickRoutedModel("fast", all, undefined, { tierModels: { fast: "anthropic/claude-haiku-4-5", balanced: null, heavy: null } })).toBe(haiku);
  });

  it("ignores a stale or excluded pin", () => {
    const tierModels = { fast: "x/gone", balanced: null, heavy: null };
    expect(pickRoutedModel("fast", all, undefined, { tierModels })).toBe(flash);
    expect(pickRoutedModel("fast", all, undefined, { tierModels: { ...tierModels, fast: "google/gemini-2.5-flash" }, excluded: ["google/gemini-2.5-flash"] })).toBe(haiku);
  });

  it("drops excluded models, but never empties the pool", () => {
    expect(pickRoutedModel("heavy", all, undefined, { excluded: ["anthropic/claude-opus-4-5"] })).toBe(sonnet);
    expect(pickRoutedModel("heavy", [opus], undefined, { excluded: ["anthropic/claude-opus-4-5"] })).toBe(opus);
  });

  it("routeTaskLocally applies prefs", () => {
    const r = routeTaskLocally("git status", all, undefined, { excluded: ["google/gemini-2.5-flash"] });
    expect(r.tier).toBe("fast");
    expect(r.model.id).toBe(haiku.id);
  });

  it("minConfidence controls fast promotion", () => {
    const answers = { tier: { choice: "fast", confidence: 0.6 }, reasoning: { choice: "off" } };
    expect(resolveRouterDecision(answers).tier).toBe("balanced");
    expect(resolveRouterDecision(answers, 0.5).tier).toBe("fast");
  });
});

describe("enabledCandidates", () => {
  it("limits the catalog to enabled models and drops Auto (Jev)", () => {
    const catalog = [
      { id: "auto", provider: "jev", name: "Auto (Jev)" },
      { ...flash, extra: 1 },
      sonnet,
      sonnet,
      opus,
    ];
    expect(enabledCandidates(catalog, []).map((m) => m.id)).toEqual([flash.id, sonnet.id, opus.id]);
    expect(enabledCandidates(catalog, ["anthropic/claude-sonnet-4-5", opus.id]).map((m) => m.id)).toEqual([sonnet.id, opus.id]);
  });
});

describe("extension router mirror", () => {
  const envWith = (config: unknown) => {
    const dir = mkdtempSync(join(tmpdir(), "jev-router-"));
    const file = join(dir, "config.json");
    writeFileSync(file, JSON.stringify(config));
    return { HIVE_JEV_CONFIG: file, HIVE_JEV_USAGE: join(dir, "usage.jsonl") };
  };

  const named = [...all, { id: "o3-mini", provider: "openai" }, { id: "gpt-5-pro", provider: "openai" }, { id: "kimi-k2-thinking", provider: "moonshot" }];

  it("classifies and selects exactly like src/router.ts", () => {
    for (const m of named) expect(classifyRouteTier(m)).toBe(classifyModelTier(m));
    for (const t of ["fast", "balanced", "heavy"] as const) {
      expect(selectRouteModel(t, named)).toEqual(selectModelForTier(t, named));
      expect(selectRouteModel(t, named, "anthropic")).toEqual(selectModelForTier(t, named, "anthropic"));
      const prefs = { tierModels: { fast: "anthropic/claude-sonnet-4-5", balanced: null, heavy: null }, excluded: ["anthropic/claude-opus-4-5"] };
      expect(pickRouteModel(t, named, undefined, prefs)).toEqual(pickRoutedModel(t, named, undefined, prefs));
    }
  });

  it("asks Jev the same tier question", () => {
    expect(EXT_ROUTER_QUESTIONS.tier).toEqual(ROUTER_QUESTIONS.tier);
  });

  const overrides = [
    {},
    { tierInstructions: "Be strict.", tierCriteria: { heavy: "Only security." } },
    { tierInstructions: "   ", tierCriteria: { fast: "", balanced: null } },
    { tierCriteria: { fast: "F", balanced: "B", heavy: "H" }, reasoningInstructions: "ignored by subagents" },
  ];

  it("builds the same tier question as src/router.ts for any overrides", () => {
    expect(extBuildRouterQuestions().tier).toEqual(ROUTER_QUESTIONS.tier);
    for (const o of overrides) {
      const prompt = normalizeRouterSettings({ prompt: o }).prompt;
      expect(extBuildRouterQuestions(prompt).tier).toEqual(buildRouterQuestions(prompt).tier);
    }
  });

  it("loadRouterPrefs and normalizeRouterSettings agree on jevModel and prompt", () => {
    const configs: unknown[] = [
      {},
      { jevModel: " jev-x " },
      { jevModel: "x".repeat(101), prompt: null },
      { jevModel: 3, prompt: "nope" },
      {
        jevModel: "m",
        prompt: {
          tierInstructions: ` ${"i".repeat(2_500)} `,
          tierCriteria: { fast: "  f ", balanced: " ", heavy: "h".repeat(1_200), junk: 1 },
          reasoningInstructions: "r",
          reasoningCriteria: { off: 1, low: "l", high: "x".repeat(1_200) },
        },
      },
      { prompt: { tierCriteria: "x", reasoningCriteria: [] } },
    ];
    for (const router of configs) {
      const ext = loadRouterPrefs(envWith({ router }));
      const core = normalizeRouterSettings(router);
      expect(ext.jevModel).toBe(core.jevModel);
      expect(ext.prompt).toEqual(core.prompt);
    }
    expect(loadRouterPrefs({})).toMatchObject({ jevModel: null, prompt: DEFAULT_ROUTER_PROMPT });
  });

  it("loads router prefs without an API key", () => {
    const env = envWith({ router: { useJev: false, tierModels: { heavy: "anthropic/claude-opus-4-5" }, excluded: ["a/b", "bad"] } });
    expect(loadRouterPrefs(env)).toEqual({ useJev: false, tierModels: { fast: null, balanced: null, heavy: "anthropic/claude-opus-4-5" }, excluded: ["a/b"], minConfidence: 0.7, jevModel: null, prompt: DEFAULT_ROUTER_PROMPT });
    expect(loadRouterPrefs({})).toEqual({ useJev: true, tierModels: { fast: null, balanced: null, heavy: null }, excluded: [], minConfidence: 0.7, jevModel: null, prompt: DEFAULT_ROUTER_PROMPT });
  });

  it("routeTaskWithJev uses a pinned model even when it is not a candidate, offline", async () => {
    const env = envWith({ router: { tierModels: { heavy: "openai/o3" } } });
    const r = await routeTaskWithJev("find the root cause of this race condition", [sonnet], { env });
    expect(r).toMatchObject({ provider: "openai", id: "o3", tier: "heavy" });
  });

  it("routeTaskWithJev calls Jev when configured and honours minConfidence", async () => {
    const env = envWith({ apiKey: "k", consentAt: 1, maxCallsPerDay: 0, router: { minConfidence: 0.9 } });
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ answers: { tier: { type: "choice", choice: "fast", confidence: 0.8, probabilities: {} } }, usage: {} }), { status: 200 }),
    ) as unknown as typeof fetch;
    const r = await routeTaskWithJev("rename foo to bar", [flash, sonnet], { env, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(r).toMatchObject({ id: sonnet.id, tier: "balanced" });
  });

  it("routeTaskWithJev sends the router's Jev model and overridden questions", async () => {
    const env = envWith({
      apiKey: "k",
      consentAt: 1,
      maxCallsPerDay: 0,
      model: "global-model",
      router: { jevModel: "router-model", prompt: { tierInstructions: "Custom instructions", tierCriteria: { heavy: "Custom heavy" } } },
    });
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ answers: { tier: { type: "choice", choice: "heavy", confidence: 0.9, probabilities: {} } }, usage: {} }), { status: 200 }),
    ) as unknown as typeof fetch;
    await routeTaskWithJev("rename foo to bar", [flash, sonnet, opus], { env, fetchImpl });
    const body = JSON.parse((vi.mocked(fetchImpl).mock.calls[0]![1] as RequestInit).body as string);
    expect(body.model).toBe("router-model");
    expect(body.questions.tier.instructions).toBe("Custom instructions");
    expect(body.questions.tier.criteria).toEqual({ ...ROUTER_QUESTIONS.tier.criteria, heavy: "Custom heavy" });
  });

  it("routeTaskWithJev falls back to the global model and default questions", async () => {
    const env = envWith({ apiKey: "k", consentAt: 1, maxCallsPerDay: 0, model: "global-model", router: {} });
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ answers: {}, usage: {} }), { status: 200 })) as unknown as typeof fetch;
    await routeTaskWithJev("rename foo to bar", [flash, sonnet], { env, fetchImpl });
    const body = JSON.parse((vi.mocked(fetchImpl).mock.calls[0]![1] as RequestInit).body as string);
    expect(body.model).toBe("global-model");
    expect(body.questions.tier).toEqual(ROUTER_QUESTIONS.tier);
  });

  it("routeTaskWithJev skips the API when useJev is off", async () => {
    const env = envWith({ apiKey: "k", consentAt: 1, router: { useJev: false } });
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const r = await routeTaskWithJev("git status", [flash, sonnet], { env, fetchImpl });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(r).toMatchObject({ id: flash.id, tier: "fast" });
  });
});
