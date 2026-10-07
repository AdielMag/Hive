export type PlatformType = "mac" | "windows" | "linux" | "other";

/**
 * Returns the current OS platform: "mac", "windows", "linux", or "other".
 */
export function getPlatform(): PlatformType {
  const p = typeof document !== "undefined" ? document.documentElement.dataset.platform : "";
  if (p === "darwin") return "mac";
  if (p === "win32") return "windows";
  if (p === "linux") return "linux";

  if (typeof navigator !== "undefined") {
    const navPlat = navigator.platform || "";
    const navUa = navigator.userAgent || "";
    if (/Mac|iPhone|iPod|iPad/i.test(navPlat) || /Macintosh/i.test(navUa)) return "mac";
    if (/Win/i.test(navPlat) || /Windows/i.test(navUa)) return "windows";
    if (/Linux/i.test(navPlat) || /Linux/i.test(navUa)) return "linux";
  }

  if (typeof process !== "undefined" && process.platform) {
    if (process.platform === "darwin") return "mac";
    if (process.platform === "win32") return "windows";
    if (process.platform === "linux") return "linux";
  }

  return "other";
}

/**
 * Returns the OS-appropriate label for opening the OS file manager:
 * - "Open in Finder" on macOS
 * - "Open in File Explorer" on Windows
 * - "Open in File Manager" on Linux / other
 */
export function getFileManagerLabel(): string {
  const plat = getPlatform();
  if (plat === "mac") return "Open in Finder";
  if (plat === "windows") return "Open in File Explorer";
  return "Open in File Manager";
}
