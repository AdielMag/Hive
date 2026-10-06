import { describe, expect, it, vi } from "vitest";
import { decideFromJev, isReadOnlyAllowlisted, JEV_THRESHOLDS, redactSecrets, shouldJudge } from "./engine/judge.ts";
import { askJev, buildRequestBody, parseAnswers, readJevConfig, systemOneUrl, type FetchLike } from "./jev.ts";
import { classifyBashCommand } from "./classifier.ts";

const ENABLED = { JEV_GUARD_ENABLED: "1", JEV_API_KEY: "key-123" };

function okFetch(answers: unknown): FetchLike {
  return vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ answers }) }));
}

describe("redactSecrets", () => {
  it.each([
    ["API_KEY=abc123 npm run x", "API_KEY=[REDACTED] npm run x"],
    ["export GITHUB_TOKEN='tok en' && ls", "export GITHUB_TOKEN=[REDACTED] && ls"],
    ["curl -H 'Authorization: Bearer abcdef123456' https://x", "curl -H 'Authorization: [REDACTED]' https://x"],
    ["curl -H 'X: Bearer abcdef123456789'", "curl -H 'X: Bearer [REDACTED]'"],
    ["echo sk-abcdefghijklmnopqrstuvwxyz", "echo [REDACTED]"],
    ["echo ghp_abcdefghijklmnopqrstuvwxyz0123", "echo [REDACTED]"],
    ["echo AKIAABCDEFGHIJKLMNOP", "echo [REDACTED]"],
    ["git clone https://user:pass@github.com/a/b.git", "git clone https://[REDACTED]@github.com/a/b.git"],
    ["git clone https://ghp_abcdefghijklmnopqrstuvwxyz0123@github.com/a/b", "git clone https://[REDACTED]@github.com/a/b"],
    ["mycli --password hunter2 run", "mycli --password [REDACTED] run"],
    ["curl -u admin:secret https://api.com", "curl -u [REDACTED] https://api.com"],
    ["curl -H 'X-Api-Key: mykey' https://x", "curl -H 'X-Api-Key: [REDACTED]' https://x"],
    ["sshpass -p mypass ssh host", "sshpass -p [REDACTED] ssh host"],
    ["docker login -p mypass", "docker login -p [REDACTED]"],
    ["aws_secret_access_key secretval", "aws_secret_access_key=[REDACTED]"],
  ])("redacts %s", (input, expected) => {
    expect(redactSecrets(input)).toBe(expected);
  });

  it("leaves ordinary commands untouched", () => {
    expect(redactSecrets("npm run build -- --watch")).toBe("npm run build -- --watch");
    expect(redactSecrets("NODE_ENV=production node a.js")).toBe("NODE_ENV=production node a.js");
  });
});

describe("allowlist gate", () => {
  it.each(["ls -la", "git status", "git diff HEAD", "git log -n 5", "npm test", "npm run test:unit", "cat package.json | head", "cd src && ls", "rg foo", "node --version", "tsc --noEmit", "git branch -a"])(
    "allowlists %s",
    (c) => expect(isReadOnlyAllowlisted(c)).toBe(true),
  );

  it.each(["npm install left-pad", "curl https://example.com", "python3 script.py", "ls > out.txt", "git push", "git branch -D x", "find . -delete", "echo $(curl x)", "make deploy", "sed -i s/a/b/ f"])(
    "does not allowlist %s",
    (c) => expect(isReadOnlyAllowlisted(c)).toBe(false),
  );

  it("shouldJudge: never for rule hits, allowlisted or empty commands", () => {
    expect(shouldJudge("rm -rf x", true)).toBe(false);
    expect(shouldJudge("ls", false)).toBe(false);
    expect(shouldJudge("  ", false)).toBe(false);
    expect(shouldJudge("python3 script.py", false)).toBe(true);
  });

  it("an unflagged unknown command is judged; a rule hit is not", () => {
    expect(shouldJudge("python3 deploy.py", classifyBashCommand("python3 deploy.py").dangerous)).toBe(true);
    expect(shouldJudge("rm -rf x", classifyBashCommand("rm -rf x").dangerous)).toBe(false);
  });
});

describe("decideFromJev thresholds", () => {
  it("confirms at the risk threshold and just below does not", () => {
    expect(decideFromJev({ risk: JEV_THRESHOLDS.riskConfirm, approval: 0 }).confirm).toBe(true);
    expect(decideFromJev({ risk: 1.49, approval: 0.1 }).confirm).toBe(false);
  });

  it("confirms at the approval threshold and just below does not", () => {
    expect(decideFromJev({ risk: 0, approval: 0.75 }).confirm).toBe(true);
    expect(decideFromJev({ risk: 0, approval: 0.74 }).confirm).toBe(false);
  });

  it("fails open on missing or invalid answers", () => {
    expect(decideFromJev(null).confirm).toBe(false);
    expect(decideFromJev({}).confirm).toBe(false);
    expect(decideFromJev({ risk: Number.NaN, approval: Number.NaN }).confirm).toBe(false);
  });

  it("marks very high risk as high severity, otherwise moderate", () => {
    expect(decideFromJev({ risk: 2.7 }).severity).toBe("high");
    expect(decideFromJev({ risk: 1.6 }).severity).toBe("moderate");
  });
});

