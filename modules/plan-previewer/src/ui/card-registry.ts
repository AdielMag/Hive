import { normalizePlanPath } from "../plan-utils.ts";

/** Plans that currently have a live inline card mounted in a transcript (path -> mount count). */
const mounted = new Map<string, number>();
const key = (p: string) => normalizePlanPath(p).toLowerCase();

export function registerInlineCard(filePath: string): () => void {
  const k = key(filePath);
  mounted.set(k, (mounted.get(k) ?? 0) + 1);
  return () => {
    const n = (mounted.get(k) ?? 1) - 1;
    if (n <= 0) mounted.delete(k);
    else mounted.set(k, n);
  };
}

export const hasInlineCard = (filePath: string): boolean => mounted.has(key(filePath));
