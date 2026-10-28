/**
 * Jev (TypeSafe System One) client for the optional Jev judge tier.
 *
 * Schema source: leepokai/jev-guard `src/jev.js` + `src/guard.js` (read from GitHub, MIT).
 * NOT verified against a live API key from this repo: the request/response shapes are isolated in
 * `buildRequestBody` and `parseAnswers` so a mismatch is a one-function fix.
 *
 * Never throws: every failure (no key, timeout, HTTP error, bad JSON) resolves to `null` and the
 * caller fails open. Nothing is sent unless `readJevConfig(env).enabled`.
 *
 * Credentials come from, in order: the env switches below (`JEV_GUARD_ENABLED=1` + `JEV_API_KEY`), or the Jev
 * module's config.json (`HIVE_JEV_CONFIG`, set by Hive) once it holds an API key AND the user accepted the Jev
 * privacy notice (`consentAt`). `JEV_GUARD_ENABLED=0` switches the tier off even when Jev is configured.
 */

import { readFileSync } from "node:fs";
import type { JevAnswers } from "./engine/judge.ts";
import { redactSecrets } from "./engine/judge.ts";

export const DEFAULT_JEV_BASE_URL = "https://api.typesafe.ai";
export const JEV_TIMEOUT_MS = 1500;
export const JEV_MODEL = "jev-latest";

export type EnvLike = Record<string, string | undefined>;

export interface JevConfig {
  enabled: boolean;
  /** Full POST URL (`<base>/v1/systemone`). */
  url?: string;
  apiKey?: string;
  model: string;
  timeoutMs: number;
  /** Why the tier is inactive (for logs). */
  inactiveReason?: string;
  /** Where the credentials came from. */
  source?: "env" | "jev-module";
}

export type ReadText = (path: string) => string;

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** `<base>/v1/systemone`; https only, except plain http to loopback / private addresses. */
export function systemOneUrl(base: string): string | null {
  let u: URL;
  try {
    u = new URL(base);
  } catch {
    return null;
  }
  const host = u.hostname;
  const local = host === "localhost" || host === "[::1]" || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
  if (u.protocol !== "https:" && !(u.protocol === "http:" && local)) return null;
  u.search = "";
  u.hash = "";
  return u.href.replace(/\/+$/, "") + "/v1/systemone";
}

/** Reads the Jev module's config.json. Null unless it has an API key and a recorded privacy consent. */
function readModuleConfig(env: EnvLike, readText: ReadText): JevConfig | null {
  const file = env.HIVE_JEV_CONFIG;
  if (!file) return null;
  try {
    const raw = JSON.parse(readText(file)) as { apiKey?: unknown; consentAt?: unknown; model?: unknown };
    const apiKey = typeof raw.apiKey === "string" ? raw.apiKey.trim() : "";
    if (!apiKey) return null;
    if (typeof raw.consentAt !== "number" || !(raw.consentAt > 0)) return null;
    const model = typeof raw.model === "string" && raw.model.trim() ? raw.model.trim() : JEV_MODEL;
    return { enabled: true, url: systemOneUrl(DEFAULT_JEV_BASE_URL) as string, apiKey, model: env.JEV_MODEL || model, timeoutMs: JEV_TIMEOUT_MS, source: "jev-module" };
  } catch {
    return null;
  }
}

/**
 * Enabled with `JEV_GUARD_ENABLED=1` AND a credential (`JEV_API_KEY` is only ever sent to the default TypeSafe
 * host; a custom `JEV_BASE_URL` gets only its own optional `JEV_BASE_API_KEY`, mirroring jev-guard), or through the
 * Jev module's config (see file header). An explicit `JEV_GUARD_ENABLED=0` always wins.
 */
export function readJevConfig(env: EnvLike = process.env, readText: ReadText = (p) => readFileSync(p, "utf8")): JevConfig {
  const base: JevConfig = { enabled: false, model: env.JEV_MODEL || JEV_MODEL, timeoutMs: JEV_TIMEOUT_MS };
  const flag = env.JEV_GUARD_ENABLED ?? "";
  if (/^(0|false|no|off)$/i.test(flag)) return { ...base, inactiveReason: "JEV_GUARD_ENABLED is off" };
  if (!/^(1|true|yes|on)$/i.test(flag)) {
    return readModuleConfig(env, readText) ?? { ...base, inactiveReason: "JEV_GUARD_ENABLED not set and the Jev module has no key/consent" };
  }
  if (env.JEV_BASE_URL) {
    const url = systemOneUrl(env.JEV_BASE_URL);
    if (!url) return { ...base, inactiveReason: "JEV_BASE_URL must be https (or http on localhost/private address)" };
    return { ...base, enabled: true, url, source: "env", ...(env.JEV_BASE_API_KEY ? { apiKey: env.JEV_BASE_API_KEY } : {}) };
  }
  if (!env.JEV_API_KEY) return readModuleConfig(env, readText) ?? { ...base, inactiveReason: "JEV_API_KEY not set" };
  const url = systemOneUrl(DEFAULT_JEV_BASE_URL) as string;
  return { ...base, enabled: true, url, apiKey: env.JEV_API_KEY, source: "env" };
}

