import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ModuleManifest } from "@hive/module-sdk";
import type { MainModule } from "@hive/module-sdk/main";
import { MODULES_FILE, MainModuleHost, initialModulesState, type ModuleEventOut } from "./host.ts";

const quiet = { info() {}, warn() {}, error() {} };

const m = (id: string, tier: ModuleManifest["tier"], extra: Partial<ModuleManifest> = {}): ModuleManifest => ({
  id,
  title: id,
  description: id,
  tier,
  hasMain: true,
  ...extra,
});

const MANIFESTS: ModuleManifest[] = [
  m("base", "recommended"),
  m("child", "recommended", { requires: ["base"] }),
  m("extra", "bonus"),
  m("assets", "bonus", { agent: { skills: ["agent/skills/*"] } }),
];

let tmp: string;
let dataDir: string;
let piDir: string;
let moduleRoots: string;
let sent: ModuleEventOut[];
let activated: string[];
let disposed: string[];

function makeHost(over: { manifests?: ModuleManifest[]; failOn?: string } = {}) {
  const loaders: Record<string, () => Promise<{ default: MainModule }>> = {};
  for (const man of over.manifests ?? MANIFESTS) {
    loaders[man.id] = async () => ({
      default: {
        id: man.id,
        activate(ctx) {
          if (over.failOn === man.id) throw new Error("boom");
          activated.push(man.id);
          ctx.ipc.handle("ping", (x: unknown) => `${man.id}:${String(x)}`);
          ctx.ipc.emit("ready", { id: man.id });
          return () => void disposed.push(man.id);
        },
      },
    });
  }
  return new MainModuleHost({
    manifests: over.manifests ?? MANIFESTS,
    loaders,
    hiveDataDir: dataDir,
    piAgentDir: () => piDir,
    moduleRoot: (id) => join(moduleRoots, id),
    send: (msg) => sent.push(msg),
    platform: "linux",
    log: quiet,
  });
}

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "hive-host-"));
  dataDir = join(tmp, "hive");
  piDir = join(tmp, "pi");
  moduleRoots = join(tmp, "modules");
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(join(moduleRoots, "assets", "agent", "skills", "sk"), { recursive: true });
  writeFileSync(join(moduleRoots, "assets", "agent", "skills", "sk", "SKILL.md"), "# sk\n");
  sent = [];
  activated = [];
  disposed = [];
});

afterEach(() => rmSync(tmp, { recursive: true, force: true }));

describe("initial state", () => {
  it("fresh install: recommended tier on, picker pending", () => {
    const s = initialModulesState(MANIFESTS, dataDir);
    expect(s.enabled).toEqual(["base", "child"]);
    expect(s.onboarded).toBe(false);
  });

  it("upgrade (existing Hive state found): everything on, no picker", () => {
    writeFileSync(join(dataDir, "ui-state.json"), "{}");
    const s = initialModulesState(MANIFESTS, dataDir);
    expect(s.enabled.sort()).toEqual(["assets", "base", "child", "extra"]);
    expect(s.onboarded).toBe(true);
  });

  it("persists modules.json on first load and reads it back", () => {
    const host = makeHost();
    expect(existsSync(join(dataDir, MODULES_FILE))).toBe(true);
    expect(host.isEnabled("base")).toBe(true);
    expect(makeHost().getState().enabled).toEqual(host.getState().enabled);
  });

  it("rebuilds a corrupt modules.json", () => {
    writeFileSync(join(dataDir, MODULES_FILE), "{not json");
    expect(makeHost().isEnabled("base")).toBe(true);
  });
});

describe("lifecycle", () => {
  it("start() activates enabled modules requirements-first and skips disabled ones", async () => {
    const host = makeHost();
    await host.start();
    expect(activated).toEqual(["base", "child"]);
    expect(host.isActive("extra")).toBe(false);
  });

  it("enabling pulls in requirements; disabling cascades to dependents", async () => {
    const host = makeHost();
    await host.start();
    await host.setEnabled("child", false);
    expect(host.isEnabled("child")).toBe(false);
    expect(host.isEnabled("base")).toBe(true);
    await host.setEnabled("base", false);
    expect(host.isActive("base")).toBe(false);
    const res = await host.setEnabled("child", true);
    expect(res.enabled).toEqual(["base", "child"]);
    expect(host.isActive("base")).toBe(true);
  });

  it("disposes on disable, and dependents are disposed before requirements", async () => {
    const host = makeHost();
    await host.start();
    await host.setEnabledSet([]);
    expect(disposed).toEqual(["child", "base"]);
  });

  it("rejects unknown modules in toggles", async () => {
    const host = makeHost();
    await expect(host.setEnabled("ghost", true)).rejects.toThrow(/Unknown module/);
  });

  it("a module that throws in activate() is reported, stays enabled, and does not break others", async () => {
    const host = makeHost({ failOn: "base" });
    await host.start();
    expect(host.isActive("base")).toBe(false);
    expect(activated).toEqual(["child"]);
    const snap = host.snapshot();
    expect(snap.modules.find((x) => x.manifest.id === "base")?.error).toBe("boom");
  });
});

