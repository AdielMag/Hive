/**
 * Browser-safe path normalization and containment helpers for matching
 * skill directories and tool paths across platforms (Windows / POSIX).
 */

export interface PathContext {
  cwd: string;
  homeDir: string;
}

/**
 * Normalizes a path string:
 * - Expands `~` using `homeDir`
 * - Resolves relative paths against `cwd`
 * - Normalizes all directory separators to `/`
 * - Collapses consecutive slashes and `.` / `..` segments
 * - Lowercases Windows drive letters and paths for case-insensitive matching
 */
export function normPath(rawPath: string, ctx: PathContext): string {
  if (!rawPath || typeof rawPath !== "string") return "";

  let p = rawPath.trim();
  // Expand ~ or ~/
  if (p === "~" || p.startsWith("~/") || p.startsWith("~\\")) {
    p = ctx.homeDir + p.slice(1);
  }

  // Replace all backslashes with forward slashes
  p = p.replace(/\\/g, "/");

  // If path is relative, prefix with cwd
  const isWindowsAbsolute = /^[a-zA-Z]:\//.test(p);
  const isPosixAbsolute = p.startsWith("/");
  if (!isWindowsAbsolute && !isPosixAbsolute) {
    const cwd = ctx.cwd.replace(/\\/g, "/");
    p = `${cwd.replace(/\/+$/, "")}/${p}`;
  }

  // Collapse . and ..
  const isWin = /^[a-zA-Z]:\//.test(p);
  let prefix = "";
  let remainder = p;
  if (isWin) {
    prefix = p.slice(0, 3); // e.g. "C:/"
    remainder = p.slice(3);
  } else if (p.startsWith("/")) {
    prefix = "/";
    remainder = p.slice(1);
  }

  const segments = remainder.split("/").filter((seg) => seg.length > 0 && seg !== ".");
  const resolvedSegments: string[] = [];
  for (const seg of segments) {
    if (seg === "..") {
      if (resolvedSegments.length > 0) resolvedSegments.pop();
    } else {
      resolvedSegments.push(seg);
    }
  }

  let result = prefix + resolvedSegments.join("/");
  // Strip trailing slash unless root
  if (result.length > 3 && result.endsWith("/")) {
    result = result.slice(0, -1);
  }

  // If Windows path, lowercase drive and full path for case-insensitive comparison
  if (isWin) {
    result = result.toLowerCase();
  }

  return result;
}

/**
 * Returns true if `targetPath` is within (or equal to) `baseDir`.
 */
export function isUnder(targetPath: string, baseDir: string): boolean {
  if (!targetPath || !baseDir) return false;
  const target = targetPath.replace(/\/+$/, "");
  const base = baseDir.replace(/\/+$/, "");

  if (target === base) return true;
  return target.startsWith(`${base}/`);
}
