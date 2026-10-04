/**
 * Measures the instruction files Pi injects into the system prompt (AGENTS.md / CLAUDE.md in the
 * agent dir and each ancestor of the project, plus SYSTEM.md / APPEND_SYSTEM.md overrides).
 * Only sizes are returned; the contents never leave the main process.
 */
import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { ContextFileInfo } from "@hive/protocol";

export interface ContextFilesOptions {
  agentDir?: string;
  homeDir?: string;
}

/** File length in characters, or null when missing / unreadable / not a regular file. */
function measure(path: string): number | null {
  try {
    if (!statSync(path).isFile()) return null;
    return readFileSync(path, "utf8").length;
  } catch {
    return null;
  }
}

function normPath(p: string): string {
  const r = resolve(p);
  return process.platform === "win32" ? r.toLowerCase() : r;
}

export function listContextFiles(cwd: string | undefined, opts: ContextFilesOptions = {}): ContextFileInfo[] {
  const agentDir = opts.agentDir ?? (process.env.PI_CODING_AGENT_DIR || join(opts.homeDir ?? homedir(), ".pi", "agent"));
  const projectDir = typeof cwd === "string" && cwd ? resolve(cwd) : undefined;
  const out: ContextFileInfo[] = [];
  const seen = new Set<string>();

  const push = (path: string, label: string, scope: ContextFileInfo["scope"]): boolean => {
    const key = normPath(path);
    if (seen.has(key)) return true;
    const chars = measure(path);
    if (chars === null) return false;
    seen.add(key);
    out.push({ label, path, chars, scope });
    return true;
  };
  /** First of AGENTS.md / CLAUDE.md that exists in `dir` (Pi loads one per directory). */
  const pushContext = (dir: string, label: string, scope: ContextFileInfo["scope"]) => {
    for (const name of ["AGENTS.md", "CLAUDE.md"]) {
      if (push(join(dir, name), `${label} ${name}`, scope)) return;
    }
  };

  pushContext(agentDir, "Global", "global");
  push(join(agentDir, "SYSTEM.md"), "Global SYSTEM.md", "global");
  push(join(agentDir, "APPEND_SYSTEM.md"), "Global APPEND_SYSTEM.md", "global");

  if (projectDir) {
    const ancestors: string[] = [];
    let dir = projectDir;
    for (;;) {
      ancestors.push(dir);
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    // Outermost first, like Pi's load order.
    for (const d of ancestors.reverse()) pushContext(d, d === projectDir ? "Project" : "Parent", "project");
    push(join(projectDir, ".pi", "SYSTEM.md"), "Project SYSTEM.md", "project");
    push(join(projectDir, ".pi", "APPEND_SYSTEM.md"), "Project APPEND_SYSTEM.md", "project");
  }
  return out;
}
