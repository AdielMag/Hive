export const LEGACY_KEY_PREFIX = "pi-studio.";
export const NEW_KEY_PREFIX = "hive.";

/**
 * Derives the legacy key for a given Hive key, e.g.:
 *   "hive.layout.v1" -> "pi-studio.layout.v1"
 *   "hive:tools-panel:collapsed" -> "pi-studio:tools-panel:collapsed"
 */
export function getLegacyStorageKey(key: string): string {
  if (key.startsWith("hive.")) {
    return `pi-studio.${key.slice("hive.".length)}`;
  }
  if (key.startsWith("hive:")) {
    return `pi-studio:${key.slice("hive:".length)}`;
  }
  return key;
}

/**
 * Reads a value from localStorage. If the new key is missing, checks the legacy key;
 * if found under legacy, copies it to the new key and returns it.
 */
export function getStoredItem(key: string, legacyKey?: string): string | null {
  try {
    const current = localStorage.getItem(key);
    if (current !== null) return current;

    const fallbackKey = legacyKey ?? getLegacyStorageKey(key);
    if (fallbackKey !== key) {
      const legacyValue = localStorage.getItem(fallbackKey);
      if (legacyValue !== null) {
        localStorage.setItem(key, legacyValue);
        return legacyValue;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Writes a value to localStorage under the given key.
 */
export function setStoredItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore quota/security errors
  }
}
