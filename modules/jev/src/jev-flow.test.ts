import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import extension, { resetBreaker, resetCallCounter } from "../agent/extensions/jev.ts";

const TO_GUI = "studio:to-gui";
const FROM_GUI = "studio:from-gui";

const jsonRes = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const signals = {
  switched_gears: { type: "noul", noul: 0.1 },
  at_boundary: { type: "noul", noul: 0.9 },
  mid_operation: { type: "noul", noul: 0.05 },
  needs_history: { type: "score", score: 0.4, confidence: 0.8, legend: {}, probabilities: {} },
};
const okBody = (answers: unknown) => ({ model: "jev-latest", answers, usage: { input_tokens: 50, output_tokens: 5 } });

/** Minimal stand-in for Pi's ExtensionAPI, recording handlers, the tool and bridge traffic. */
function fakePi() {
  const handlers: Record<string, (e: any, c: any) => Promise<void> | void> = {};
  const bus = new Map<string, Array<(d: any) => void>>();
  const emitted: any[] = [];
  let tool: any = null;
  const pi = {
    on: (name: string, h: any) => void (handlers[name] = h),
    registerTool: (t: any) => void (tool = t),
    events: {
      on: (topic: string, h: (d: any) => void) => void bus.set(topic, [...(bus.get(topic) ?? []), h]),
      emit: (topic: string, data: any) => {
        if (topic === TO_GUI) emitted.push(data);
        for (const h of bus.get(topic) ?? []) h(data);
      },
    },
  };
  return { pi: pi as any, handlers, emitted, getTool: () => tool, fromGui: (d: unknown) => pi.events.emit(FROM_GUI, d) };
}

const msg = (role: string, text: string) => ({ type: "message", message: { role, content: [{ type: "text", text }] } });
const entries = [msg("user", "add a login page"), msg("assistant", "done, login page added"), msg("user", "thanks"), msg("assistant", "anything else?")];
const turn = (id: string, extra: object = {}) => ({ message: { role: "assistant", stopReason: "stop" }, toolResults: [], messageEntryId: id, ...extra });

function ctxWith(pct: number, cwd = process.cwd(), branch: unknown[] = entries) {
  return { cwd, getContextUsage: () => ({ tokens: pct * 1000, contextWindow: 100_000 }), sessionManager: { getBranch: () => branch }, compact: vi.fn() };
}

let dir: string;
let configPath: string;
const writeConfig = (cfg: object) => writeFileSync(configPath, JSON.stringify(cfg));

