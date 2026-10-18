import { spawn } from "node:child_process";
import type { PiInstallInfo } from "@hive/protocol";

const TIMEOUT_MS = 60_000;
const MAX_SESSIONS = 200;

interface Candidate {
  path: string;
  title: string;
  modified: string;
  messageCount: number;
}

function isCandidate(v: unknown): v is Candidate {
  const c = v as Candidate;
  return !!c && typeof c.path === "string" && typeof c.title === "string" && typeof c.modified === "string" && typeof c.messageCount === "number";
}

/** Pull the JSON array of ids out of raw model output (tolerates code fences / prose). */
export function parseIdList(raw: string): number[] {
  // Last valid array wins: the model may echo the prompt's example before its real answer.
  for (const m of [...raw.matchAll(/\[[^\[\]]*\]/g)].reverse()) {
    try {
      const arr = JSON.parse(m[0]) as unknown;
      if (Array.isArray(arr) && arr.every((n) => Number.isInteger(n))) return arr as number[];
    } catch {
      /* try next bracket pair */
    }
  }
  return [];
}

/** One-shot Pi CLI call: the model picks which sessions are stale. Resolves chosen paths, or null on failure. */
export function pickStaleSessions(
  pi: Pick<PiInstallInfo, "nodePath" | "cliPath">,
  cwd: string,
  sessions: unknown[],
  model?: string,
): Promise<string[] | null> {
  const list = sessions.filter(isCandidate).slice(0, MAX_SESSIONS);
  if (!list.length) return Promise.resolve([]);

  const now = new Date().toISOString();
  const lines = list
    .map((s, i) => `${i}\t${s.modified}\t${s.messageCount} msgs\t${s.title.replace(/\s+/g, " ").slice(0, 100)}`)
    .join("\n");
  const instruction = `You tidy a list of coding chat sessions. Decide which are OLD and safe to archive: stale, abandoned, finished, trivial or one-off. Keep recent sessions and ones that look like ongoing work.
Current time: ${now}
Sessions (id, last modified, size, title):
${lines}

Output ONLY a JSON array of the ids to archive, e.g. [0,3,7]. Output [] if none.`;

  const args = [pi.cliPath, "-p", "--no-session", "--no-tools", "--no-context-files"];
  if (model) args.push("--model", model);

  return new Promise<string[] | null>((resolve) => {
    let settled = false;
    const done = (value: string[] | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const child = spawn(pi.nodePath, args, { cwd, windowsHide: true, stdio: ["pipe", "pipe", "ignore"] });
    const timer = setTimeout(() => {
      child.kill();
      done(null);
    }, TIMEOUT_MS);
    let stdout = "";
    child.stdout.on("data", (c: Buffer) => (stdout += c.toString("utf8")));
    child.on("error", () => done(null));
    child.on("close", (code) => {
      if (code !== 0) return done(null);
      const ids = new Set(parseIdList(stdout));
      done(list.filter((_, i) => ids.has(i)).map((s) => s.path));
    });
    child.stdin.on("error", () => {});
    child.stdin.write(instruction);
    child.stdin.end();
  });
}
