import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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

  const usageLines = () => readFileSync(join(dir, "usage.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const runIn = (tool: any, params: object, cwd: string, id = "call_1") =>
    tool.execute(id, params, undefined, undefined, { cwd, sessionManager: { getSessionId: () => "sess-1" } });

  it("returns rich details (sources with previews, confidence, saved tokens) and logs sizes only", async () => {
    const answers = {
      greeting: { type: "noul", noul: 0.2 },
      lang: { type: "choice", choice: "en", confidence: 0.9, probabilities: { en: 0.9, fr: 0.1 } },
      tone: { type: "score", score: 1.2, confidence: 0.7, legend: {}, probabilities: {} },
    };
    vi.stubGlobal("fetch", vi.fn(async () => jsonRes(200, okBody(answers))));
    const h = fakePi();
    extension(h.pi);
    const cwd = workspace();
    writeFileSync(join(cwd, "big.txt"), "y".repeat(10_000));
    const params = {
      questions: {
        greeting: { type: "noul", instructions: "Greeting?" },
        lang: { type: "choice", instructions: "Language?", options: { en: "English", fr: "French" } },
        tone: { type: "score", instructions: "Tone?", levels: ["cold", "neutral", "warm"] },
      },
      state: "abc",
      files: ["a.txt", "big.txt"],
    };
    const r = await runIn(h.getTool(), params, cwd);
    expect(r.isError).toBeUndefined();
    expect(r.details).toMatchObject({
      answers,
      inputTokens: 50,
      outputTokens: 5,
      model: "jev-latest",
      questions: { greeting: "noul", lang: "choice", tone: "score" },
      savedTokensEst: Math.round((11 + 10_000) / 4),
      confidence: { greeting: 0.8, lang: 0.9, tone: 0.7 },
    });
    const files = r.details.sources.files;
    expect(r.details.sources.stateChars).toBe(3);
    expect(files[0]).toEqual({ path: "a.txt", bytes: 11, preview: "hello world", truncated: false });
    expect(files[1]).toMatchObject({ path: "big.txt", bytes: 10_000, truncated: true });
    expect(files[1].preview.length).toBe(4096);

    const [logged] = usageLines();
    expect(logged).toMatchObject({
      feature: "ask_jev",
      ok: true,
      sessionId: "sess-1",
      toolCallId: "call_1",
      cwd,
      questions: { noul: 1, choice: 1, score: 1 },
      sources: { stateChars: 3, files: [{ path: "a.txt", bytes: 11 }, { path: "big.txt", bytes: 10_000 }] },
      savedTokensEst: 2503,
      confidence: [0.8, 0.9, 0.7],
    });
    expect(JSON.stringify(logged)).not.toContain("hello world");
    expect(JSON.stringify(logged)).not.toContain("preview");
  });

  it("records command output size and preview", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonRes(200, okBody({ greeting: { type: "noul", noul: 0.9 } }))));
    const h = fakePi();
    extension(h.pi);
    const cwd = workspace();
    const r = await runIn(h.getTool(), { questions, command: "ls" }, cwd);
    expect(r.isError).toBeUndefined();
    const cmd = r.details.sources.command;
    expect(cmd.command).toBe("ls");
    expect(cmd.preview).toContain("a.txt");
    expect(cmd.bytes).toBe(Buffer.byteLength(cmd.preview));
    expect(usageLines()[0].sources).toEqual({ stateChars: 0, files: [], commandBytes: cmd.bytes });
  });

  it("classifies failures with errorKind and logs local refusals", async () => {
    const h = fakePi();
    extension(h.pi);
    const tool = h.getTool();
    const cwd = workspace();

    vi.stubGlobal("fetch", vi.fn(async () => jsonRes(500, { detail: "boom" })));
    const api = await runIn(tool, { questions, state: "x" }, cwd, "c_api");
    expect(api.details).toMatchObject({ errorKind: "api", questions: { greeting: "noul" }, sources: { stateChars: 1, files: [] } });
    resetBreaker();

    vi.stubGlobal("fetch", vi.fn(async () => jsonRes(401, { detail: "bad key" })));
    expect((await runIn(tool, { questions, state: "x" }, cwd, "c_auth")).details.errorKind).toBe("auth");
    resetBreaker();

    const gather = await runIn(tool, { questions, files: ["../outside.txt"] }, cwd, "c_gather");
    expect(gather.details.errorKind).toBe("gather");
    expect((await runIn(tool, { questions: {}, state: "x" }, cwd, "c_invalid")).details.errorKind).toBe("invalid");
    expect((await runIn(tool, { questions }, cwd, "c_empty")).details.errorKind).toBe("invalid");

    writeConfig({ apiKey: "k", consentAt: 1, maxCallsPerDay: 2 });
    expect((await runIn(tool, { questions, state: "x" }, cwd, "c_cap")).details.errorKind).toBe("cap");

    writeConfig({ apiKey: "k", consentAt: 1, askJev: { enabled: false } });
    expect((await runIn(tool, { questions, state: "x" }, cwd, "c_off")).details.errorKind).toBe("disabled");

    const kinds = Object.fromEntries(usageLines().map((l) => [l.toolCallId, l.errorKind]));
    expect(kinds).toEqual({ c_api: "api", c_auth: "auth", c_gather: "gather", c_invalid: "invalid", c_empty: "invalid", c_cap: "cap" });
    expect(usageLines().every((l) => l.ok === false && l.sessionId === "sess-1")).toBe(true);
  });

  it("local refusals don't count toward the daily cap", async () => {
    const fetchMock = vi.fn(async () => jsonRes(200, okBody({ greeting: { type: "noul", noul: 0.9 } })));
    vi.stubGlobal("fetch", fetchMock);
    writeConfig({ apiKey: "k", consentAt: 1, maxCallsPerDay: 1 });
    const h = fakePi();
    extension(h.pi);
    const cwd = workspace();
    await runIn(h.getTool(), { questions, files: ["../outside.txt"] }, cwd);
    resetCallCounter(); // re-seed from the log
    const r = await runIn(h.getTool(), { questions, state: "x" }, cwd);
    expect(r.isError).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("ask_jev batch (items)", () => {
  function workspace(n = 3) {
    const cwd = mkdtempSync(join(tmpdir(), "jev-batch-"));
    for (let i = 1; i <= n; i++) writeFileSync(join(cwd, `f${i}.txt`), `content ${i}`);
    return cwd;
  }
  const questions = { risky: { type: "noul", instructions: "Is it risky?" } };
  const verdict = (p: number) => jsonRes(200, okBody({ risky: { type: "noul", noul: p } }));
  const runIn = (tool: any, params: object, cwd: string, id = "call_b") =>
    tool.execute(id, params, undefined, undefined, { cwd, sessionManager: { getSessionId: () => "sess-b" } });
  const usageLines = () => readFileSync(join(dir, "usage.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const tool = () => {
    const h = fakePi();
    extension(h.pi);
    return h.getTool();
  };

  it("registers the items parameter and the Jev guidance", () => {
    const t = tool();
    expect(t.parameters.properties.items.maxItems).toBe(40);
    expect(t.description).toMatch(/RAW/);
    expect(t.description).toMatch(/items/);
    expect(t.description).toMatch(/git diff -- src\/a\.ts/);
    expect(t.promptGuidelines.length).toBeGreaterThanOrEqual(4);
    expect(t.promptGuidelines.join(" ")).toMatch(/never your own summary/);
  });

  it("runs every item with its own usage record and a block per item", async () => {
    const fetchMock = vi.fn(async () => verdict(0.9));
    vi.stubGlobal("fetch", fetchMock);
    const cwd = workspace();
    const r = await runIn(tool(), { questions, items: [{ id: "one", files: ["f1.txt"] }, { files: ["f2.txt"] }, { id: "three", command: "ls" }] }, cwd);
    expect(r.isError).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const text = r.content[0].text as string;
    expect(text).toContain("[one] risky: p(yes)=0.900");
    expect(text).toContain("[2] risky: p(yes)=0.900");
    expect(text).toContain("[three] risky");
    expect(text).not.toContain("content 1");
    expect(r.details.answers).toBeUndefined();
    expect(r.details.sources).toBeUndefined();
    expect(r.details.batch.map((b: any) => b.id)).toEqual(["one", "2", "three"]);
    expect(r.details.batch[0]).toMatchObject({ answers: { risky: { type: "noul", noul: 0.9 } }, inputTokens: 50, outputTokens: 5, confidence: { risky: 0.9 }, savedTokensEst: 2 });
    expect(r.details.batch[0].sources.files[0]).toMatchObject({ path: "f1.txt", bytes: 9, preview: "content 1" });
    expect(r.details).toMatchObject({ inputTokens: 150, outputTokens: 15, model: "jev-latest", questions: { risky: "noul" } });
    const lines = usageLines();
    expect(lines).toHaveLength(3);
    expect(lines.every((l) => l.ok && l.toolCallId === "call_b" && l.sessionId === "sess-b" && l.feature === "ask_jev")).toBe(true);
  });

  it("keeps going when one item fails and marks it", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => verdict(0.2)));
    const cwd = workspace();
    const r = await runIn(tool(), { questions, items: [{ id: "ok", files: ["f1.txt"] }, { id: "bad", files: ["nope.txt"] }, { id: "empty" }, { id: "ok2", state: "x" }] }, cwd);
    expect(r.isError).toBeUndefined();
    const text = r.content[0].text as string;
    expect(text).toContain("[ok] risky");
    expect(text).toMatch(/\[bad\] FAILED \(gather\)/);
    expect(text).toMatch(/\[empty\] FAILED \(invalid\): Give at least one of/);
    expect(text).toContain("[ok2] risky");
    expect(text).toContain("2 failed");
    const [ok, bad, empty, ok2] = r.details.batch;
    expect(ok.error).toBeUndefined();
    expect(bad).toMatchObject({ id: "bad", errorKind: "gather", inputTokens: 0 });
    expect(empty.errorKind).toBe("invalid");
    expect(ok2.answers).toBeDefined();
    const kinds = usageLines().map((l) => l.errorKind ?? "ok").sort();
    expect(kinds).toEqual(["gather", "invalid", "ok", "ok"]);
  });

  it("flags the whole result as an error only when every item failed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonRes(500, { detail: "boom" })));
    const cwd = workspace();
    const r = await runIn(tool(), { questions, items: [{ state: "a" }, { state: "b" }] }, cwd);
    expect(r.isError).toBe(true);
    expect(r.details.batch).toHaveLength(2);
    expect(r.details.batch[0]).toMatchObject({ errorKind: "api" });
  });

  it("runs at most 4 items at once", async () => {
    let live = 0;
    let peak = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      live += 1;
      peak = Math.max(peak, live);
      await new Promise((res) => setTimeout(res, 15));
      live -= 1;
      return verdict(0.5);
    }));
    const cwd = workspace();
    const r = await runIn(tool(), { questions, items: Array.from({ length: 10 }, (_, i) => ({ id: `i${i}`, state: "x" })) }, cwd);
    expect(r.details.batch).toHaveLength(10);
    expect(peak).toBe(4);
  });

  it("rejects more than 40 items, empty items, and items mixed with top-level content without calling Jev", async () => {
    const fetchMock = vi.fn(async () => verdict(0.5));
    vi.stubGlobal("fetch", fetchMock);
    const cwd = workspace();
    const t = tool();
    const many = await runIn(t, { questions, items: Array.from({ length: 41 }, () => ({ state: "x" })) }, cwd, "c_many");
    expect(many.isError).toBe(true);
    expect(many.content[0].text).toMatch(/Too many items: 41 \(max 40/);
    const none = await runIn(t, { questions, items: [] }, cwd, "c_none");
    expect(none.isError).toBe(true);
    const both = await runIn(t, { questions, items: [{ state: "x" }], files: ["f1.txt"] }, cwd, "c_both");
    expect(both.isError).toBe(true);
    expect(both.content[0].text).toMatch(/either items or top-level/);
    expect(both.details.errorKind).toBe("invalid");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(usageLines().map((l) => l.errorKind)).toEqual(["invalid", "invalid", "invalid"]);
  });

  it("accepts exactly 40 items", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => verdict(0.5)));
    const r = await runIn(tool(), { questions, items: Array.from({ length: 40 }, () => ({ state: "x" })) }, workspace());
    expect(r.isError).toBeUndefined();
    expect(r.details.batch).toHaveLength(40);
  });

  it("refuses the whole batch up front when the remaining daily cap is smaller than the item count", async () => {
    const fetchMock = vi.fn(async () => verdict(0.5));
    vi.stubGlobal("fetch", fetchMock);
    writeConfig({ apiKey: "k", consentAt: 1, maxCallsPerDay: 5 });
    const cwd = workspace();
    const t = tool();
    expect((await runIn(t, { questions, state: "x" }, cwd, "c_single")).isError).toBeUndefined(); // 1 used, 4 left
    const r = await runIn(t, { questions, items: Array.from({ length: 5 }, () => ({ state: "x" })) }, cwd, "c_batch");
    expect(r.isError).toBe(true);
    expect(r.details.errorKind).toBe("cap");
    expect(r.content[0].text).toMatch(/4 calls left today/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(usageLines().find((l) => l.toolCallId === "c_batch")).toMatchObject({ ok: false, errorKind: "cap" });
    // 4 items still fit and use the cap exactly.
    expect((await runIn(t, { questions, items: Array.from({ length: 4 }, () => ({ state: "x" })) }, cwd, "c_fit")).isError).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("stops starting items once the signal aborts: skipped items are 'aborted', unlogged, uncounted, breaker untouched", async () => {
    const ac = new AbortController();
    const fetchMock = vi.fn(async (_u: unknown, init: any) => {
      // The first wave is in flight when the user aborts; its fetches reject immediately.
      await new Promise((_, reject) => {
        init.signal.addEventListener("abort", () => reject(new Error("The operation was aborted")));
        setTimeout(() => ac.abort(), 5);
      });
      return verdict(0.5);
    });
    vi.stubGlobal("fetch", fetchMock);
    const cwd = workspace();
    const t = tool();
    const items = Array.from({ length: 12 }, (_, i) => ({ id: `i${i}`, state: "x" }));
    const r = await t.execute("c_abort", { questions, items }, ac.signal, undefined, { cwd, sessionManager: { getSessionId: () => "sess-b" } });
    expect(r.isError).toBe(true);
    expect(r.details.batch).toHaveLength(12);
    expect(r.details.batch.every((b: any) => b.errorKind === "aborted")).toBe(true);
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(4); // only the first wave started
    expect(existsSync(join(dir, "usage.jsonl"))).toBe(false); // nothing logged, bogus api/timeout records included
    // Breaker not tripped and the cap is untouched: a fresh batch of 12 runs fully.
    vi.stubGlobal("fetch", vi.fn(async () => verdict(0.5)));
    const again = await runIn(t, { questions, items }, cwd, "c_after");
    expect(again.isError).toBeUndefined();
    expect(again.details.batch.every((b: any) => b.answers)).toBe(true);
    expect(usageLines()).toHaveLength(12);
  });

  it("leaves the single-item result shape unchanged", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => verdict(0.8)));
    const cwd = workspace();
    const r = await runIn(tool(), { questions, files: ["f1.txt"] }, cwd);
    expect(Object.keys(r.details).sort()).toEqual(["answers", "confidence", "inputTokens", "model", "ms", "outputTokens", "questions", "savedTokensEst", "sources"]);
    expect(r.details.batch).toBeUndefined();
    expect(r.content[0].text).toBe(`risky: p(yes)=0.800 (leans yes)\n(50 input tokens, ${r.details.ms} ms)`);
  });
});
