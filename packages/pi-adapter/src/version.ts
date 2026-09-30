import type { PiSupport } from "@pi-studio/protocol";

/** Oldest Pi we support: the version the plan's evidence and spikes were built on. */
export const MIN_PI_VERSION = "0.87.1";
/** Newest Pi the contract suite has passed against. Newer versions run with a warning. */
export const TESTED_MAX_PI_VERSION = "0.99.1";

/** Compare dotted numeric versions (pre-release tags compare lower than the release). */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const [core = "", pre] = v.trim().replace(/^v/, "").split("-", 2);
    return { nums: core.split(".").map((n) => Number.parseInt(n, 10) || 0), pre };
  };
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < Math.max(pa.nums.length, pb.nums.length); i++) {
    const d = (pa.nums[i] ?? 0) - (pb.nums[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  if (pa.pre && !pb.pre) return -1;
  if (!pa.pre && pb.pre) return 1;
  return (pa.pre ?? "").localeCompare(pb.pre ?? "");
}

export function piSupport(version: string): PiSupport {
  if (compareVersions(version, MIN_PI_VERSION) < 0) return "too-old";
  if (compareVersions(version, TESTED_MAX_PI_VERSION) > 0) return "untested-newer";
  return "supported";
}
