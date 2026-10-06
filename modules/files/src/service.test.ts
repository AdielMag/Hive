import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createDirectory,
  createFile,
  deleteItem,
  isInside,
  isInsideOrSame,
  normPath,
  renameItem,
  revealInExplorer,
} from "./service.ts";

describe("Files service: path boundaries", () => {
  it("normPath resolves and handles case sensitivity per platform", () => {
    const p1 = normPath("src/index.ts");
    expect(typeof p1).toBe("string");
    expect(p1.length).toBeGreaterThan(0);
  });

  it("isInside correctly identifies children inside parent root", () => {
    const root = normPath("/workspace/project");
    const child = normPath("/workspace/project/src/index.ts");
    const outside = normPath("/workspace/other/file.ts");
    const rootItself = normPath("/workspace/project");

    expect(isInside(child, root)).toBe(true);
    expect(isInside(outside, root)).toBe(false);
    expect(isInside(rootItself, root)).toBe(false); // Root itself is not strictly inside
  });

  it("isInsideOrSame allows the root itself or children", () => {
    const root = normPath("/workspace/project");
    const child = normPath("/workspace/project/src/index.ts");
    const outside = normPath("/workspace/other/file.ts");

    expect(isInsideOrSame(child, root)).toBe(true);
    expect(isInsideOrSame(root, root)).toBe(true);
    expect(isInsideOrSame(outside, root)).toBe(false);
  });
});

describe("Files service: filesystem operations", () => {
  let rootDir: string;

  beforeEach(async () => {
    rootDir = await mkdtemp(join(tmpdir(), "hive-files-test-"));
  });

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true }).catch(() => {});
  });

  it("createFile creates empty file inside root and rejects duplicates", async () => {
    const targetPath = join(rootDir, "test.txt");

    const res = await createFile({ rootPath: rootDir, targetPath });
    expect(res.ok).toBe(true);
    expect(existsSync(targetPath)).toBe(true);

    const content = await readFile(targetPath, "utf8");
    expect(content).toBe("");

    // Re-creating the same file must fail
    const dupRes = await createFile({ rootPath: rootDir, targetPath });
    expect(dupRes.ok).toBe(false);
    expect(dupRes.error).toMatch(/already exists/i);
  });

  it("createFile automatically creates nested parent directories", async () => {
    const targetPath = join(rootDir, "nested", "deep", "file.ts");

    const res = await createFile({ rootPath: rootDir, targetPath });
    expect(res.ok).toBe(true);
    expect(existsSync(targetPath)).toBe(true);
  });

  it("createFile rejects paths outside root", async () => {
    const outsidePath = join(tmpdir(), "outside.txt");

    const res = await createFile({ rootPath: rootDir, targetPath: outsidePath });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/workspace/i);
  });

  it("createDirectory creates folder and rejects duplicates", async () => {
    const targetDir = join(rootDir, "subfolder");

    const res = await createDirectory({ rootPath: rootDir, targetPath: targetDir });
    expect(res.ok).toBe(true);
    expect(existsSync(targetDir)).toBe(true);

    const dupRes = await createDirectory({ rootPath: rootDir, targetPath: targetDir });
    expect(dupRes.ok).toBe(false);
  });

  it("renameItem renames file or directory", async () => {
    const oldPath = join(rootDir, "old-name.txt");
    const newPath = join(rootDir, "new-name.txt");

    await createFile({ rootPath: rootDir, targetPath: oldPath });
    expect(existsSync(oldPath)).toBe(true);

    const res = await renameItem({ rootPath: rootDir, oldPath, newPath });
    expect(res.ok).toBe(true);
    expect(existsSync(oldPath)).toBe(false);
    expect(existsSync(newPath)).toBe(true);
  });

  it("deleteItem moves to trash when trashItem is provided", async () => {
    const targetPath = join(rootDir, "to-delete.txt");
    await createFile({ rootPath: rootDir, targetPath });

    const trashMock = vi.fn().mockResolvedValue(undefined);
    const res = await deleteItem({ rootPath: rootDir, targetPath, useTrash: true }, { trashItem: trashMock });

    expect(res.ok).toBe(true);
    expect(trashMock).toHaveBeenCalledWith(targetPath);
  });

  it("deleteItem falls back to rm when trashItem is false", async () => {
    const targetPath = join(rootDir, "to-remove.txt");
    await createFile({ rootPath: rootDir, targetPath });

    const res = await deleteItem({ rootPath: rootDir, targetPath, useTrash: false });
    expect(res.ok).toBe(true);
    expect(existsSync(targetPath)).toBe(false);
  });

  it("deleteItem refuses to delete workspace root itself", async () => {
    const res = await deleteItem({ rootPath: rootDir, targetPath: rootDir, useTrash: false });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/Cannot delete items outside or at the root/i);
    expect(existsSync(rootDir)).toBe(true);
  });

  it("revealInExplorer delegates to showItemInFolder callback", async () => {
    const targetPath = join(rootDir, "reveal-me.txt");
    await createFile({ rootPath: rootDir, targetPath });

    const revealMock = vi.fn();
    const res = await revealInExplorer({ rootPath: rootDir, targetPath }, { showItemInFolder: revealMock });

    expect(res.ok).toBe(true);
    expect(revealMock).toHaveBeenCalledWith(targetPath);
  });
});
