import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface RepoSlug {
  owner: string;
  repo: string;
}

/** Parses a github.com remote URL (https, scp-style ssh, ssh://). Returns null for any other host. */
export function parseGithubRemote(url: string): RepoSlug | null {
  const trimmed = url.trim();
  const m =
    /^(?:https?:\/\/(?:[^@/]+@)?|ssh:\/\/(?:[^@/]+@)?|git:\/\/|[^@/\s]+@)github\.com(?::\d+)?[/:]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i.exec(trimmed);
  if (!m) return null;
  return { owner: m[1]!, repo: m[2]! };
}

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd, windowsHide: true, timeout: 10_000 });
  return stdout.trim();
}

export type RemoteLookup = { kind: "ok"; slug: RepoSlug; branch?: string } | { kind: "no_remote" } | { kind: "not_github"; url: string };

/** Finds the GitHub repo for a working directory: `origin` first, then any other github.com remote. */
export async function resolveRemote(cwd: string): Promise<RemoteLookup> {
  let names: string[];
  try {
    names = (await git(cwd, ["remote"])).split(/\r?\n/).filter(Boolean);
  } catch {
    return { kind: "no_remote" };
  }
  if (names.length === 0) return { kind: "no_remote" };
  names.sort((a, b) => (a === "origin" ? -1 : b === "origin" ? 1 : 0));

  let firstUrl = "";
  for (const name of names) {
    let url = "";
    try {
      url = await git(cwd, ["remote", "get-url", name]);
    } catch {
      continue;
    }
    firstUrl ||= url;
    const slug = parseGithubRemote(url);
    if (slug) {
      let branch: string | undefined;
      try {
        const b = await git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
        if (b && b !== "HEAD") branch = b;
      } catch {
        /* unborn branch */
      }
      return { kind: "ok", slug, branch };
    }
  }
  return { kind: "not_github", url: firstUrl };
}