beforeEach(() => {
  resetBreaker();
  resetCallCounter();
  dir = mkdtempSync(join(tmpdir(), "jev-flow-"));
  configPath = join(dir, "config.json");
  vi.stubEnv("HIVE_JEV_CONFIG", configPath);
  vi.stubEnv("HIVE_JEV_USAGE", join(dir, "usage.jsonl"));
  writeConfig({ apiKey: "k", consentAt: 1 });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("turn_end compaction advice", () => {
  it("emits jev_advice with the signals and usage after a finished turn", async () => {
    const fetchMock = vi.fn(async () => jsonRes(200, okBody(signals)));
    vi.stubGlobal("fetch", fetchMock);
    const h = fakePi();
    extension(h.pi);
    await h.handlers.turn_end!(turn("e1"), ctxWith(60));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(h.emitted).toHaveLength(1);
    expect(h.emitted[0]).toMatchObject({
      kind: "jev_advice",
      entryId: "e1",
      usagePct: 60,
      tokens: 60_000,
      contextWindow: 100_000,
      signals: { switchedGears: 0.1, atBoundary: 0.9, midOperation: 0.05, needsHistory: 0.4 },
    });
  });

  it("makes no call below the floor, mid tool use, without consent, when disabled or for a repeated entry", async () => {
    const fetchMock = vi.fn(async () => jsonRes(200, okBody(signals)));
    vi.stubGlobal("fetch", fetchMock);
    const h = fakePi();
    extension(h.pi);
    const run = h.handlers.turn_end!;

    await run(turn("a"), ctxWith(10)); // below the 40% floor
    await run(turn("b", { toolResults: [{}] }), ctxWith(80)); // agent still working
    await run(turn("c", { message: { role: "assistant", stopReason: "toolUse" } }), ctxWith(80));
    expect(fetchMock).not.toHaveBeenCalled();

    await run(turn("d"), ctxWith(80, process.cwd(), [msg("user", "hi")])); // too little conversation
    expect(fetchMock).not.toHaveBeenCalled();

    await run(turn("e"), ctxWith(80));
    await run(turn("e"), ctxWith(80)); // same entry again
    expect(fetchMock).toHaveBeenCalledTimes(1);

    writeConfig({ apiKey: "k" }); // no consent
    await run(turn("f"), ctxWith(80));
    writeConfig({ apiKey: "k", consentAt: 1, compact: { enabled: false } });
    await run(turn("g"), ctxWith(80));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("swallows API failures and incomplete answers (no advice, no throw)", async () => {
    const h = fakePi();
    extension(h.pi);
    vi.stubGlobal("fetch", vi.fn(async () => jsonRes(500, {})));
    await expect(h.handlers.turn_end!(turn("x1"), ctxWith(80))).resolves.toBeUndefined();
    vi.stubGlobal("fetch", vi.fn(async () => jsonRes(200, okBody({ at_boundary: signals.at_boundary }))));
    await h.handlers.turn_end!(turn("x2"), ctxWith(80));
    expect(h.emitted).toHaveLength(0);
  });

  it("compacts the newest session when Hive sends jev_compact", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonRes(200, okBody(signals))));
    const h = fakePi();
    extension(h.pi);
    h.fromGui({ kind: "jev_compact" }); // nothing seen yet: ignored
    const ctx = ctxWith(60);
    await h.handlers.turn_end!(turn("c1"), ctx);
    h.fromGui({ kind: "other" });
    expect(ctx.compact).not.toHaveBeenCalled();
    h.fromGui({ kind: "jev_compact" });
    expect(ctx.compact).toHaveBeenCalledTimes(1);
    h.fromGui({ kind: "jev_compact", instructions: "keep the auth details" });
    expect(ctx.compact).toHaveBeenLastCalledWith({ customInstructions: "keep the auth details" });
  });
});

describe("ask_jev tool", () => {
  function workspace() {
    const root = mkdtempSync(join(tmpdir(), "jev-ask-"));
    const cwd = join(root, "repo");
    mkdirSync(cwd, { recursive: true });
    writeFileSync(join(cwd, "a.txt"), "hello world");
    writeFileSync(join(cwd, ".env"), "TOKEN=abc");
    writeFileSync(join(root, "outside.txt"), "private");
    return cwd;
  }
  const questions = { greeting: { type: "noul", instructions: "Is this a greeting?" } };
  const run = (tool: any, params: object, cwd: string) => tool.execute("id", params, undefined, undefined, { cwd });

  it("is only registered when a consented key and the feature are present", () => {
    writeConfig({ apiKey: "k" });
    const a = fakePi();
    extension(a.pi);
    expect(a.getTool()).toBeNull();
    writeConfig({ apiKey: "k", consentAt: 1, askJev: { enabled: false } });
    const b = fakePi();
    extension(b.pi);
    expect(b.getTool()).toBeNull();
    writeConfig({ apiKey: "k", consentAt: 1 });
    const c = fakePi();
    extension(c.pi);
    expect(c.getTool()?.name).toBe("ask_jev");
  });

  it("sends file contents to Jev but returns only the answers to the agent", async () => {
    const fetchMock = vi.fn(async () => jsonRes(200, okBody({ greeting: { type: "noul", noul: 0.97 } })));
    vi.stubGlobal("fetch", fetchMock);
    const h = fakePi();
    extension(h.pi);
    const cwd = workspace();
    const r = await run(h.getTool(), { questions, files: ["a.txt"] }, cwd);
    expect(r.isError).toBeUndefined();
    const text = r.content[0].text as string;
    expect(text).toContain("greeting: p(yes)=0.970");
    expect(text).not.toContain("hello world");
    const sent = JSON.parse((fetchMock.mock.calls[0] as any)[1].body as string);
    expect(sent.state.files["a.txt"]).toBe("hello world");
  });

  it("refuses outside paths, secrets and write commands without calling Jev", async () => {
    const fetchMock = vi.fn(async () => jsonRes(200, okBody({})));
    vi.stubGlobal("fetch", fetchMock);
    const h = fakePi();
    extension(h.pi);
    const cwd = workspace();
    const outside = await run(h.getTool(), { questions, files: ["../outside.txt"] }, cwd);
    expect(outside.isError).toBe(true);
    expect(outside.content[0].text).toMatch(/outside the workspace/);
    const secret = await run(h.getTool(), { questions, files: [".env"] }, cwd);
    expect(secret.isError).toBe(true);
    expect(secret.content[0].text).toMatch(/secret/);
    expect((await run(h.getTool(), { questions, command: "git branch newbranch" }, cwd)).isError).toBe(true);
    expect((await run(h.getTool(), { questions, command: "head ../outside.txt" }, cwd)).isError).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports bad input, missing content, API failure and revoked consent as tool errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonRes(500, { detail: "boom" })));
    const h = fakePi();
    extension(h.pi);
    const tool = h.getTool();
    const cwd = workspace();
    expect((await run(tool, { questions: {}, state: "x" }, cwd)).content[0].text).toMatch(/empty/);
    expect((await run(tool, { questions }, cwd)).content[0].text).toMatch(/at least one of/);
    expect((await run(tool, { questions, state: "x" }, cwd)).content[0].text).toMatch(/Jev call failed: HTTP 500/);
    writeConfig({ apiKey: "k" });
    expect((await run(tool, { questions, state: "x" }, cwd)).content[0].text).toMatch(/disabled or no Jev API key/);
  });
});
