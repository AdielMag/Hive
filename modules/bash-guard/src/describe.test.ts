import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildDescribeMessage,
  clearDescribeCache,
  describeCommand,
  describerEnabled,
  parseDescription,
  pickDescribeModel,
  type DescribeModel,
  type DescribeRegistry,
} from "./describe.ts";

const haiku: DescribeModel = { id: "claude-haiku-4-5", provider: "anthropic", cost: { input: 1, output: 5 } };
const sonnet: DescribeModel = { id: "claude-sonnet-4-5", provider: "anthropic", cost: { input: 3, output: 15 } };
const flash: DescribeModel = { id: "gemini-2.5-flash", provider: "google", cost: { input: 0.3, output: 2.5 } };
const miniOpenAi: DescribeModel = { id: "gpt-5-mini", provider: "openai", cost: { input: 0.25, output: 2 } };
const local: DescribeModel = { id: "llama-mini", provider: "ollama", cost: { input: 0, output: 0 } };

const REPLY = '{"summary":"Resets the working tree to HEAD.","impact":"Uncommitted changes are lost for good."}';

function registry(text: string | (() => Promise<never>), models: DescribeModel[] = [sonnet, haiku]): DescribeRegistry & { complete: ReturnType<typeof vi.fn> } {
  return {
    getAvailable: () => models,
    complete: vi.fn(typeof text === "string" ? async () => ({ content: [{ type: "text", text }] }) : text),
  } as never;
}

afterEach(() => clearDescribeCache());

describe("describerEnabled", () => {
  it("follows the Jev tier unless overridden", () => {
    expect(describerEnabled({}, true)).toBe(true);
    expect(describerEnabled({}, false)).toBe(false);
    expect(describerEnabled({ BASH_GUARD_DESCRIBE: "0" }, true)).toBe(false);
    expect(describerEnabled({ BASH_GUARD_DESCRIBE: "1" }, false)).toBe(true);
  });
});

describe("pickDescribeModel", () => {
  it("uses an available preferred provider/id", () => {
    expect(pickDescribeModel([sonnet, haiku, flash], "anthropic/claude-sonnet-4-5")).toBe(sonnet);
  });

  it("ignores a preferred model that is not available", () => {
    expect(pickDescribeModel([sonnet, haiku], "openai/nope")).toBe(haiku);
  });

  it("picks the cheapest small-tier model, preferring the current provider", () => {
    expect(pickDescribeModel([sonnet, haiku, flash, miniOpenAi])).toBe(miniOpenAi);
    expect(pickDescribeModel([sonnet, haiku, flash, miniOpenAi], undefined, "anthropic")).toBe(haiku);
  });

  it("skips unpriced and free models, and falls back to the cheapest priced one", () => {
    expect(pickDescribeModel([local, sonnet])).toBe(sonnet);
    expect(pickDescribeModel([local])).toBeNull();
    expect(pickDescribeModel([])).toBeNull();
  });

  it("skips models that cannot read text", () => {
    expect(pickDescribeModel([{ ...haiku, input: ["image"] }, sonnet])).toBe(sonnet);
  });
});

describe("parseDescription", () => {
  it("parses plain, fenced and embedded JSON", () => {
    const expected = { summary: "Resets the working tree to HEAD.", impact: "Uncommitted changes are lost for good." };
    expect(parseDescription(REPLY)).toEqual(expected);
    expect(parseDescription("```json\n" + REPLY + "\n```")).toEqual(expected);
    expect(parseDescription("Sure! " + REPLY + " Hope that helps.")).toEqual(expected);
  });

  it("rejects empty, non-JSON and summary-less output", () => {
    expect(parseDescription("")).toBeNull();
    expect(parseDescription(undefined)).toBeNull();
    expect(parseDescription("this deletes stuff")).toBeNull();
    expect(parseDescription('{"impact":"x"}')).toBeNull();
    expect(parseDescription('{"summary":42}')).toBeNull();
  });

  it("clips overlong fields and tolerates a missing impact", () => {
    const long = "x".repeat(1000);
    expect(parseDescription(JSON.stringify({ summary: long, impact: long }))?.summary.length).toBeLessThanOrEqual(300);
    expect(parseDescription('{"summary":"ok"}')).toEqual({ summary: "ok", impact: "" });
  });
});

