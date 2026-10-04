import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs script without type declarations
import { outputs, renderMain, renderRenderer, scanModules } from "./gen-modules.mjs";

let root: string;
const put = (rel: string, content: string) => {
  const full = join(root, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
};
const pkg = (id: string, hive: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ name: `@hive-module/${id}`, exports: { "./main": "./src/main.ts", "./renderer": "./src/renderer.tsx" }, hive: { id, title: id, description: id, tier: "bonus", ...hive }, ...extra });

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "hive-gen-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("scanModules", () => {
  it("returns [] when there is no modules/ directory", () => {
    expect(scanModules(root)).toEqual([]);
  });

  it("reads manifests in folder order and detects which halves exist", () => {
    put("modules/zeta/package.json", pkg("zeta", {}));
    put("modules/zeta/src/main.ts", "");
    put("modules/alpha/package.json", pkg("alpha", {}));
    put("modules/alpha/src/renderer.tsx", "");
    const mods = scanModules(root);
    expect(mods.map((m: { id: string }) => m.id)).toEqual(["alpha", "zeta"]);
    expect(mods[0]).toMatchObject({ hasMain: false, hasRenderer: true });
    expect(mods[1]).toMatchObject({ hasMain: true, hasRenderer: false });
  });

  it("reports every problem at once", () => {
    put("modules/one/package.json", pkg("one", { tier: "weird" }));
    put("modules/two/package.json", pkg("not-two", {}));
    put("modules/three/package.json", pkg("three", { requires: ["ghost"] }));
    expect(() => scanModules(root)).toThrowError(/tier must be one of[\s\S]*hive\.id must equal[\s\S]*unknown module "ghost"/);
  });

  it("rejects two modules claiming the same tab kind", () => {
    put("modules/a/package.json", pkg("a", { contributes: { tabKinds: ["plan"] } }));
    put("modules/b/package.json", pkg("b", { contributes: { tabKinds: ["plan"] } }));
    expect(() => scanModules(root)).toThrowError(/already declared by a/);
  });
});

describe("render", () => {
  const mods = [
    { id: "a", title: "A", description: "a", tier: "bonus", hasMain: true, hasRenderer: true },
    { id: "b", title: "B", description: "b", tier: "bonus", hasMain: false, hasRenderer: true },
  ];

  it("emits lazy loaders only for halves that exist, keeping all manifests", () => {
    const main = renderMain(mods);
    const renderer = renderRenderer(mods);
    expect(main).toContain('"a": () => import("@hive-module/a/main")');
    expect(main).not.toContain("@hive-module/b/main");
    expect(renderer).toContain('"b": () => import("@hive-module/b/renderer")');
    expect(main).toContain('"id": "b"'); // manifest index lists every module
  });

  it("is deterministic and marked as generated", () => {
    expect(renderMain(mods)).toBe(renderMain(mods));
    expect(renderMain(mods)).toMatch(/^\/\/ AUTO-GENERATED/);
  });

  it("emits an empty loader table with no modules", () => {
    expect(renderMain([])).toContain("_MODULE_LOADERS: Readonly<Record<string, () => Promise<{ default: MainModule }>>> = {\n};");
  });
});

describe("outputs", () => {
  it("targets the main and renderer generated files", () => {
    put("modules/a/package.json", pkg("a", {}));
    const files = outputs(root).map(([f]: [string]) => f.split("\\").join("/"));
    expect(files[0]).toMatch(/apps\/desktop\/src\/main\/modules\.generated\.ts$/);
    expect(files[1]).toMatch(/apps\/desktop\/src\/renderer\/modules\.generated\.ts$/);
  });
});
