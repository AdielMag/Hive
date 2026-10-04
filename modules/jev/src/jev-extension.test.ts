import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildRecentMessages,
  callJev,
  COMPACTION_QUESTIONS,
  extractSignals,
  formatAnswers,
  loadSettings,
  parseReadOnlyCommand,
  resetBreaker,
  resetCallCounter,
  toApiQuestions,
  turnEndedForUser,
  type Settings,
} from "../agent/extensions/jev.ts";

const settings: Settings = {
  apiKey: "k_test",
  model: "jev-latest",
  compact: { enabled: true, floorPct: 40 },
  askJev: { enabled: true },
  maxCallsPerDay: 500,
};

const okBody = (answers: unknown) => ({ model: "jev-latest", answers, usage: { input_tokens: 120, output_tokens: 12 } });
const jsonRes = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function tmpEnv() {
  const dir = mkdtempSync(join(tmpdir(), "jev-"));
  const usage = join(dir, "usage.jsonl");
  return { dir, usage, env: { HIVE_JEV_USAGE: usage, HIVE_JEV_CONFIG: join(dir, "config.json") } };
}

beforeEach(() => {
  resetBreaker();
  resetCallCounter();
});

describe("loadSettings", () => {
  it("is null without env, file or key", () => {
    const { dir, env } = tmpEnv();
    expect(loadSettings({})).toBeNull();
    expect(loadSettings(env)).toBeNull();
    writeFileSync(join(dir, "config.json"), JSON.stringify({ apiKey: "  " }));
    expect(loadSettings(env)).toBeNull();
  });

  it("reads key and applies defaults", () => {
    const { dir, env } = tmpEnv();
    writeFileSync(join(dir, "config.json"), JSON.stringify({ apiKey: " abc ", compact: { floorPct: 55 } }));
    expect(loadSettings(env)).toEqual({
      apiKey: "abc",
      model: "jev-latest",
      compact: { enabled: true, floorPct: 55 },
      askJev: { enabled: true },
      maxCallsPerDay: 500,
    });
  });
});

