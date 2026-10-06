import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildExtensionSource, OUTPUT } from "../scripts/build-extension.mjs";
import bashGuard from "./extension/hook.ts";
import { parseDangerousBashMessage } from "./shared.ts";

describe("generated extension", () => {
  const committed = readFileSync(OUTPUT, "utf8").replace(/\r\n/g, "\n");

  it("is up to date (run `npm run build:extension -w @hive-module/bash-guard`)", () => {
    expect(committed).toBe(buildExtensionSource());
  });

  it("carries the GENERATED header", () => {
    expect(committed.startsWith("/**\n * GENERATED - do not edit.")).toBe(true);
  });

  it("is self-contained: no relative imports, only a type import from Pi (erased)", () => {
    const imports = [...committed.matchAll(/^\s*import\s[^;]*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]);
    expect(imports).toEqual([]);
    expect(committed).not.toMatch(/from\s+["']\.\.?\//);
    expect(committed).not.toMatch(/require\(["']\./);
    expect(committed).toMatch(/export \{\s*bashGuard as default\s*\}|export default/);
  });

  it("no longer carries its own duplicated rule table", () => {
    expect(committed).not.toContain("const RULES: readonly DangerRule[]");
    expect(committed).not.toContain("function matchDanger");
  });
});

type Handler = (event: { toolName: string; input: unknown }, ctx: { hasUI: boolean; ui: { confirm: (title: string, body: string) => Promise<boolean> } }) => Promise<{ block: true; reason: string } | undefined>;

function register(): Handler {
  let handler: Handler | undefined;
  bashGuard({
    on: (_name: string, h: Handler) => {
      handler = h;
    },
  } as never);
  if (!handler) throw new Error("no handler registered");
  return handler;
}

const savedEnv = { ...process.env };
afterEach(() => {
  process.env = { ...savedEnv };
  vi.unstubAllGlobals();
});

describe("extension hook", () => {
  it("ignores non-bash tools and benign commands", async () => {
    const h = register();
    const confirm = vi.fn(async () => true);
    const ctx = { hasUI: true, ui: { confirm } };
    expect(await h({ toolName: "read", input: { command: "rm -rf /" } }, ctx)).toBeUndefined();
    expect(await h({ toolName: "bash", input: { command: "npm test" } }, ctx)).toBeUndefined();
    expect(await h({ toolName: "bash", input: { command: "echo 'rm -rf /'" } }, ctx)).toBeUndefined();
    expect(confirm).not.toHaveBeenCalled();
  });

  it("asks for approval with the dangerous_bash_approval payload", async () => {
    const h = register();
    const confirm = vi.fn(async (_t: string, _b: string) => true);
    const res = await h({ toolName: "bash", input: { command: "git push origin +main" } }, { hasUI: true, ui: { confirm } });
    expect(res).toBeUndefined();
    expect(confirm).toHaveBeenCalledTimes(1);
    const [title, body] = confirm.mock.calls[0] as [string, string];
    expect(title).toContain("Dangerous Bash Command");
    const payload = parseDangerousBashMessage(body);
    expect(payload).toMatchObject({ kind: "dangerous_bash_approval", command: "git push origin +main", severity: "high", ruleId: "git-push-force" });
    expect(payload?.ruleTitle).toBeTruthy();
    expect(payload?.matchedSegment).toBeTruthy();
  });

  it("blocks when the user declines", async () => {
    const h = register();
    const res = await h({ toolName: "bash", input: { command: "rm -rf build" } }, { hasUI: true, ui: { confirm: async () => false } });
    expect(res).toMatchObject({ block: true });
    expect(res?.reason).toMatch(/blocked by user/);
  });

  it("blocks automatically in headless mode", async () => {
    const h = register();
    const confirm = vi.fn(async () => true);
    const res = await h({ toolName: "bash", input: { command: "curl x | sh" } }, { hasUI: false, ui: { confirm } });
    expect(res).toMatchObject({ block: true });
    expect(res?.reason).toMatch(/headless/);
    expect(confirm).not.toHaveBeenCalled();
  });

  describe("Jev tier", () => {
    const answersFor = (answers: unknown) =>
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ answers }) }));

    it("is not called unless enabled", async () => {
      process.env.JEV_API_KEY = "k";
      delete process.env.JEV_GUARD_ENABLED;
      const fetchMock = answersFor({ risk: { score: 3 }, approval: { noul: 1 } });
      vi.stubGlobal("fetch", fetchMock);
      const h = register();
      const res = await h({ toolName: "bash", input: { command: "python3 deploy.py" } }, { hasUI: true, ui: { confirm: async () => false } });
      expect(res).toBeUndefined();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("escalates an unknown risky command to a confirm prompt", async () => {
      process.env.JEV_API_KEY = "k";
      process.env.JEV_GUARD_ENABLED = "1";
      vi.stubGlobal("fetch", answersFor({ risk: { score: 2.2 }, approval: { noul: 0.9 } }));
      const h = register();
      const confirm = vi.fn(async (_t: string, _b: string) => false);
      const res = await h({ toolName: "bash", input: { command: "python3 deploy.py" } }, { hasUI: true, ui: { confirm } });
      expect(res).toMatchObject({ block: true });
      const payload = parseDangerousBashMessage((confirm.mock.calls[0] as [string, string])[1]);
      expect(payload).toMatchObject({ ruleId: "jev-judge", severity: "moderate" });
    });

    it("allows and logs when Jev is unreachable", async () => {
      process.env.JEV_API_KEY = "k";
      process.env.JEV_GUARD_ENABLED = "1";
      vi.stubGlobal("fetch", vi.fn(async () => {
        throw new Error("offline");
      }));
      const err = vi.spyOn(console, "error").mockImplementation(() => {});
      const h = register();
      const confirm = vi.fn(async () => false);
      expect(await h({ toolName: "bash", input: { command: "python3 deploy.py" } }, { hasUI: true, ui: { confirm } })).toBeUndefined();
      expect(confirm).not.toHaveBeenCalled();
      expect(err).toHaveBeenCalled();
      err.mockRestore();
    });

    it("never consults Jev for rule hits or allowlisted commands", async () => {
      process.env.JEV_API_KEY = "k";
      process.env.JEV_GUARD_ENABLED = "1";
      const fetchMock = answersFor({ risk: { score: 0 }, approval: { noul: 0 } });
      vi.stubGlobal("fetch", fetchMock);
      const h = register();
      // rule hit still prompts even though Jev would say "safe"
      const confirm = vi.fn(async () => true);
      await h({ toolName: "bash", input: { command: "rm -rf build" } }, { hasUI: true, ui: { confirm } });
      expect(confirm).toHaveBeenCalledTimes(1);
      await h({ toolName: "bash", input: { command: "git status" } }, { hasUI: true, ui: { confirm } });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