describe("IPC gate", () => {
  it("routes calls to an enabled module", async () => {
    const host = makeHost();
    await host.start();
    await expect(host.invoke("base", "ping", [7])).resolves.toBe("base:7");
    expect(sent).toContainEqual({ moduleId: "base", event: "ready", payload: { id: "base" } });
  });

  it("rejects calls to a disabled module and to an unknown module", async () => {
    const host = makeHost();
    await host.start();
    await expect(host.invoke("extra", "ping", [])).rejects.toThrow(/disabled/);
    await expect(host.invoke("ghost", "ping", [])).rejects.toThrow(/Unknown module/);
  });

  it("rejects an unknown method", async () => {
    const host = makeHost();
    await host.start();
    await expect(host.invoke("base", "nope", [])).rejects.toThrow(/no method/);
  });

  it("stops answering the moment a module is disabled", async () => {
    const host = makeHost();
    await host.start();
    await host.setEnabled("child", false);
    await expect(host.invoke("child", "ping", [])).rejects.toThrow(/disabled/);
  });
});

describe("agent assets follow enablement", () => {
  it("installs on enable and removes on disable", async () => {
    const host = makeHost();
    await host.start();
    expect(existsSync(join(piDir, "skills", "sk"))).toBe(false);
    await host.setEnabled("assets", true);
    expect(existsSync(join(piDir, "skills", "sk", "SKILL.md"))).toBe(true);
    expect(JSON.parse(readFileSync(join(dataDir, MODULES_FILE), "utf8")).installedAssets.assets.skills).toHaveLength(1);
    await host.setEnabled("assets", false);
    expect(existsSync(join(piDir, "skills", "sk"))).toBe(false);
  });

  it("reports a notice instead of deleting a skill the user edited", async () => {
    const host = makeHost();
    await host.start();
    await host.setEnabled("assets", true);
    writeFileSync(join(piDir, "skills", "sk", "SKILL.md"), "# edited\n");
    const res = await host.setEnabled("assets", false);
    expect(res.notices.join(" ")).toMatch(/edited/);
    expect(existsSync(join(piDir, "skills", "sk", "SKILL.md"))).toBe(true);
  });

  it("start() removes assets left behind by a module that is no longer enabled", async () => {
    const first = makeHost();
    await first.start();
    await first.setEnabled("assets", true);
    const state = JSON.parse(readFileSync(join(dataDir, MODULES_FILE), "utf8"));
    state.enabled = state.enabled.filter((x: string) => x !== "assets"); // e.g. edited by hand / downgrade
    writeFileSync(join(dataDir, MODULES_FILE), JSON.stringify(state));
    const second = makeHost();
    await second.start();
    expect(existsSync(join(piDir, "skills", "sk"))).toBe(false);
  });
});

describe("onboarding flag", () => {
  it("markOnboarded persists", () => {
    const host = makeHost();
    expect(host.snapshot().onboarded).toBe(false);
    host.markOnboarded();
    expect(makeHost().snapshot().onboarded).toBe(true);
  });
});

describe("invalid graphs", () => {
  it("drops modules that require something unknown instead of refusing to boot", async () => {
    const error = vi.fn();
    const host = new MainModuleHost({
      manifests: [m("ok", "recommended"), m("orphan", "recommended", { requires: ["missing"] })],
      loaders: {},
      hiveDataDir: dataDir,
      piAgentDir: () => piDir,
      moduleRoot: (id) => join(moduleRoots, id),
      send: () => {},
      log: { ...quiet, error },
    });
    expect(host.snapshot().modules.map((x) => x.manifest.id)).toEqual(["ok"]);
    expect(error).toHaveBeenCalled();
  });
});
