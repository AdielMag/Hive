import { realpathSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";

/**
 * Renderer-supplied paths are untrusted. File IPC (list/read/media, session read/delete) only touches paths
 * under: registered projects (+ their `.hive-worktrees`), linked folders, Pi's sessions dir, the OS temp dir
 * (attachments) and paths the user explicitly granted via a native dialog.
 */
export interface PathGuardSource {
  getProjects(): Array<{ path: string; links?: Array<{ path: string }> }>;
}

let source: PathGuardSource | null = null;
const granted = new Set<string>();

export function configurePathGuard(s: PathGuardSource): void {
  source = s;
}

const norm = (p: string): string => {
  const r = process.platform === "win32" ? p.toLowerCase() : p;
  return r.replace(/[\\/]+$/, "");
};

/** realpath, falling back to the nearest existing ancestor (so not-yet-existing paths still resolve). */
export function canonicalize(p: string): string {
  const abs = resolve(p);
  let cur = abs;
  let rest = "";
  for (let i = 0; i < 64; i++) {
    try {
      const real = realpathSync.native(cur);
      return rest ? join(real, rest) : real;
    } catch {
      const parent = dirname(cur);
      if (parent === cur) return abs;
      rest = rest ? join(cur.slice(parent.length + 1), rest) : cur.slice(parent.length + 1);
      cur = parent;
    }
  }
  return abs;
}

function within(child: string, root: string): boolean {
  const c = norm(child);
  const r = norm(root);
  return c === r || c.startsWith(r + sep) || c.startsWith(r + "/");
}

/** Pi's sessions directory (honours PI_CODING_AGENT_DIR). */
export function sessionsDir(): string {
  const agentDir = process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
  return join(agentDir, "sessions");
}

export function grantPath(p: string): void {
  if (typeof p === "string" && p) granted.add(norm(canonicalize(p)));
}

function roots(): string[] {
  const out: string[] = [sessionsDir(), tmpdir()];
  for (const proj of source?.getProjects() ?? []) {
    out.push(proj.path, join(proj.path, ".hive-worktrees"));
    for (const l of proj.links ?? []) out.push(l.path);
  }
  return out;
}

export function isPathAllowed(p: unknown): boolean {
  if (typeof p !== "string" || !p || p.includes("\0")) return false;
  const real = canonicalize(p);
  if (granted.has(norm(real))) return true;
  return roots().some((r) => within(real, canonicalize(r)));
}

export function assertPathAllowed(p: unknown): string {
  if (!isPathAllowed(p)) throw new Error("Path is outside allowed locations");
  return p as string;
}

/** A `.jsonl` file inside Pi's sessions directory. */
export function assertSessionFile(p: unknown): string {
  if (typeof p !== "string" || !/\.jsonl$/i.test(p) || !within(canonicalize(p), canonicalize(sessionsDir()))) {
    throw new Error("Path is outside allowed locations");
  }
  return p;
}

/**
 * Credential stores that must never be readable through file IPC, even when the path was granted or sits
 * under an allowed root (e.g. a project inside the home directory).
 */
function isCredentialPath(real: string): boolean {
  const home = norm(canonicalize(homedir()));
  const r = norm(real).replaceAll("\\", "/");
  const h = home.replaceAll("\\", "/");
  const underHome = (rel: string): boolean => r === `${h}/${rel}` || r.startsWith(`${h}/${rel}/`);
  const agentDir = norm(canonicalize(process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent"))).replaceAll("\\", "/");
  return (
    [".ssh", ".aws", ".gnupg", ".kube", ".docker/config.json", ".config/gh", ".npmrc", ".netrc", ".git-credentials"].some(underHome) ||
    r === `${agentDir}/auth.json`
  );
}

/**
 * Reads (file viewer, composer attachments, file links in chat) may target any file the user points at — files
 * the agent mentions often live outside the project. Only credential stores are refused.
 */
export function assertReadAllowed(p: unknown): string {
  if (typeof p !== "string" || !p || p.includes("\0")) throw new Error("Invalid path");
  if (isCredentialPath(canonicalize(p))) throw new Error("Reading credential files is not allowed");
  return p;
}

/** Kept for callers that read media; same policy as {@link assertReadAllowed}. */
export function assertMediaPathAllowed(p: unknown): string {
  return assertReadAllowed(p);
}
