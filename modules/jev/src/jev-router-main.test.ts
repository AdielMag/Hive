import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import mod from "./main.ts";
import { buildRouterQuestions, ROUTER_QUESTIONS } from "./router.ts";
import { JevMethods, type CandidateModel, type RouteTaskResult } from "./shared.ts";

const flash: CandidateModel = { id: "gemini-2.5-flash", provider: "google", cost: { input: 0.15 } };
const opus: CandidateModel = { id: "claude-opus-4-5", provider: "anthropic", reasoning: true, cost: { input: 15 } };

/** Activates the real main module against a temp data dir and returns its IPC handlers. */
function activate(config: unknown) {
  const dir = mkdtempSync(join(tmpdir(), "jev-main-"));
  writeFileSync(join(dir, "config.json"), JSON.stringify(config));
  const handlers = new Map<string, (...args: any[]) => any>();
  const ctx = {
    paths: { moduleData: () => dir, piAgentDir: dir },
    log: { warn() {}, info() {}, error() {} },
    onDispose() {},
    ipc: { handle: (name: string, fn: (...args: any[]) => any) => void handlers.set(name, fn) },
  };
  (mod as any).activate(ctx);
  const route = (task: string) => handlers.get(JevMethods.routeTask)!({ task, candidateModels: [flash, opus] }) as Promise<RouteTaskResult>;
  return { route, usage: () => readFileSync(join(dir, "usage.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l)) };
}

const okJson = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const heavyAnswer = { answers: { tier: { type: "choice", choice: "heavy", confidence: 0.9 }, reasoning: { type: "choice", choice: "high", confidence: 0.9 } }, usage: {} };
const base = { apiKey: "k", consentAt: 1, maxCallsPerDay: 0, model: "global-model" };

afterEach(() => vi.unstubAllGlobals());

describe("routeTask (main)", () => {
  it("sends the router's Jev model and the overridden questions, and logs that model", async () => {
    const fetchMock = vi.fn(async () => okJson(heavyAnswer));
    vi.stubGlobal("fetch", fetchMock);
    const { route, usage } = activate({
      ...base,
      router: { jevModel: "router-model", prompt: { tierInstructions: "Custom", reasoningCriteria: { off: "Custom off" } } },
    });
    const r = await route("redesign auth");
    expect(r).toMatchObject({ ok: true, tier: "heavy", model: { id: opus.id } });
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.model).toBe("router-model");
    expect(body.questions).toEqual(buildRouterQuestions({ tierInstructions: "Custom", reasoningCriteria: { off: "Custom off" } }));
    expect(body.questions.tier.instructions).toBe("Custom");
    expect(body.questions.reasoning.criteria.off).toBe("Custom off");
    expect(body.questions.reasoning.criteria.low).toBe(ROUTER_QUESTIONS.reasoning.criteria.low);
    expect(usage()[0]).toMatchObject({ feature: "router", model: "router-model", ok: true });
  });

  it("falls back to the global model and default questions", async () => {
    const fetchMock = vi.fn(async () => okJson(heavyAnswer));
    vi.stubGlobal("fetch", fetchMock);
    const { route, usage } = activate({ ...base, router: {} });
    await route("redesign auth");
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.model).toBe("global-model");
    expect(body.questions).toEqual(ROUTER_QUESTIONS);
    expect(usage()[0]).toMatchObject({ model: "global-model" });
  });

  it("logs the router model on a failed call", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    const { route, usage } = activate({ ...base, router: { jevModel: "router-model" } });
    expect((await route("redesign auth")).ok).toBe(true);
    expect(usage()[0]).toMatchObject({ feature: "router", model: "router-model", ok: false, error: "HTTP 500" });
  });
});