/** Two typed questions: `risk` (score, 0-3) and `approval` (noul, probability). Copied from jev-guard's ACTION_QUESTIONS. */
export const JEV_QUESTIONS = {
  risk: {
    type: "score",
    instructions: "How much harm could this tool call do if it turned out to be a mistake? Judge the exact command and arguments, not the tool's name.",
    criteria: [
      "Read-only or fully reversible inside the workspace: reading or listing files, searching, running tests or builds, git status/diff/log, fetching a web page.",
      "Changes the workspace in a way that is easy to undo: editing or creating project files, git add/commit/branch/stash, installing project dependencies, running local scripts.",
      "Hard to undo or reaches outside the workspace: deleting files or directories, git push, reset --hard, rebase or force-push, editing dotfiles or global config, installing system packages, HTTP requests with side effects, sending messages or email, running scripts fetched from the internet.",
      "Destructive or irreversible: recursive deletes of important paths, disk, partition or filesystem operations, piping a download into a shell, exposing or exfiltrating secrets and credentials, production deploys, dropping or migrating shared databases, payments, chmod/chown -R on system paths, killing arbitrary processes, sudo or privilege escalation.",
    ],
  },
  approval: {
    type: "noul",
    instructions: "Would a careful senior engineer want the human to explicitly approve this exact tool call before it runs, judging from the call and the conversation context?",
    criteria: {
      true: "Yes: the call has consequences the human should confirm first.",
      false: "No: routine and safe to run unattended.",
    },
  },
} as const;

/** Request schema (one place to fix if the API differs). */
export function buildRequestBody(command: string, model: string): string {
  const state = { agent: "hive", tool: "bash", input: { command: redactSecrets(command) } };
  return JSON.stringify({ state, model, questions: JEV_QUESTIONS });
}

/** Response schema (one place to fix if the API differs): `answers[id].score` / `.noul` / `.probability`. */
export function parseAnswers(body: unknown): JevAnswers | null {
  const answers = (body as { answers?: Record<string, { score?: unknown; noul?: unknown; probability?: unknown }> } | null)?.answers;
  if (!answers || typeof answers !== "object") return null;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  const risk = num(answers.risk?.score);
  const approval = num(answers.approval?.noul) ?? num(answers.approval?.probability);
  if (risk === undefined && approval === undefined) return null;
  return { risk, approval };
}

export interface AskOptions {
  env?: EnvLike;
  readText?: ReadText;
  fetchImpl?: FetchLike;
  log?: (msg: string) => void;
}

/**
 * Ask Jev about a command. Resolves to answers, or `null` on any failure / when disabled (fail-open).
 * The command is redacted before it leaves the process.
 */
export async function askJev(command: string, opts: AskOptions = {}): Promise<JevAnswers | null> {
  const log = opts.log ?? (() => {});
  let cfg: JevConfig;
  try {
    cfg = readJevConfig(opts.env ?? process.env, opts.readText);
  } catch {
    return null;
  }
  if (!cfg.enabled || !cfg.url) return null;
  const fetchImpl = opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike | undefined);
  if (!fetchImpl) {
    log("bash-guard: Jev skipped (no fetch available)");
    return null;
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs);
  const aborted = new Promise<never>((_, reject) => ctrl.signal.addEventListener("abort", () => reject(new Error("timeout")), { once: true }));
  const run = async (): Promise<JevAnswers | null> => {
    const res = await fetchImpl(cfg.url as string, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}) },
      body: buildRequestBody(command, cfg.model),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      log(`bash-guard: Jev HTTP ${res.status}; allowing (fail-open)`);
      return null;
    }
    const answers = parseAnswers(await res.json());
    if (!answers) log("bash-guard: Jev returned no usable answers; allowing (fail-open)");
    return answers;
  };
  try {
    // Race against the abort so a fetch that ignores the signal still cannot outlive the timeout.
    return await Promise.race([run(), aborted]);
  } catch (err) {
    const timedOut = ctrl.signal.aborted;
    log(`bash-guard: Jev ${timedOut ? "timed out" : `error (${(err as Error)?.message ?? "unknown"})`}; allowing (fail-open)`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