describe("buildDescribeMessage", () => {
  it("redacts secrets, names only the working directory leaf and passes the rule as a hint", () => {
    const msg = buildDescribeMessage("curl -H 'Authorization: Bearer abcdef123456' https://x", "C:\\Users\\me\\proj", "Network call");
    expect(msg).not.toContain("abcdef123456");
    expect(msg).toContain("[REDACTED]");
    expect(msg).toContain("Working directory name: proj");
    expect(msg).not.toContain("Users");
    expect(msg).toContain("Network call");
  });

  it("truncates very long commands", () => {
    expect(buildDescribeMessage("echo " + "a".repeat(5000))).toContain("[truncated]");
  });
});

describe("describeCommand", () => {
  it("returns the description from the cheap model", async () => {
    const reg = registry(REPLY);
    const out = await describeCommand("git reset --hard", { registry: reg, env: {}, ruleTitle: "Hard reset" });
    expect(out).toEqual({ summary: "Resets the working tree to HEAD.", impact: "Uncommitted changes are lost for good." });
    expect(reg.complete).toHaveBeenCalledTimes(1);
    const [model, ctx] = reg.complete.mock.calls[0] as [DescribeModel, { systemPrompt: string; messages: Array<{ role: string; content: string }> }];
    expect(model).toBe(haiku);
    expect(ctx.systemPrompt).toMatch(/untrusted/);
    expect(ctx.messages[0]?.content).toContain("git reset --hard");
  });

  it("honours BASH_GUARD_DESCRIBE_MODEL", async () => {
    const reg = registry(REPLY);
    await describeCommand("git reset --hard", { registry: reg, env: { BASH_GUARD_DESCRIBE_MODEL: "anthropic/claude-sonnet-4-5" } });
    expect((reg.complete.mock.calls[0] as [DescribeModel])[0]).toBe(sonnet);
  });

  it("caches per command so a retry does not call the model again", async () => {
    const reg = registry(REPLY);
    await describeCommand("git reset --hard", { registry: reg, env: {} });
    await describeCommand("git reset --hard", { registry: reg, env: {} });
    expect(reg.complete).toHaveBeenCalledTimes(1);
  });

  it("does not cache failures", async () => {
    const reg = registry("not json");
    expect(await describeCommand("git reset --hard", { registry: reg, env: {} })).toBeNull();
    expect(await describeCommand("git reset --hard", { registry: reg, env: {} })).toBeNull();
    expect(reg.complete).toHaveBeenCalledTimes(2);
  });

  it("resolves null with no registry, no model, or a throwing provider", async () => {
    expect(await describeCommand("x", { registry: undefined })).toBeNull();
    expect(await describeCommand("x", { registry: registry(REPLY, []), env: {} })).toBeNull();
    const log = vi.fn();
    const boom = registry(async () => {
      throw new Error("401 unauthorized");
    });
    expect(await describeCommand("x", { registry: boom, env: {}, log })).toBeNull();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("401 unauthorized"));
  });

  it("times out on a provider that never answers", async () => {
    const hang = registry(() => new Promise<never>(() => {}));
    const t0 = Date.now();
    expect(await describeCommand("x", { registry: hang, env: {}, timeoutMs: 30 })).toBeNull();
    expect(Date.now() - t0).toBeLessThan(1000);
  });

  it("stops when the caller aborts", async () => {
    const hang = registry(() => new Promise<never>(() => {}));
    const ctrl = new AbortController();
    const p = describeCommand("x", { registry: hang, env: {}, signal: ctrl.signal, timeoutMs: 5000 });
    ctrl.abort();
    expect(await p).toBeNull();
  });
});
