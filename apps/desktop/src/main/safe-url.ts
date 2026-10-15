/** URL allow-list for anything handed to the OS (`shell.openExternal`) or opened as a link. Electron-free so it's unit-testable. */
export function isSafeExternalUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" || u.protocol === "mailto:";
  } catch {
    return false;
  }
}