describe("readJevConfig", () => {
  it("is off by default, even with a key", () => {
    expect(readJevConfig({ JEV_API_KEY: "k" }).enabled).toBe(false);
  });

  it("needs a key when enabled", () => {
    const cfg = readJevConfig({ JEV_GUARD_ENABLED: "1" });
    expect(cfg.enabled).toBe(false);
    expect(cfg.inactiveReason).toMatch(/JEV_API_KEY/);
  });

  it("uses the TypeSafe default base", () => {
    const cfg = readJevConfig(ENABLED);
    expect(cfg.enabled).toBe(true);
    expect(cfg.url).toBe("https://api.typesafe.ai/v1/systemone");
    expect(cfg.apiKey).toBe("key-123");
    expect(cfg.timeoutMs).toBe(1500);
  });

  it("honours JEV_BASE_URL and never forwards JEV_API_KEY to it", () => {
    const cfg = readJevConfig({ ...ENABLED, JEV_BASE_URL: "http://127.0.0.1:8009" });
    expect(cfg.url).toBe("http://127.0.0.1:8009/v1/systemone");
    expect(cfg.apiKey).toBeUndefined();
    expect(readJevConfig({ ...ENABLED, JEV_BASE_URL: "https://jev.internal", JEV_BASE_API_KEY: "own" }).apiKey).toBe("own");
  });

  it("rejects insecure remote base URLs", () => {
    expect(readJevConfig({ ...ENABLED, JEV_BASE_URL: "http://evil.example" }).enabled).toBe(false);
    expect(systemOneUrl("not a url")).toBeNull();
    expect(systemOneUrl("http://192.168.1.5:9")).toBe("http://192.168.1.5:9/v1/systemone");
  });
});

describe("request and response schema", () => {
  it("builds a redacted System One body with the two typed questions", () => {
    const body = JSON.parse(buildRequestBody("API_KEY=secret curl https://u:p@x.example", "jev-latest"));
    expect(body.model).toBe("jev-latest");
    expect(body.state.tool).toBe("bash");
    expect(body.state.input.command).not.toContain("secret");
    expect(body.state.input.command).not.toContain("u:p@");
    expect(Object.keys(body.questions)).toEqual(["risk", "approval"]);
    expect(body.questions.risk.type).toBe("score");
    expect(body.questions.approval.type).toBe("noul");
  });

  it("parses score and noul answers", () => {
    expect(parseAnswers({ answers: { risk: { score: 2.1 }, approval: { noul: 0.8 } } })).toEqual({ risk: 2.1, approval: 0.8 });
    expect(parseAnswers({ answers: { risk: { score: 1 }, approval: { probability: 0.2 } } })).toEqual({ risk: 1, approval: 0.2 });
    expect(parseAnswers({ answers: {} })).toBeNull();
    expect(parseAnswers(null)).toBeNull();
    expect(parseAnswers({ answers: { risk: { score: "x" } } })).toBeNull();
  });
});

describe("askJev (mocked client)", () => {
  it("sends nothing when disabled", async () => {
    const fetchImpl = okFetch({ risk: { score: 3 } });
    expect(await askJev("python3 x.py", { env: { JEV_API_KEY: "k" }, fetchImpl })).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("posts redacted command with bearer auth and returns answers", async () => {
    const fetchImpl = okFetch({ risk: { score: 2 }, approval: { noul: 0.9 } });
    const res = await askJev("TOKEN=abc python3 x.py", { env: ENABLED, fetchImpl });
    expect(res).toEqual({ risk: 2, approval: 0.9 });
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, { headers: Record<string, string>; body: string }];
    expect(url).toBe("https://api.typesafe.ai/v1/systemone");
    expect(init.headers.Authorization).toBe("Bearer key-123");
    expect(init.body).not.toContain("abc");
  });

  it("fails open (null) on bad key / HTTP error", async () => {
    const logs: string[] = [];
    const fetchImpl: FetchLike = async () => ({ ok: false, status: 401, json: async () => ({}) });
    expect(await askJev("x", { env: ENABLED, fetchImpl, log: (m) => logs.push(m) })).toBeNull();
    expect(logs[0]).toMatch(/HTTP 401/);
  });

  it("fails open on network errors and malformed bodies", async () => {
    const boom: FetchLike = async () => {
      throw new Error("ECONNRESET");
    };
    expect(await askJev("x", { env: ENABLED, fetchImpl: boom })).toBeNull();
    const garbage: FetchLike = async () => ({ ok: true, status: 200, json: async () => ({ nope: 1 }) });
    expect(await askJev("x", { env: ENABLED, fetchImpl: garbage })).toBeNull();
    const badJson: FetchLike = async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("bad json");
      },
    });
    expect(await askJev("x", { env: ENABLED, fetchImpl: badJson })).toBeNull();
  });

  it("times out after 1.5s even if the client ignores the abort signal", async () => {
    vi.useFakeTimers();
    try {
      const logs: string[] = [];
      const hang: FetchLike = () => new Promise(() => {});
      const pending = askJev("x", { env: ENABLED, fetchImpl: hang, log: (m) => logs.push(m) });
      await vi.advanceTimersByTimeAsync(1499);
      let settled = false;
      void pending.then(() => (settled = true));
      await Promise.resolve();
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(2);
      expect(await pending).toBeNull();
      expect(logs[0]).toMatch(/timed out/);
    } finally {
      vi.useRealTimers();
    }
  });

  it("never throws even if the logger throws", async () => {
    const fetchImpl: FetchLike = async () => ({ ok: false, status: 500, json: async () => ({}) });
    await expect(askJev("x", { env: ENABLED, fetchImpl, log: () => {} })).resolves.toBeNull();
  });
});
