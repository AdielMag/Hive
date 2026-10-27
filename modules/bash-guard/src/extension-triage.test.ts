import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearDescribeCache } from "./describe.ts";
import bashGuard from "./extension/hook.ts";
import { parseDangerousBashMessage } from "./shared.ts";

interface Ctx {
  hasUI: boolean;
  ui: { confirm: (title: string, body: string) => Promise<boolean> };
  cwd?: string;
  model?: { provider: string };
  modelRegistry?: unknown;
}
type Handler = (event: { toolName: string; input: unknown }, ctx: Ctx) => Promise<{ block: true; reason: string } | undefined>;

function register(): Handler {
  let handler: Handler | undefined;
  bashGuard({
    on: (_n: string, h: Handler) => {
      handler = h;
    },
  } as never);
  if (!handler) throw new Error("no handler registered");
  return handler;
}

const REPLY = '{"summary":"Discards every uncommitted change in the repo.","impact":"Edits that were never committed cannot be recovered."}';
const registry = (text = REPLY) => ({
  getAvailable: () => [{ id: "claude-haiku-4-5", provider: "anthropic", cost: { input: 1, output: 5 } }],
  complete: vi.fn(async () => ({ content: [{ type: "text", text }] })),
});

const jevFetch = (answers: unknown) => vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ answers }) }));
const ROUTINE = { risk: { score: 0.4 }, approval: { noul: 0.1 } };
const RISKY = { risk: { score: 2.6 }, approval: { noul: 0.95 } };

const saved = { ...process.env };
let dir: string;
beforeEach(() => {
  for (const k of ["HIVE_JEV_CONFIG", "HIVE_JEV_USAGE", "JEV_GUARD_ENABLED", "JEV_API_KEY", "JEV_BASE_URL", "JEV_BASE_API_KEY", "JEV_MODEL", "BASH_GUARD_DESCRIBE", "BASH_GUARD_DESCRIBE_MODEL", "BASH_GUARD_TRIAGE"]) delete process.env[k];
  dir = mkdtempSync(join(tmpdir(), "bash-guard-"));
  process.env.BASH_GUARD_TRIAGE_LOG = join(dir, "triage.jsonl");
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  process.env = { ...saved };
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  clearDescribeCache();
  rmSync(dir, { recursive: true, force: true });
});

function enableJev(): void {
  process.env.JEV_GUARD_ENABLED = "1";
  process.env.JEV_API_KEY = "k";
}

