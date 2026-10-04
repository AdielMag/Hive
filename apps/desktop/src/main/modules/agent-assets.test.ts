import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ModuleManifest } from "@hive/module-sdk";
import { MARKER_FILE, installAgentAssets, removeAgentAssets, removeManagedBlock, upsertManagedBlock } from "./agent-assets.ts";

let tmp: string;
let piDir: string;
let binDir: string;
let moduleRoot: string;

const manifest: ModuleManifest = {
  id: "demo",
  title: "Demo",
  description: "demo",
  tier: "bonus",
  agent: {
    skills: ["agent/skills/*"],
    agentsMd: "agent/AGENTS.block.md",
    bin: { demo: "bin/demo.js" },
    extensions: ["agent/extensions/demo-guard.ts"],
  },
};

const opts = () => ({ piAgentDir: piDir, binDir, platform: "linux" as const });

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "hive-assets-"));
  piDir = join(tmp, "pi");
  binDir = join(tmp, "bin");
  moduleRoot = join(tmp, "modules", "demo");
  mkdirSync(join(moduleRoot, "agent", "skills", "alpha"), { recursive: true });
  mkdirSync(join(moduleRoot, "agent", "skills", "beta"), { recursive: true });
  mkdirSync(join(moduleRoot, "bin"), { recursive: true });
  mkdirSync(join(moduleRoot, "agent", "extensions"), { recursive: true });
  writeFileSync(join(moduleRoot, "agent", "skills", "alpha", "SKILL.md"), "# alpha\n");
  writeFileSync(join(moduleRoot, "agent", "skills", "beta", "SKILL.md"), "# beta\n");
  writeFileSync(join(moduleRoot, "agent", "AGENTS.block.md"), "Use the demo tool.\n");
  writeFileSync(join(moduleRoot, "bin", "demo.js"), "console.log('demo')\n");
  writeFileSync(join(moduleRoot, "agent", "extensions", "demo-guard.ts"), "export default function () {}\n");
});

afterEach(() => rmSync(tmp, { recursive: true, force: true }));

describe("managed AGENTS.md blocks", () => {
  it("appends a block, then updates it in place without duplicating", () => {
    const once = upsertManagedBlock("# Mine\n", "demo", "v1");
    expect(once).toContain("<!-- BEGIN demo managed block -->");
    expect(once).toContain("<!-- END demo managed block -->");
    const twice = upsertManagedBlock(once, "demo", "v2");
    expect(twice.match(/BEGIN demo managed block/g)).toHaveLength(1);
    expect(twice).toContain("v2");
    expect(twice).not.toContain("v1");
    expect(twice.startsWith("# Mine")).toBe(true);
  });

  it("removes only its own block", () => {
    let text = upsertManagedBlock("", "a", "block a");
    text = upsertManagedBlock(text, "b", "block b");
    const out = removeManagedBlock(text, "a");
    expect(out).not.toContain("block a");
    expect(out).toContain("block b");
  });
});

