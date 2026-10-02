import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ensureHiveDataDir,
  migrateCompactionPrefs,
  migrateUserDataDir,
  LEGACY_DATA_DIR_NAME,
  NEW_DATA_DIR_NAME,
  LEGACY_COMPACTION_FILE_NAME,
  NEW_COMPACTION_FILE_NAME,
  LEGACY_PRODUCT_NAME,
  NEW_PRODUCT_NAME,
} from "./migrate-legacy.ts";
import type { App } from "electron";

describe("migrate-legacy", () => {
  let tmpBase: string;

  beforeEach(() => {
    tmpBase = mkdtempSync(join(tmpdir(), "hive-migrate-test-"));
  });

  afterEach(() => {
    try {
      rmSync(tmpBase, { recursive: true, force: true });
    } catch {}
  });

  describe("ensureHiveDataDir", () => {
    it("copies legacy store directory contents when new directory is missing", () => {
      const legacyDir = join(tmpBase, LEGACY_DATA_DIR_NAME);
      mkdirSync(legacyDir, { recursive: true });
      writeFileSync(join(legacyDir, "projects.json"), JSON.stringify([{ id: "prj_1" }]), "utf8");
      writeFileSync(join(legacyDir, "usage-cache.json"), "{}", "utf8");

      const resolved = ensureHiveDataDir(tmpBase);
      expect(resolved).toBe(join(tmpBase, NEW_DATA_DIR_NAME));
      expect(existsSync(join(resolved, "projects.json"))).toBe(true);
      expect(readFileSync(join(resolved, "projects.json"), "utf8")).toContain("prj_1");
      expect(existsSync(join(resolved, "usage-cache.json"))).toBe(true);

      // Legacy directory remains in place
      expect(existsSync(legacyDir)).toBe(true);
    });

    it("does not overwrite new directory if it already exists", () => {
      const legacyDir = join(tmpBase, LEGACY_DATA_DIR_NAME);
      const newDir = join(tmpBase, NEW_DATA_DIR_NAME);
      mkdirSync(legacyDir, { recursive: true });
      mkdirSync(newDir, { recursive: true });

      writeFileSync(join(legacyDir, "projects.json"), JSON.stringify([{ id: "old" }]), "utf8");
      writeFileSync(join(newDir, "projects.json"), JSON.stringify([{ id: "new" }]), "utf8");

      const resolved = ensureHiveDataDir(tmpBase);
      expect(resolved).toBe(newDir);
      expect(readFileSync(join(resolved, "projects.json"), "utf8")).toContain("new");
    });

    it("returns new directory path when legacy directory does not exist", () => {
      const resolved = ensureHiveDataDir(tmpBase);
      expect(resolved).toBe(join(tmpBase, NEW_DATA_DIR_NAME));
    });
  });

  describe("migrateCompactionPrefs", () => {
    it("copies legacy compaction file when new file is missing", () => {
      const target = join(tmpBase, NEW_COMPACTION_FILE_NAME);
      const legacy = join(tmpBase, LEGACY_COMPACTION_FILE_NAME);
      writeFileSync(legacy, JSON.stringify({ triggerPercent: 80, keepRecentPercent: 40 }), "utf8");

      migrateCompactionPrefs(target);
      expect(existsSync(target)).toBe(true);
      expect(JSON.parse(readFileSync(target, "utf8"))).toEqual({ triggerPercent: 80, keepRecentPercent: 40 });
      expect(existsSync(legacy)).toBe(true);
    });

    it("does not overwrite existing target file", () => {
      const target = join(tmpBase, NEW_COMPACTION_FILE_NAME);
      const legacy = join(tmpBase, LEGACY_COMPACTION_FILE_NAME);
      writeFileSync(legacy, JSON.stringify({ triggerPercent: 50 }), "utf8");
      writeFileSync(target, JSON.stringify({ triggerPercent: 90 }), "utf8");

      migrateCompactionPrefs(target);
      expect(JSON.parse(readFileSync(target, "utf8"))).toEqual({ triggerPercent: 90 });
    });
  });

  describe("migrateUserDataDir", () => {
    it("copies legacy product directory to new product directory under appData", () => {
      const oldDir = join(tmpBase, LEGACY_PRODUCT_NAME);
      const newDir = join(tmpBase, NEW_PRODUCT_NAME);
      mkdirSync(oldDir, { recursive: true });
      writeFileSync(join(oldDir, "test.txt"), "hello", "utf8");

      const fakeApp = {
        isPackaged: true,
        getPath: (name: string) => {
          if (name === "appData") return tmpBase;
          if (name === "userData") return newDir;
          return tmpBase;
        },
      } as unknown as App;

      migrateUserDataDir(fakeApp);
      expect(existsSync(join(newDir, "test.txt"))).toBe(true);
      expect(readFileSync(join(newDir, "test.txt"), "utf8")).toBe("hello");
      expect(existsSync(join(oldDir, "test.txt"))).toBe(true);
    });

    it("skips migration when HIVE_USER_DATA or PI_STUDIO_USER_DATA is set", () => {
      const oldDir = join(tmpBase, LEGACY_PRODUCT_NAME);
      const newDir = join(tmpBase, NEW_PRODUCT_NAME);
      mkdirSync(oldDir, { recursive: true });
      writeFileSync(join(oldDir, "test.txt"), "hello", "utf8");

      const fakeApp = {
        isPackaged: true,
        getPath: () => tmpBase,
      } as unknown as App;

      process.env.HIVE_USER_DATA = "/custom/path";
      try {
        migrateUserDataDir(fakeApp);
        expect(existsSync(newDir)).toBe(false);
      } finally {
        delete process.env.HIVE_USER_DATA;
      }
    });
  });
});