describe("Jev triage of rule hits", () => {
  it("skips the prompt when Jev rates a high rule hit as routine, and logs it", async () => {
    enableJev();
    const fetchMock = jevFetch(ROUTINE);
    vi.stubGlobal("fetch", fetchMock);
    const confirm = vi.fn(async () => true);
    const res = await register()({ toolName: "bash", input: { command: "git reset --hard HEAD" } }, { hasUI: true, ui: { confirm } });
    expect(res).toBeUndefined();
    expect(confirm).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const rec = JSON.parse(readFileSync(process.env.BASH_GUARD_TRIAGE_LOG as string, "utf8").trim()) as Record<string, unknown>;
    expect(rec).toMatchObject({ event: "jev-triaged", ruleId: "git-reset-hard", severity: "high", risk: 0.4, approval: 0.1 });
  });

  it("redacts secrets in the triage log", async () => {
    enableJev();
    vi.stubGlobal("fetch", jevFetch(ROUTINE));
    await register()({ toolName: "bash", input: { command: "git push --force https://user:hunter2@github.com/a/b.git" } }, { hasUI: true, ui: { confirm: async () => true } });
    const log = readFileSync(process.env.BASH_GUARD_TRIAGE_LOG as string, "utf8");
    expect(log).not.toContain("hunter2");
  });

  it("still prompts when Jev agrees it is risky, and shows Jev's scores", async () => {
    enableJev();
    vi.stubGlobal("fetch", jevFetch(RISKY));
    const confirm = vi.fn(async (_t: string, _b: string) => false);
    const res = await register()({ toolName: "bash", input: { command: "git reset --hard HEAD" } }, { hasUI: true, ui: { confirm } });
    expect(res).toMatchObject({ block: true });
    const payload = parseDangerousBashMessage((confirm.mock.calls[0] as [string, string])[1]);
    expect(payload).toMatchObject({ ruleId: "git-reset-hard", source: "rule", jev: { risk: 2.6, approval: 0.95 } });
  });

  it("prompts when Jev is unreachable (fail safe for rule hits)", async () => {
    enableJev();
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("offline");
    }));
    const confirm = vi.fn(async () => true);
    await register()({ toolName: "bash", input: { command: "git reset --hard HEAD" } }, { hasUI: true, ui: { confirm } });
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it("never lets Jev silence a critical rule hit, and does not even ask", async () => {
    enableJev();
    const fetchMock = jevFetch(ROUTINE);
    vi.stubGlobal("fetch", fetchMock);
    const confirm = vi.fn(async () => true);
    await register()({ toolName: "bash", input: { command: "sudo rm -rf /var/lib" } }, { hasUI: true, ui: { confirm } });
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("BASH_GUARD_TRIAGE=0 keeps every rule hit prompting", async () => {
    enableJev();
    process.env.BASH_GUARD_TRIAGE = "0";
    const fetchMock = jevFetch(ROUTINE);
    vi.stubGlobal("fetch", fetchMock);
    const confirm = vi.fn(async () => true);
    await register()({ toolName: "bash", input: { command: "git reset --hard HEAD" } }, { hasUI: true, ui: { confirm } });
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("without Jev configured, behaviour is unchanged: rule hit prompts, nothing is sent", async () => {
    delete process.env.JEV_GUARD_ENABLED;
    delete process.env.JEV_API_KEY;
    delete process.env.HIVE_JEV_CONFIG;
    const fetchMock = jevFetch(ROUTINE);
    vi.stubGlobal("fetch", fetchMock);
    const reg = registry();
    const confirm = vi.fn(async (_t: string, _b: string) => true);
    await register()({ toolName: "bash", input: { command: "git reset --hard HEAD" } }, { hasUI: true, ui: { confirm }, modelRegistry: reg });
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(reg.complete).not.toHaveBeenCalled();
    expect(parseDangerousBashMessage((confirm.mock.calls[0] as [string, string])[1])?.description).toBeUndefined();
  });

  it("works from the Jev module's config.json (key + consent)", async () => {
    delete process.env.JEV_GUARD_ENABLED;
    delete process.env.JEV_API_KEY;
    const cfg = join(dir, "config.json");
    writeFileSync(cfg, JSON.stringify({ apiKey: "from-module", consentAt: 1 }));
    process.env.HIVE_JEV_CONFIG = cfg;
    const fetchMock = jevFetch(ROUTINE);
    vi.stubGlobal("fetch", fetchMock);
    const confirm = vi.fn(async () => true);
    await register()({ toolName: "bash", input: { command: "git reset --hard HEAD" } }, { hasUI: true, ui: { confirm } });
    expect(confirm).not.toHaveBeenCalled();
    expect((fetchMock.mock.calls[0] as unknown as [string, { headers: Record<string, string> }])[1].headers.Authorization).toBe("Bearer from-module");
  });

  it("ignores the Jev module's config without consent", async () => {
    delete process.env.JEV_GUARD_ENABLED;
    delete process.env.JEV_API_KEY;
    const cfg = join(dir, "config.json");
    writeFileSync(cfg, JSON.stringify({ apiKey: "from-module" }));
    process.env.HIVE_JEV_CONFIG = cfg;
    const fetchMock = jevFetch(ROUTINE);
    vi.stubGlobal("fetch", fetchMock);
    const confirm = vi.fn(async () => true);
    await register()({ toolName: "bash", input: { command: "git reset --hard HEAD" } }, { hasUI: true, ui: { confirm } });
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("plain-language description on the prompt", () => {
  it("adds the cheap model's description to the payload", async () => {
    enableJev();
    vi.stubGlobal("fetch", jevFetch(RISKY));
    const reg = registry();
    const confirm = vi.fn(async (_t: string, _b: string) => true);
    await register()({ toolName: "bash", input: { command: "git reset --hard HEAD" } }, { hasUI: true, ui: { confirm }, modelRegistry: reg, cwd: "C:\\work\\app" });
    const payload = parseDangerousBashMessage((confirm.mock.calls[0] as [string, string])[1]);
    expect(payload?.description).toEqual({ summary: "Discards every uncommitted change in the repo.", impact: "Edits that were never committed cannot be recovered." });
    expect(reg.complete).toHaveBeenCalledTimes(1);
  });

  it("describes critical hits too, without consulting Jev", async () => {
    enableJev();
    const fetchMock = jevFetch(ROUTINE);
    vi.stubGlobal("fetch", fetchMock);
    const confirm = vi.fn(async (_t: string, _b: string) => true);
    await register()({ toolName: "bash", input: { command: "sudo ls /root" } }, { hasUI: true, ui: { confirm }, modelRegistry: registry() });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(parseDangerousBashMessage((confirm.mock.calls[0] as [string, string])[1])?.description?.summary).toBeTruthy();
  });

  it("falls back to the rule text when the describer fails", async () => {
    enableJev();
    vi.stubGlobal("fetch", jevFetch(RISKY));
    const confirm = vi.fn(async (_t: string, _b: string) => true);
    await register()({ toolName: "bash", input: { command: "git reset --hard HEAD" } }, { hasUI: true, ui: { confirm }, modelRegistry: registry("no json here") });
    const payload = parseDangerousBashMessage((confirm.mock.calls[0] as [string, string])[1]);
    expect(payload?.description).toBeUndefined();
    expect(payload?.reason).toBeTruthy();
  });

  it("a triage skip never prompts, even with a describer available", async () => {
    enableJev();
    vi.stubGlobal("fetch", jevFetch(ROUTINE));
    const confirm = vi.fn(async () => true);
    expect(await register()({ toolName: "bash", input: { command: "git reset --hard HEAD" } }, { hasUI: true, ui: { confirm }, modelRegistry: registry() })).toBeUndefined();
    expect(confirm).not.toHaveBeenCalled();
  });

  it("BASH_GUARD_DESCRIBE=0 turns it off even with Jev on", async () => {
    enableJev();
    process.env.BASH_GUARD_DESCRIBE = "0";
    vi.stubGlobal("fetch", jevFetch(RISKY));
    const reg = registry();
    await register()({ toolName: "bash", input: { command: "git reset --hard HEAD" } }, { hasUI: true, ui: { confirm: async () => true }, modelRegistry: reg });
    expect(reg.complete).not.toHaveBeenCalled();
  });

  it("is not used in headless mode", async () => {
    enableJev();
    vi.stubGlobal("fetch", jevFetch(RISKY));
    const reg = registry();
    const res = await register()({ toolName: "bash", input: { command: "git reset --hard HEAD" } }, { hasUI: false, ui: { confirm: async () => true }, modelRegistry: reg });
    expect(res).toMatchObject({ block: true });
    expect(reg.complete).not.toHaveBeenCalled();
  });

  it("describes a Jev-only escalation as well", async () => {
    enableJev();
    vi.stubGlobal("fetch", jevFetch(RISKY));
    const confirm = vi.fn(async (_t: string, _b: string) => true);
    await register()({ toolName: "bash", input: { command: "python3 deploy.py --prod" } }, { hasUI: true, ui: { confirm }, modelRegistry: registry() });
    const payload = parseDangerousBashMessage((confirm.mock.calls[0] as [string, string])[1]);
    expect(payload).toMatchObject({ source: "jev", ruleId: "jev-judge" });
    expect(payload?.description).toBeTruthy();
  });
});
