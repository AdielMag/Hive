import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { locatePi } from "../src/node/locator.ts";

/** Lay out a fake Pi package under `modulesParent/node_modules/@earendil-works/pi-coding-agent`. */
function fakePi(modulesParent: string, version = "0.90.0"): string {
  const root = join(modulesParent, "node_modules", "@earendil-works", "pi-coding-agent");
  mkdirSync(join(root, "dist", "bundle"), { recursive: true });
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "@earendil-works/pi-coding-agent", version }));
  writeFileSync(join(root, "dist", "bundle", "cli.js"), "");
  return root;
}

function fakeNode(dir: string, platform: NodeJS.Platform): string {
  mkdirSync(dir, { recursive: true });
  const p = join(dir, platform === "win32" ? "node.exe" : "node");
  writeFileSync(p, "");
  return p;
}

const newNode = () => "v22.20.0";

describe("Pi locator", () => {
  it("locates installed Pi on this machine or reports an informative error if absent in CI", () => {
    const result = locatePi();
    if (result.ok) {
      expect(result.info.version).toMatch(/^0\.\d+\.\d+/);
      expect(result.info.cliPath).toContain("cli.js");
      expect(result.info.nodePath).toContain("node");
    } else {
      expect(typeof result.error).toBe("string");
    }
  });

  // Regression: GUI apps launched from Finder/Dock get a PATH without nvm, so Pi must be found anyway.
  it("finds an nvm install with an empty PATH (POSIX)", () => {
    const home = mkdtempSync(join(tmpdir(), "pi-loc-"));
    const prefix = join(home, ".nvm", "versions", "node", "v22.20.0");
    fakePi(join(prefix, "lib"));
    const node = fakeNode(join(prefix, "bin"), "linux");
    const r = locatePi({ env: { PATH: "" }, platform: "linux", homedir: home, nodeVersion: newNode });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.info.source).toBe("known-location");
      expect(r.info.nodePath).toBe(node);
      expect(r.info.version).toBe("0.90.0");
    }
  });

  it("honours a custom npm prefix from ~/.npmrc", () => {
    const home = mkdtempSync(join(tmpdir(), "pi-loc-"));
    const prefix = join(home, "tools", "npm-global");
    fakePi(join(prefix, "lib"));
    fakeNode(join(home, "somewhere", "bin"), "linux");
    writeFileSync(join(home, ".npmrc"), "registry=https://registry.npmjs.org/\nprefix=~/tools/npm-global\n");
    const r = locatePi({ env: { PATH: join(home, "somewhere", "bin") }, platform: "linux", homedir: home, nodeVersion: newNode });
    expect(r.ok && r.info.packageRoot.startsWith(prefix)).toBe(true);
  });

  it("finds the Windows installer layout and its bundled node", () => {
    const home = mkdtempSync(join(tmpdir(), "pi-loc-"));
    const local = join(home, "AppData", "Local");
    const current = join(local, "pi-node", "current");
    fakePi(current);
    const node = fakeNode(current, "win32");
    const r = locatePi({ env: { Path: "", LOCALAPPDATA: local }, platform: "win32", homedir: home, nodeVersion: newNode });
    expect(r.ok && r.info.nodePath).toBe(node);
  });

  it("uses a location picked in the app (launcher file, cli.js or folder)", () => {
    const home = mkdtempSync(join(tmpdir(), "pi-loc-"));
    const install = join(home, "odd place");
    const root = fakePi(install);
    fakeNode(install, "win32");
    writeFileSync(join(install, "pi.cmd"), "");
    for (const picked of [join(install, "pi.cmd"), join(root, "dist", "bundle", "cli.js"), install]) {
      const r = locatePi({ env: { Path: "" }, platform: "win32", homedir: home, configuredPath: picked, nodeVersion: newNode });
      expect(r.ok && r.info.packageRoot).toBe(root);
    }
  });

  it("says Node is the problem (not Pi) when only an old node exists", () => {
    const home = mkdtempSync(join(tmpdir(), "pi-loc-"));
    const prefix = join(home, ".npm-global");
    fakePi(join(prefix, "lib"));
    fakeNode(join(prefix, "bin"), "linux");
    const r = locatePi({ env: { PATH: "" }, platform: "linux", homedir: home, nodeVersion: () => "v18.0.0" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Pi was found.*Node\.js 22\.19/);
  });

  it("uses HIVE_PI_CLI when set, or falls back to PI_STUDIO_PI_CLI", () => {
    const home = mkdtempSync(join(tmpdir(), "pi-loc-"));
    const install1 = join(home, "hive-pi");
    const root1 = fakePi(install1);
    fakeNode(install1, "win32");

    const install2 = join(home, "studio-pi");
    const root2 = fakePi(install2);
    fakeNode(install2, "win32");

    // HIVE_PI_CLI takes precedence
    const r1 = locatePi({ env: { Path: "", HIVE_PI_CLI: root1, PI_STUDIO_PI_CLI: root2 }, platform: "win32", homedir: home, nodeVersion: newNode });
    expect(r1.ok && r1.info.packageRoot).toBe(root1);

    // Fallback to PI_STUDIO_PI_CLI if HIVE_PI_CLI is absent
    const r2 = locatePi({ env: { Path: "", PI_STUDIO_PI_CLI: root2 }, platform: "win32", homedir: home, nodeVersion: newNode });
    expect(r2.ok && r2.info.packageRoot).toBe(root2);
  });

  it("uses HIVE_NODE when set, or falls back to PI_STUDIO_NODE", () => {
    const home = mkdtempSync(join(tmpdir(), "pi-loc-"));
    const install = join(home, "pi");
    fakePi(install);
    const node1 = fakeNode(join(home, "hive-node-bin"), "win32");
    const node2 = fakeNode(join(home, "studio-node-bin"), "win32");

    const r1 = locatePi({
      env: { Path: "", HIVE_PI_CLI: install, HIVE_NODE: node1, PI_STUDIO_NODE: node2 },
      platform: "win32",
      homedir: home,
      nodeVersion: newNode,
    });
    expect(r1.ok && r1.info.nodePath).toBe(node1);

    const r2 = locatePi({
      env: { Path: "", HIVE_PI_CLI: install, PI_STUDIO_NODE: node2 },
      platform: "win32",
      homedir: home,
      nodeVersion: newNode,
    });
    expect(r2.ok && r2.info.nodePath).toBe(node2);
  });

  it("reports not-found with guidance when nothing is installed", () => {
    const home = mkdtempSync(join(tmpdir(), "pi-loc-"));
    const r = locatePi({ env: { PATH: "" }, platform: "linux", homedir: home, nodeVersion: newNode });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Check again/);
  });
});
