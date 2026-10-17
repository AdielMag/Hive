/** Shared formatters live in the module SDK so modules can use them; core keeps this path for its own imports. */
export * from "@hive/module-sdk/format";

/**
 * Compact relative time for session rows and cards:
 * "now", "44m", "3h", "2d", "5w"
 */
export function formatAgoShort(ts: number | Date | string, now = Date.now()): string {
  const time = typeof ts === "number" ? ts : new Date(ts).getTime();
  if (!Number.isFinite(time)) return "now";
  const diff = Math.max(0, now - time);
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "now";
  const h = Math.floor(m / 60);
  if (h < 1) return `${m}m`;
  const d = Math.floor(h / 24);
  if (d < 1) return `${h}h`;
  const w = Math.floor(d / 7);
  if (w < 1) return `${d}d`;
  return `${w}w`;
}