describe("callJev", () => {
  it("posts to /v1/systemone with bearer auth and parses answers + usage", async () => {
    const { env, usage } = tmpEnv();
    const fetchImpl = vi.fn(async () => jsonRes(200, okBody({ a: { type: "noul", noul: 0.9 } })));
    const r = await callJev({ settings, feature: "t", state: "x", questions: { a: { type: "noul", instructions: "q" } }, fetchImpl: fetchImpl as any, env });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.inputTokens).toBe(120);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.typesafe.ai/v1/systemone");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer k_test");
    expect(JSON.parse(init.body as string)).toMatchObject({ model: "jev-latest", state: "x" });
    const logged = JSON.parse(readFileSync(usage, "utf8").trim());
    expect(logged).toMatchObject({ feature: "t", inputTokens: 120, ok: true });
  });

  it("returns an error (never throws) on HTTP failure, network failure and malformed bodies", async () => {
    const { env } = tmpEnv();
    const base = { settings, feature: "t", state: "x", questions: {}, env };
    const a = await callJev({ ...base, fetchImpl: (async () => jsonRes(500, { detail: "boom" })) as any });
    expect(a).toMatchObject({ ok: false, status: 500 });
    resetBreaker();
    const b = await callJev({ ...base, fetchImpl: (async () => { throw new Error("offline"); }) as any });
    expect(b).toMatchObject({ ok: false, error: "offline" });
    resetBreaker();
    const c = await callJev({ ...base, fetchImpl: (async () => jsonRes(200, { nope: 1 })) as any });
    expect(c).toMatchObject({ ok: false, error: "Malformed response from Jev" });
  });

  it("opens the breaker after 3 failures and after a rejected key", async () => {
    const { env } = tmpEnv();
    const fail = vi.fn(async () => jsonRes(500, {}));
    const base = { settings, feature: "t", state: "x", questions: {}, env, fetchImpl: fail as any };
    for (let i = 0; i < 3; i++) await callJev(base);
    const paused = await callJev(base);
    expect(paused).toMatchObject({ ok: false, error: "Jev paused after repeated failures" });
    expect(fail).toHaveBeenCalledTimes(3);

    resetBreaker();
    const denied = vi.fn(async () => jsonRes(401, { detail: { message: "bad key" } }));
    await callJev({ ...base, fetchImpl: denied as any });
    await callJev({ ...base, fetchImpl: denied as any });
    expect(denied).toHaveBeenCalledTimes(1);
  });

  it("enforces the daily call cap using the shared usage log", async () => {
    const { env, usage } = tmpEnv();
    const line = (ts: number) => `${JSON.stringify({ ts, feature: "x", model: "m", inputTokens: 1, outputTokens: 0, ms: 1, ok: true })}\n`;
    writeFileSync(usage, line(Date.now()) + line(Date.now()) + line(Date.now() - 3 * 24 * 3600_000));
    const fetchImpl = vi.fn(async () => jsonRes(200, okBody({})));
    const r = await callJev({ settings: { ...settings, maxCallsPerDay: 2 }, feature: "t", state: "x", questions: {}, env, fetchImpl: fetchImpl as any });
    expect(r).toMatchObject({ ok: false, error: "Daily Jev call limit reached (2)" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("compaction helpers", () => {
  it("asks the four questions with valid types", () => {
    expect(Object.keys(COMPACTION_QUESTIONS)).toEqual(["switched_gears", "at_boundary", "mid_operation", "needs_history"]);
    expect(COMPACTION_QUESTIONS.needs_history).toMatchObject({ type: "score" });
  });

  it("extracts signals and rejects incomplete responses", () => {
    const answers = {
      switched_gears: { type: "noul", noul: 0.1 },
      at_boundary: { type: "noul", noul: 0.9 },
      mid_operation: { type: "noul", noul: 0.2 },
      needs_history: { type: "score", score: 0.4, confidence: 0.8, legend: {}, probabilities: {} },
    } as const;
    expect(extractSignals(answers as any)).toEqual({ switchedGears: 0.1, atBoundary: 0.9, midOperation: 0.2, needsHistory: 0.4 });
    const { at_boundary: _omit, ...partial } = answers;
    expect(extractSignals(partial as any)).toBeNull();
  });

  it("only evaluates turns that hand control back to the user", () => {
    const assistant = (extra: object) => ({ message: { role: "assistant", ...extra }, toolResults: [] });
    expect(turnEndedForUser(assistant({ stopReason: "stop" }))).toBe(true);
    expect(turnEndedForUser(assistant({ stopReason: "toolUse" }))).toBe(false);
    expect(turnEndedForUser(assistant({ stopReason: "error" }))).toBe(false);
    expect(turnEndedForUser({ message: { role: "assistant", stopReason: "stop" }, toolResults: [{}] })).toBe(false);
    expect(turnEndedForUser({ message: { role: "user" }, toolResults: [] })).toBe(false);
  });

  it("builds recent messages since the last compaction, clipped", () => {
    const msg = (role: string, content: unknown, extra: object = {}) => ({ type: "message", message: { role, content, ...extra } });
    const entries = [
      msg("user", "old stuff"),
      { type: "compaction" },
      msg("user", "fix the bug"),
      msg("assistant", [{ type: "text", text: "on it" }, { type: "toolCall", name: "edit" }]),
      msg("toolResult", [{ type: "text", text: "HUGE OUTPUT" }], { toolName: "edit" }),
      msg("user", "x".repeat(2000)),
    ];
    const lines = buildRecentMessages(entries);
    expect(lines.map((l) => l.role)).toEqual(["user", "assistant", "toolResult", "user"]);
    expect(lines[1]!.text).toBe("on it\n[called edit]");
    expect(lines[2]!.text).toBe("[result of edit]");
    expect(lines[3]!.text.length).toBeLessThan(710);
    expect(JSON.stringify(lines)).not.toContain("old stuff");
  });
});

describe("ask_jev helpers", () => {
  it("allows only plain read-only commands", () => {
    expect(parseReadOnlyCommand("git diff --stat")).toEqual({ bin: "git", args: ["diff", "--stat"] });
    expect(parseReadOnlyCommand('git log --grep "fix bug" -n 5')?.args).toContain("fix bug");
    expect(parseReadOnlyCommand("ls -la src")).not.toBeNull();
    for (const bad of [
      "rm -rf /",
      "git push",
      "git commit -m x",
      "git branch -D main",
      "git tag v1",
      "git remote add x y",
      "git -c core.pager=evil log",
      "cat a | sh",
      "ls > out.txt",
      "ls; rm x",
      "echo $(whoami)",
      "find . -delete",
      "find . -exec rm {} +",
      "rg --pre cmd x",
      "node -e 1",
      "",
    ]) {
      expect(parseReadOnlyCommand(bad), bad).toBeNull();
    }
  });

  it("validates and converts questions", () => {
    const q = toApiQuestions({
      risky: { type: "noul", instructions: "Is it risky?", true_means: "touches auth" },
      kind: { type: "choice", instructions: "Which?", options: { bug: "a defect", feat: "new" } },
      sev: { type: "score", instructions: "How bad?", levels: ["low", "high"] },
    });
    expect(q.risky).toEqual({ type: "noul", instructions: "Is it risky?", criteria: { true: "touches auth", false: undefined } });
    expect(q.kind).toMatchObject({ type: "choice", criteria: { bug: "a defect", feat: "new" } });
    expect(q.sev).toMatchObject({ type: "score", criteria: ["low", "high"] });

    expect(() => toApiQuestions({})).toThrow(/empty/);
    expect(() => toApiQuestions({ a: { type: "choice", instructions: "q", options: { only: "one" } } })).toThrow(/2-255/);
    expect(() => toApiQuestions({ a: { type: "score", instructions: "q", levels: ["x"] } })).toThrow(/2-10/);
    expect(() => toApiQuestions({ a: { type: "noul", instructions: " " } })).toThrow(/instructions/);
    expect(() => toApiQuestions({ a: { type: "wat" as any, instructions: "q" } })).toThrow(/unknown type/);
  });

  it("formats each answer type", () => {
    const text = formatAnswers({
      a: { type: "noul", noul: 0.98 },
      b: { type: "choice", choice: "bug", confidence: 0.9, probabilities: { bug: 0.9, feat: 0.1 } },
      c: { type: "score", score: 1.7, confidence: 0.8, legend: { "0": "low", "1": "mid", "2": "high" }, probabilities: {} },
    });
    expect(text).toContain("a: p(yes)=0.980 (leans yes)");
    expect(text).toContain("b: bug (confidence 90%; bug=90%, feat=10%)");
    expect(text).toContain('c: score 1.70 (~"high"), confidence 80%');
  });
});
