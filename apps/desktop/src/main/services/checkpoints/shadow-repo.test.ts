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

    await repo.snapshot("after"); // agent turn settles: new file captured
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

  it("rewind keeps never-snapshotted files but deletes snapshotted new files", async () => {
    writeFileSync(join(testCwd, "a.txt"), "a", "utf8");
    const base = await repo.snapshot("base");
    // user-owned big/binary files never captured
    writeFileSync(join(testCwd, "demo.mp4"), "video", "utf8");
    writeFileSync(join(testCwd, "new.txt"), "new", "utf8");
    await repo.snapshot("later");
    const plan = await repo.planRestore(base.tree);
    expect(plan.filesToDelete).toContain("new.txt");
    expect(plan.filesToDelete).not.toContain("demo.mp4");
    expect(plan.filesKept).toContain("demo.mp4");
    const res = await repo.restore(base.tree);
    expect(existsSync(join(testCwd, "demo.mp4"))).toBe(true);
    expect(existsSync(join(testCwd, "new.txt"))).toBe(false);
    expect(res.deleted).toContain("new.txt");
  });

  it("keeps files over the size cap even if untracked by shadow", async () => {
    const small = new ShadowRepo({ cwd: testCwd, storageDir: testStorage, maxFileSizeBytes: 10 });
    writeFileSync(join(testCwd, "a.txt"), "a", "utf8");
    const base = await small.snapshot("base");
    writeFileSync(join(testCwd, "data.csv"), "x".repeat(100), "utf8");
    await small.snapshot("later");
    const plan = await small.planRestore(base.tree);
    expect(plan.filesToDelete).not.toContain("data.csv");
  });
});
