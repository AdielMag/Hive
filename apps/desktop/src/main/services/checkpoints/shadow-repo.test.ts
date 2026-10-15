import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ShadowRepo } from "./shadow-repo.ts";

describe("ShadowRepo", () => {
  let testCwd: string;
  let testStorage: string;
  let repo: ShadowRepo;

  beforeEach(() => {
    const id = Math.random().toString(36).slice(2);
    testCwd = join(tmpdir(), `hive-test-cwd-${id}`);
    testStorage = join(tmpdir(), `hive-test-storage-${id}`);
    mkdirSync(testCwd, { recursive: true });
    mkdirSync(testStorage, { recursive: true });

    repo = new ShadowRepo({
      cwd: testCwd,
      storageDir: testStorage,
    });
  });

  afterEach(() => {
    try { rmSync(testCwd, { recursive: true, force: true }); } catch {}
    try { rmSync(testStorage, { recursive: true, force: true }); } catch {}
  });

  it("checks git availability", async () => {
    const avail = await ShadowRepo.isGitAvailable();
    expect(avail).toBe(true);
  });

  it("takes snapshots and computes diffs", async () => {
    // 1. Initial snapshot with one file
    writeFileSync(join(testCwd, "hello.txt"), "first version\n", "utf8");
    const snap1 = await repo.snapshot("turn 1");
    expect(snap1.tree).toBeDefined();
    expect(snap1.fileCount).toBe(1);
    expect(snap1.partial).toBe(false);

    // 2. Modify file and add another
    writeFileSync(join(testCwd, "hello.txt"), "second version\n", "utf8");
    writeFileSync(join(testCwd, "new.txt"), "new file\n", "utf8");
    const snap2 = await repo.snapshot("turn 2");
    expect(snap2.fileCount).toBe(2);

    // 3. Changed files between snap1 and snap2
    const diffs = await repo.changedFiles(snap1.tree, snap2.tree);
    expect(diffs).toEqual([
      { path: "hello.txt", status: "modified" },
      { path: "new.txt", status: "added" },
    ]);

    // 4. Unified diff content
    const diffText = await repo.diffText(snap1.tree, snap2.tree, "hello.txt");
    expect(diffText).toContain("-first version");
    expect(diffText).toContain("+second version");
  });

  it("restores files and deletes newly created files on undo", async () => {
    writeFileSync(join(testCwd, "main.ts"), "const a = 1;\n", "utf8");
    const snapBefore = await repo.snapshot("before");

    // Agent changes: edits main.ts and creates generated.ts
    writeFileSync(join(testCwd, "main.ts"), "const a = 2;\n", "utf8");
    writeFileSync(join(testCwd, "generated.ts"), "export const b = 2;\n", "utf8");

    // Undo: restore back to snapBefore tree
    const res = await repo.restore(snapBefore.tree);
    expect(res.restored).toContain("main.ts");
    expect(res.deleted).toContain("generated.ts");
    expect(res.errors).toHaveLength(0);

    // Disk contents verified
    expect(readFileSync(join(testCwd, "main.ts"), "utf8")).toBe("const a = 1;\n");
    expect(existsSync(join(testCwd, "generated.ts"))).toBe(false);
  });

  it("skips excluded node_modules and large binaries", async () => {
    // node_modules directory
    const nm = join(testCwd, "node_modules");
    mkdirSync(nm, { recursive: true });
    writeFileSync(join(nm, "dep.js"), "module.exports = {};", "utf8");

    // regular file
    writeFileSync(join(testCwd, "index.ts"), "console.log(1);", "utf8");

    // large dummy zip
    writeFileSync(join(testCwd, "bundle.zip"), "dummy binary", "utf8");

    const snap = await repo.snapshot("check ignores");
    expect(snap.fileCount).toBe(1); // only index.ts counted
    expect(snap.partial).toBe(true); // skipped bundle.zip
    expect(snap.skippedFiles).toContain("bundle.zip");
  });
});
