import { existsSync, cpSync, copyFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import type { App } from "electron";

export const LEGACY_PRODUCT_NAME = "Pi Studio";
export const NEW_PRODUCT_NAME = "Hive";

export const LEGACY_DATA_DIR_NAME = "pi-studio";
export const NEW_DATA_DIR_NAME = "hive";

export const LEGACY_COMPACTION_FILE_NAME = "pi-studio-compaction.json";
export const NEW_COMPACTION_FILE_NAME = "hive-compaction.json";

/**
 * Migrates the Electron userData directory from "Pi Studio" to "Hive"
 * if the old directory exists and the new one does not yet exist.
 * Leaves the old directory in place. Never crashes.
 */
export function migrateUserDataDir(app: App): void {
  try {
    if (process.env.HIVE_USER_DATA || process.env.PI_STUDIO_USER_DATA) {
      return;
    }
    const appData = app.getPath("appData");
    const oldDir = join(appData, LEGACY_PRODUCT_NAME);
    const newDir = join(appData, NEW_PRODUCT_NAME);

    if (!existsSync(newDir) && existsSync(oldDir)) {
      cpSync(oldDir, newDir, { recursive: true });
    }

    // Dev case: Electron in dev mode uses package name for userData (e.g. @hive/desktop)
    if (!app.isPackaged) {
      const current = app.getPath("userData");
      const oldDevScope = join(appData, "@pi-studio", "desktop");
      const oldDevFlat = join(appData, "@pi-studio-desktop");
      if (!existsSync(current)) {
        if (existsSync(oldDevScope)) {
          cpSync(oldDevScope, current, { recursive: true });
        } else if (existsSync(oldDevFlat)) {
          cpSync(oldDevFlat, current, { recursive: true });
        }
      }
    }
  } catch (err) {
    console.error("Failed to migrate legacy userData directory:", err);
  }
}

/**
 * Ensures the Hive store directory (`<userData>/hive`) exists and has data migrated
 * from the legacy `<userData>/pi-studio` directory if needed.
 * Returns the resolved Hive store directory path.
 */
export function ensureHiveDataDir(userData: string): string {
  const newDir = join(userData, NEW_DATA_DIR_NAME);
  const oldDir = join(userData, LEGACY_DATA_DIR_NAME);

  try {
    if (!existsSync(newDir) && existsSync(oldDir)) {
      cpSync(oldDir, newDir, { recursive: true });
    } else if (existsSync(oldDir)) {
      // v0.8.0 copied the dir once but kept writing some files (projects, ui-state, pi-location…) to the
      // legacy dir. Bring over any top-level file that is missing here or newer in the legacy dir. Nothing
      // writes to the legacy dir anymore, so this converges after one launch.
      for (const entry of readdirSync(oldDir, { withFileTypes: true })) {
        if (!entry.isFile()) continue;
        const from = join(oldDir, entry.name);
        const to = join(newDir, entry.name);
        try {
          if (!existsSync(to) || statSync(from).mtimeMs > statSync(to).mtimeMs) copyFileSync(from, to);
        } catch (err) {
          console.error(`Failed to migrate legacy file ${entry.name}:`, err);
        }
      }
    }
  } catch (err) {
    console.error("Failed to migrate legacy store directory:", err);
  }

  return newDir;
}

/**
 * Migrates compaction preferences from `pi-studio-compaction.json` to `hive-compaction.json`
 * in the same directory if the target file is missing.
 */
export function migrateCompactionPrefs(targetPath: string): void {
  try {
    if (!existsSync(targetPath)) {
      const legacyPath = join(dirname(targetPath), LEGACY_COMPACTION_FILE_NAME);
      if (existsSync(legacyPath)) {
        copyFileSync(legacyPath, targetPath);
      }
    }
  } catch (err) {
    console.error("Failed to migrate legacy compaction preferences:", err);
  }
}