describe("installAgentAssets", () => {
  it("installs skills, the AGENTS.md block and the CLI shim", () => {
    const { record, notices } = installAgentAssets(manifest, moduleRoot, opts());
    expect(notices).toEqual([]);
    expect(readFileSync(join(piDir, "skills", "alpha", "SKILL.md"), "utf8")).toBe("# alpha\n");
    expect(existsSync(join(piDir, "skills", "beta", MARKER_FILE))).toBe(true);
    expect(readFileSync(join(piDir, "AGENTS.md"), "utf8")).toContain("Use the demo tool.");
    expect(existsSync(join(binDir, "demo"))).toBe(true);
    expect(existsSync(join(piDir, "extensions", "demo-guard.ts"))).toBe(true);
    expect(existsSync(join(piDir, "extensions", ".demo-guard.ts.hive-managed"))).toBe(true);
    expect(record.skills?.map((s) => s.name).sort()).toEqual(["alpha", "beta"]);
    expect(record.extensions?.map((e) => e.name)).toEqual(["demo-guard.ts"]);
  });

  it("is idempotent", () => {
    const first = installAgentAssets(manifest, moduleRoot, opts());
    const agents = readFileSync(join(piDir, "AGENTS.md"), "utf8");
    const second = installAgentAssets(manifest, moduleRoot, opts(), first.record);
    expect(second.notices).toEqual([]);
    expect(readFileSync(join(piDir, "AGENTS.md"), "utf8")).toBe(agents);
    expect(second.record.skills).toHaveLength(2);
  });

  it("updates a pre-existing managed block in place instead of duplicating it", () => {
    mkdirSync(piDir, { recursive: true });
    writeFileSync(join(piDir, "AGENTS.md"), "# Mine\n\n<!-- BEGIN demo managed block -->\nold text\n<!-- END demo managed block -->\n\nTail\n");
    installAgentAssets(manifest, moduleRoot, opts());
    const text = readFileSync(join(piDir, "AGENTS.md"), "utf8");
    expect(text.match(/BEGIN demo managed block/g)).toHaveLength(1);
    expect(text).toContain("Use the demo tool.");
    expect(text).not.toContain("old text");
    expect(text).toContain("# Mine");
    expect(text).toContain("Tail");
  });

  it("adopts an identical hand-installed skill but leaves a different one alone", () => {
    mkdirSync(join(piDir, "skills", "alpha"), { recursive: true });
    writeFileSync(join(piDir, "skills", "alpha", "SKILL.md"), "# alpha\n"); // identical
    mkdirSync(join(piDir, "skills", "beta"), { recursive: true });
    writeFileSync(join(piDir, "skills", "beta", "SKILL.md"), "# my own beta\n"); // different
    const { record, notices } = installAgentAssets(manifest, moduleRoot, opts());
    expect(existsSync(join(piDir, "skills", "alpha", MARKER_FILE))).toBe(true);
    expect(readFileSync(join(piDir, "skills", "beta", "SKILL.md"), "utf8")).toBe("# my own beta\n");
    expect(notices.some((n) => n.includes('"beta"'))).toBe(true);
    expect(record.skills?.map((s) => s.name)).toEqual(["alpha"]);
  });
});

describe("removeAgentAssets", () => {
  it("removes exactly what was installed", () => {
    mkdirSync(piDir, { recursive: true });
    writeFileSync(join(piDir, "AGENTS.md"), "# Mine\n");
    mkdirSync(join(piDir, "skills", "unrelated"), { recursive: true });
    const { record } = installAgentAssets(manifest, moduleRoot, opts());
    expect(removeAgentAssets("demo", record)).toEqual([]);
    expect(existsSync(join(piDir, "skills", "alpha"))).toBe(false);
    expect(existsSync(join(piDir, "skills", "beta"))).toBe(false);
    expect(existsSync(join(piDir, "skills", "unrelated"))).toBe(true);
    expect(existsSync(join(binDir, "demo"))).toBe(false);
    expect(existsSync(join(piDir, "extensions", "demo-guard.ts"))).toBe(false);
    expect(existsSync(join(piDir, "extensions", ".demo-guard.ts.hive-managed"))).toBe(false);
    const agents = readFileSync(join(piDir, "AGENTS.md"), "utf8");
    expect(agents).toContain("# Mine");
    expect(agents).not.toContain("demo managed block");
  });

  it("keeps a skill the user edited after install, with a notice", () => {
    const { record } = installAgentAssets(manifest, moduleRoot, opts());
    writeFileSync(join(piDir, "skills", "alpha", "SKILL.md"), "# alpha, tweaked by me\n");
    const notices = removeAgentAssets("demo", record);
    expect(existsSync(join(piDir, "skills", "alpha", "SKILL.md"))).toBe(true);
    expect(existsSync(join(piDir, "skills", "beta"))).toBe(false);
    expect(notices.some((n) => n.includes('"alpha"'))).toBe(true);
  });

  it("is a no-op without a record", () => {
    expect(removeAgentAssets("demo", undefined)).toEqual([]);
  });
});
