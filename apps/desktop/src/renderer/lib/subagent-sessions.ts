/**
 * Subagent runs (pi-subagents) are ordinary Pi sessions whose header carries `parentSession` and whose name is
 * `<agent-type>#<8 hex>`. Forks also carry a parent, so both conditions must hold for a session to nest.
 */
import type { SessionCatalogItem } from "@hive/protocol";

export const SUBAGENT_NAME = /^([a-z][a-z0-9-]*)#([0-9a-f]{8})$/;

type SessionLike = Pick<SessionCatalogItem, "path" | "name" | "parentSessionPath">;

export function isSubagentSession(s: SessionLike): boolean {
  return !!s.parentSessionPath && SUBAGENT_NAME.test(s.name ?? "");
}

/** "reviewer" for `reviewer#54da68dd`; undefined for non-subagent sessions. */
export function subagentType(s: SessionLike): string | undefined {
  return SUBAGENT_NAME.exec(s.name ?? "")?.[1];
}

/** "54da68dd" for `reviewer#54da68dd`. */
export function subagentId(s: SessionLike): string | undefined {
  return SUBAGENT_NAME.exec(s.name ?? "")?.[2];
}

/** Path key that matches across slash styles and Windows drive-letter casing. */
export function normPath(p: string): string {
  return p.replace(/\\/g, "/").toLowerCase();
}

export interface GroupedSessions<T extends SessionLike> {
  /** Everything that isn't a nested subagent run, in input order. */
  roots: T[];
  /** Subagent runs keyed by `normPath(parent.path)`, newest first. */
  childrenByParent: Map<string, T[]>;
  /** Subagent runs whose parent isn't in the list (archived, filtered out, other project), newest first. */
  orphans: T[];
}

const byModifiedDesc = <T extends SessionLike>(a: T, b: T): number => {
  const ma = (a as Partial<SessionCatalogItem>).modified ?? "";
  const mb = (b as Partial<SessionCatalogItem>).modified ?? "";
  return ma < mb ? 1 : ma > mb ? -1 : 0;
};

export function groupSessions<T extends SessionLike>(list: readonly T[]): GroupedSessions<T> {
  const present = new Set(list.map((s) => normPath(s.path)));
  const roots: T[] = [];
  const childrenByParent = new Map<string, T[]>();
  const orphans: T[] = [];
  for (const s of list) {
    if (!isSubagentSession(s)) {
      roots.push(s);
      continue;
    }
    const parent = normPath(s.parentSessionPath!);
    if (!present.has(parent)) {
      orphans.push(s);
      continue;
    }
    const bucket = childrenByParent.get(parent);
    if (bucket) bucket.push(s);
    else childrenByParent.set(parent, [s]);
  }
  for (const bucket of childrenByParent.values()) bucket.sort(byModifiedDesc);
  orphans.sort(byModifiedDesc);
  return { roots, childrenByParent, orphans };
}
