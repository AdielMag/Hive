import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  answerConfidence,
  buildRecentMessages,
  callJev,
  estimateSavedTokens,
  usageSources,
  checkCommandPaths,
  COMPACTION_QUESTIONS,
  confine,
  extractSignals,
  formatAnswers,
  isSecretPath,
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
    writeFileSync(join(dir, "config.json"), JSON.stringify({ apiKey: "  ", consentAt: 1 }));
    expect(loadSettings(env)).toBeNull();
  });

  it("stays inert until the privacy notice was accepted", () => {
    const { dir, env } = tmpEnv();
    writeFileSync(join(dir, "config.json"), JSON.stringify({ apiKey: "abc" }));
    expect(loadSettings(env)).toBeNull();
    writeFileSync(join(dir, "config.json"), JSON.stringify({ apiKey: "abc", consentAt: null }));
    expect(loadSettings(env)).toBeNull();
    writeFileSync(join(dir, "config.json"), JSON.stringify({ apiKey: "abc", consentAt: 1_700_000_000_000 }));
    expect(loadSettings(env)).not.toBeNull();
  });

  it("reads key and applies defaults", () => {
    const { dir, env } = tmpEnv();
    writeFileSync(join(dir, "config.json"), JSON.stringify({ apiKey: " abc ", consentAt: 1, compact: { floorPct: 55 } }));
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

describe("callJev analytics fields", () => {
  it("classifies failures with errorKind", async () => {
    const { env } = tmpEnv();
    const base = { settings, feature: "t", state: "x", questions: {}, env };
    expect(await callJev({ ...base, fetchImpl: (async () => jsonRes(500, {})) as any })).toMatchObject({ errorKind: "api", logged: true });
    resetBreaker();
    expect(await callJev({ ...base, fetchImpl: (async () => jsonRes(402, {})) as any })).toMatchObject({ errorKind: "auth" });
    resetBreaker();
    const hang = (async (_u: string, init: RequestInit) =>
      new Promise((_, reject) => init.signal!.addEventListener("abort", () => reject(new Error("aborted"))))) as any;
    expect(await callJev({ ...base, timeoutMs: 10, fetchImpl: hang })).toMatchObject({ errorKind: "timeout", error: "Jev request timed out" });
    resetBreaker();
    resetCallCounter();
    const capped = await callJev({ ...base, settings: { ...settings, maxCallsPerDay: 1 }, fetchImpl: (async () => jsonRes(200, okBody({}))) as any });
    expect(capped).toMatchObject({ ok: false, errorKind: "cap", logged: false });
  });

  it("treats an aborted signal as a non-failure: not logged, not counted, breaker untouched", async () => {
    const { env, usage } = tmpEnv();
    const limited = { ...settings, maxCallsPerDay: 2 };
    const base = { settings: limited, feature: "t", state: "x", questions: {}, env };
    const fetchImpl = vi.fn(async () => jsonRes(200, okBody({})));
    // Already aborted: no fetch, no log, no count.
    const pre = new AbortController();
    pre.abort();
    expect(await callJev({ ...base, signal: pre.signal, fetchImpl: fetchImpl as any })).toMatchObject({ ok: false, errorKind: "aborted", logged: false });
    expect(fetchImpl).not.toHaveBeenCalled();
    // Aborted mid-flight: fetch rejects, still no log / count / breaker failure.
    const hang = (async (_u: string, init: RequestInit) =>
      new Promise((_, reject) => init.signal!.addEventListener("abort", () => reject(new Error("The operation was aborted"))))) as any;
    for (let i = 0; i < 5; i++) {
      const ac = new AbortController();
      const p = callJev({ ...base, signal: ac.signal, fetchImpl: hang });
      ac.abort();
      expect(await p).toMatchObject({ ok: false, errorKind: "aborted", logged: false });
    }
    expect(existsSync(usage)).toBe(false);
    // Breaker not tripped (5 > 3 failures) and cap (2) untouched: two real calls still go through.
    expect(await callJev({ ...base, fetchImpl: fetchImpl as any })).toMatchObject({ ok: true });
    expect(await callJev({ ...base, fetchImpl: fetchImpl as any })).toMatchObject({ ok: true });
    expect(await callJev({ ...base, fetchImpl: fetchImpl as any })).toMatchObject({ errorKind: "cap" });
  });

  it("writes meta and per-answer confidence into the usage record", async () => {
    const { env, usage } = tmpEnv();
    const answers = { a: { type: "noul", noul: 0.1 }, b: { type: "choice", choice: "x", confidence: 0.55, probabilities: {} } };
    await callJev({
      settings, feature: "ask_jev", state: "x", questions: {}, env,
      meta: { sessionId: "s1", toolCallId: "t1", savedTokensEst: 9 },
      fetchImpl: (async () => jsonRes(200, okBody(answers))) as any,
    });
    expect(JSON.parse(readFileSync(usage, "utf8").trim())).toMatchObject({ sessionId: "s1", toolCallId: "t1", savedTokensEst: 9, confidence: [0.9, 0.55] });
  });

  it("computes confidence, saved tokens and size-only sources", () => {
    expect(answerConfidence({ type: "noul", noul: 0.3 })).toBeCloseTo(0.7);
    expect(answerConfidence({ type: "score", score: 1, confidence: 0.4, legend: {}, probabilities: {} })).toBe(0.4);
    const sources = { stateChars: 100, files: [{ path: "a", bytes: 401, preview: "p", truncated: false }], command: { command: "ls", bytes: 399, preview: "q", truncated: false } };
    expect(estimateSavedTokens(sources)).toBe(200);
    expect(usageSources(sources)).toEqual({ stateChars: 100, files: [{ path: "a", bytes: 401 }], commandBytes: 399 });
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
    for (const ok of ["git branch", "git branch -a", "git branch -vv", "git branch --show-current", "git branch --list 'feat*'", "git branch --contains abc123"]) {
      expect(parseReadOnlyCommand(ok), ok).not.toBeNull();
    }
    for (const bad of [
      "rm -rf /",
      "git push",
      "git commit -m x",
      "git branch -D main",
      "git branch newfeature",
      "git branch -m old new",
      "git branch -f main HEAD~1",
      "git branch --set-upstream-to=origin/main",
      "cat secrets.txt",
      "type secrets.txt",
      "rg -f patterns.txt x",
      "grep --file=/etc/passwd x",
      "rg x -- ../outside",
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

describe("workspace confinement", () => {
  function workspace() {
    const root = mkdtempSync(join(tmpdir(), "jev-ws-"));
    const cwd = join(root, "repo");
    mkdirSync(join(cwd, "src"), { recursive: true });
    writeFileSync(join(cwd, "src", "a.ts"), "ok");
    writeFileSync(join(cwd, ".env"), "SECRET=1");
    writeFileSync(join(root, "outside.txt"), "nope");
    return { root, cwd };
  }

  it("recognises credential-looking paths", () => {
    for (const bad of [".env", ".env.local", "app/.env.production", "certs/server.pem", "deploy.key", ".ssh/config", "id_rsa", "id_ed25519.pub", ".npmrc", "config/auth.json", "secrets.yaml", ".git/config"]) {
      expect(isSecretPath(bad), bad).toBe(true);
    }
    for (const ok of ["src/a.ts", ".env.example", "docs/keys.md", "monkey.ts", "README.md"]) expect(isSecretPath(ok), ok).toBe(false);
  });

  it("allows files inside the workspace and rejects escapes and secrets", () => {
    const { cwd } = workspace();
    expect(() => confine(cwd, "src/a.ts")).not.toThrow();
    expect(() => confine(cwd, ".")).not.toThrow();
    expect(() => confine(cwd, "../outside.txt")).toThrow(/outside the workspace/);
    expect(() => confine(cwd, join(cwd, "..", "outside.txt"))).toThrow(/outside the workspace/);
    expect(() => confine(cwd, ".env")).toThrow(/secret/);
  });

  it("rejects symlinks that point out of the workspace", () => {
    const { root, cwd } = workspace();
    try {
      symlinkSync(join(root, "outside.txt"), join(cwd, "link.txt"), "file");
    } catch {
      return; // creating symlinks needs privileges on some Windows setups
    }
    expect(() => confine(cwd, "link.txt")).toThrow(/outside the workspace/);
  });

  it("checks path-like command args but not search patterns", () => {
    const { cwd } = workspace();
    const run = (c: string) => checkCommandPaths(parseReadOnlyCommand(c)!, cwd);
    expect(() => run("git diff --stat")).not.toThrow();
    expect(() => run("git log origin/main..HEAD")).not.toThrow();
    expect(() => run("rg foo/bar src")).not.toThrow();
    expect(() => run("rg foo ../outside.txt")).toThrow(/outside/);
    expect(() => run("head -n 5 ../outside.txt")).toThrow(/outside/);
    expect(() => run("head .env")).toThrow(/secret/);
    expect(() => run("git diff --no-index /etc/passwd src/a.ts")).toThrow(/outside/);
    expect(() => run("ls --color=../x")).toThrow(/outside/);
  });
});
