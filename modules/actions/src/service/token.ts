import { spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { TokenSource } from "../shared.ts";

export interface ResolvedToken {
  token: string | null;
  source: TokenSource;
}

const GIT_CACHE_MS = 5 * 60_000;

/** Asks the user's git credential helper for a github.com token. Never prompts; resolves null on any failure. */
function gitCredentialFill(env: NodeJS.ProcessEnv): Promise<string | null> {
  return new Promise((resolve) => {
    let out = "";
    let settled = false;
    const done = (v: string | null) => {
      if (settled) return;
      settled = true;
      resolve(v);
    };
    try {
      const child = spawn("git", ["credential", "fill"], {
        windowsHide: true,
        env: { ...env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" },
      });
      const timer = setTimeout(() => {
        child.kill();
        done(null);
      }, 5000);
      child.stdout.on("data", (d: Buffer) => {
        out += d.toString();
      });
      child.on("error", () => done(null));
      child.on("close", () => {
        clearTimeout(timer);
        done(/^password=(.+)$/m.exec(out)?.[1]?.trim() || null);
      });
      child.stdin.on("error", () => undefined);
      child.stdin.end("protocol=https\nhost=github.com\n\n");
    } catch {
      done(null);
    }
  });
}

/**
 * Token resolution chain: env (`GITHUB_TOKEN`/`GH_TOKEN`) -> token saved in the panel -> `git credential fill`
 * for github.com (reuses Git Credential Manager / the user's configured helper).
 */
export function createTokenProvider(dataDir: () => string, env: NodeJS.ProcessEnv = process.env) {
  const file = () => join(dataDir(), "token.json");
  let gitCache: { at: number; token: string | null } | null = null;

  function readSaved(): string | null {
    try {
      if (!existsSync(file())) return null;
      const parsed = JSON.parse(readFileSync(file(), "utf8")) as { token?: unknown };
      return typeof parsed.token === "string" && parsed.token ? parsed.token : null;
    } catch {
      return null;
    }
  }

  async function fromGit(): Promise<string | null> {
    if (gitCache && Date.now() - gitCache.at < GIT_CACHE_MS) return gitCache.token;
    const token = await gitCredentialFill(env);
    gitCache = { at: Date.now(), token };
    return token;
  }

  return {
    async resolve(): Promise<ResolvedToken> {
      const fromEnv = env.GITHUB_TOKEN?.trim() || env.GH_TOKEN?.trim();
      if (fromEnv) return { token: fromEnv, source: "env" };
      const saved = readSaved();
      if (saved) return { token: saved, source: "saved" };
      const viaGit = await fromGit();
      if (viaGit) return { token: viaGit, source: "git" };
      return { token: null, source: "none" };
    },
    save(token: string): void {
      writeFileSync(file(), JSON.stringify({ token: token.trim() }), { mode: 0o600 });
    },
    clear(): void {
      rmSync(file(), { force: true });
      gitCache = null;
    },
  };
}

export type TokenProvider = ReturnType<typeof createTokenProvider>;
