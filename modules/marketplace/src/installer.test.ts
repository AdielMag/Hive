import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isInstallableSource, readInstalledSources } from "./installer.ts";
import { normalizeSource } from "./shared.ts";

describe("normalizeSource", () => {
  it("drops npm versions (incl. scoped) and git refs", () => {
    expect(normalizeSource("npm:pkg@1.2.3")).toBe("npm:pkg");
    expect(normalizeSource("npm:@scope/pkg@2.0.0")).toBe("npm:@scope/pkg");
    expect(normalizeSource("npm:@scope/pkg")).toBe("npm:@scope/pkg");
    expect(normalizeSource("git:https://x.test/r.git#main")).toBe("git:https://x.test/r.git");
  });
});

describe("isInstallableSource", () => {
  it("accepts npm/git sources and rejects registry names and flag-like input", () => {
    expect(isInstallableSource("npm:pi-foo")).toBe(true);
    expect(isInstallableSource("git:https://x.test/r.git")).toBe(true);
    expect(isInstallableSource("io.github.someone/server")).toBe(false);
    expect(isInstallableSource("npm:-g")).toBe(false);
    expect(isInstallableSource("")).toBe(false);
  });
});

describe("readInstalledSources", () => {
  it("reads configured package sources from settings.json", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mp-"));
    writeFileSync(
      join(dir, "settings.json"),
      JSON.stringify({ packages: ["npm:a@1.0.0", { source: "npm:@s/b", filter: [] }] }),
    );
    expect(await readInstalledSources(dir)).toEqual(["npm:a", "npm:@s/b"]);
  });

  it("returns [] when settings are missing or malformed", async () => {
    const empty = mkdtempSync(join(tmpdir(), "mp-"));
    expect(await readInstalledSources(empty)).toEqual([]);
    writeFileSync(join(empty, "settings.json"), "{not json");
    expect(await readInstalledSources(empty)).toEqual([]);
  });
});
