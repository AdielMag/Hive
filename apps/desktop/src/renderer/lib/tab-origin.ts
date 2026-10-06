import type { ProjectEntry, TabItem } from "@hive/protocol";

/** Identifies the Pi session (and folder) a module-opened tab was triggered from, e.g. by a CLI run in that session. */
export interface TabOriginHint {
  sessionFile?: string;
  sessionId?: string;
  cwd?: string;
}

const norm = (p: string): string => p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();

/** The session tab a hint points at: exact session file first, then the session id embedded in the file name. */
export function findOriginTab(tabs: TabItem[], hint: TabOriginHint | undefined): TabItem | undefined {
  if (!hint) return undefined;
  const sessionTabs = tabs.filter((t) => t.sessionPath);
  if (hint.sessionFile) {
    const want = norm(hint.sessionFile);
    const hit = sessionTabs.find((t) => norm(t.sessionPath!) === want);
    if (hit) return hit;
  }
  if (hint.sessionId) {
    const id = hint.sessionId.toLowerCase();
    return sessionTabs.find((t) => norm(t.sessionPath!).includes(id));
  }
  return undefined;
}

/** Fallback when no session tab matches: the most specific project that contains `cwd`. */
export function findOriginProject(projects: ProjectEntry[], hint: TabOriginHint | undefined): ProjectEntry | undefined {
  if (!hint?.cwd) return undefined;
  const cwd = norm(hint.cwd);
  let best: ProjectEntry | undefined;
  for (const p of projects) {
    const root = norm(p.path);
    if ((cwd === root || cwd.startsWith(`${root}/`)) && (!best || root.length > norm(best.path).length)) best = p;
  }
  return best;
}
