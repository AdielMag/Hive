/**
 * Pi extension: Jev (TypeSafe system-one) for Hive.
 *
 * 1. Smart compaction timing. After a turn that ends without tool calls, asks Jev four typed questions about the
 *    conversation and emits a `jev_advice` record on `studio:to-gui`. Hive decides what to show; this never
 *    touches the agent's context. Hive can answer with `jev_compact` on `studio:from-gui` to compact.
 * 2. `ask_jev` tool: the agent asks typed yes/no, choice or score questions about text, files or the output of
 *    a read-only command. File/command contents go straight to Jev and never enter the agent's context.
 *
 * Inert unless Hive (or the user) sets HIVE_JEV_CONFIG to a config.json holding a TypeSafe `apiKey`. Every failure
 * is swallowed: Pi must behave exactly as it does without this extension.
 *
 * Installed as ONE file into Pi's extensions dir, so it cannot import Hive code; shapes marked "mirrored" copy
 * modules/jev/src/shared.ts. API: https://api.typesafe.ai/openapi.json
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { execFile } from "node:child_process";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const API_URL = "https://api.typesafe.ai";
const TO_GUI = "studio:to-gui";
const FROM_GUI = "studio:from-gui";
const CALL_TIMEOUT_MS = 6_000;
const MAX_FILE_BYTES = 200_000;
const MAX_TOTAL_BYTES = 400_000;
/** Per-source preview kept in the tool result `details` (session JSONL) for the transcript card's In tab. */
const PREVIEW_CHARS = 4_096;

// ---------------------------------------------------------------------------------------------------------
// Settings (mirrored subset of JevSettings)
// ---------------------------------------------------------------------------------------------------------

export interface Settings {
  apiKey: string;
  model: string;
  compact: { enabled: boolean; floorPct: number };
  askJev: { enabled: boolean };
  maxCallsPerDay: number;
}

type Env = Record<string, string | undefined>;

export function loadSettings(env: Env = process.env): Settings | null {
  const file = env.HIVE_JEV_CONFIG;
  if (!file) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, any>;
    const apiKey = typeof raw.apiKey === "string" ? raw.apiKey.trim() : "";
    if (!apiKey) return null;
    // Conversation text leaves the machine, so Jev stays inert until the user accepted the privacy notice in Settings.
    if (typeof raw.consentAt !== "number" || !(raw.consentAt > 0)) return null;
    return {
      apiKey,
      model: typeof raw.model === "string" && raw.model.trim() ? raw.model.trim() : "jev-latest",
      compact: {
        enabled: raw.compact?.enabled !== false,
        floorPct: typeof raw.compact?.floorPct === "number" ? raw.compact.floorPct : 40,
      },
      askJev: { enabled: raw.askJev?.enabled !== false },
      maxCallsPerDay: typeof raw.maxCallsPerDay === "number" ? raw.maxCallsPerDay : 500,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------------------------------------

export type Question =
  | { type: "noul"; instructions: string; criteria?: { true?: string; false?: string } }
  | { type: "choice"; instructions: string; criteria: Record<string, string> }
  | { type: "score"; instructions: string; criteria: string[] };

export type Answer =
  | { type: "noul"; noul: number }
  | { type: "choice"; choice: string; confidence: number; probabilities: Record<string, number> }
  | { type: "score"; score: number; confidence: number; legend: Record<string, unknown>; probabilities: Record<string, number> };

/** Why a call failed (mirrored). cap/gather/invalid/disabled/aborted never reached the API (or were cancelled before it counted). */
export type ErrorKind = "cap" | "auth" | "timeout" | "gather" | "api" | "disabled" | "invalid" | "aborted";

export type CallResult =
  | { ok: true; answers: Record<string, Answer>; inputTokens: number; outputTokens: number; model: string; ms: number }
  | { ok: false; error: string; errorKind: ErrorKind; status?: number; ms: number; /** True when callJev already wrote the usage record. */ logged: boolean };

/** Sizes of what went into an ask_jev call (mirrored; no content). */
export interface UsageSources {
  stateChars: number;
  files: Array<{ path: string; bytes: number }>;
  commandBytes?: number;
}

/** One Jev call (mirrored). Everything after `error` is optional so older records still parse. */
export interface UsageRecord {
  ts: number;
  feature: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  ms: number;
  ok: boolean;
  error?: string;
  errorKind?: ErrorKind;
  sessionId?: string;
  toolCallId?: string;
  cwd?: string;
  questions?: { noul: number; choice: number; score: number };
  sources?: UsageSources;
  savedTokensEst?: number;
  confidence?: number[];
}

/** Extra fields a caller attaches to the usage record. */
export type UsageMeta = Omit<Partial<UsageRecord>, "ts" | "feature" | "model" | "inputTokens" | "outputTokens" | "ms" | "ok" | "error" | "errorKind" | "confidence">;

const LOCAL_ERROR_KINDS: ReadonlySet<string> = new Set(["cap", "gather", "invalid", "disabled", "aborted"]);

/** True when the record describes an attempt that reached the API (local refusals don't count toward the cap). */
export function reachedApi(rec: Pick<UsageRecord, "errorKind">): boolean {
  return !rec.errorKind || !LOCAL_ERROR_KINDS.has(rec.errorKind);
}

/** How decisive an answer is, 0.5-1 for yes/no (distance from a coin flip), the API's confidence otherwise. */
export function answerConfidence(a: Answer): number | null {
  if (a?.type === "noul") return Number.isFinite(a.noul) ? Math.max(a.noul, 1 - a.noul) : null;
  const c = Number((a as { confidence?: unknown })?.confidence);
  return Number.isFinite(c) ? c : null;
}

interface Breaker {
  failures: number;
  openUntil: number;
}
const breaker: Breaker = { failures: 0, openUntil: 0 };

export function resetBreaker(): void {
  breaker.failures = 0;
  breaker.openUntil = 0;
}

/** 3 straight failures pause calls for 5 minutes; a rejected key / empty balance pauses for 30. */
function noteResult(r: CallResult, now: number): void {
  if (r.ok) {
    breaker.failures = 0;
    return;
  }
  if (r.status === 401 || r.status === 402 || r.status === 403) {
    breaker.openUntil = now + 30 * 60_000;
    return;
  }
  breaker.failures += 1;
  if (breaker.failures >= 3) {
    breaker.openUntil = now + 5 * 60_000;
    breaker.failures = 0;
  }
}

const dayKey = (t: number): string => {
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};
let callsDay = "";
let callsToday = 0;

export function resetCallCounter(): void {
  callsDay = "";
  callsToday = 0;
}

/** Calls made today by every session: seeded from the shared usage log, then counted in memory. */
function callsMadeToday(now: number, env: Env): number {
  const key = dayKey(now);
  if (callsDay !== key) {
    callsDay = key;
    callsToday = 0;
    try {
      const file = env.HIVE_JEV_USAGE;
      if (file && fs.existsSync(file)) {
        for (const line of fs.readFileSync(file, "utf8").split("\n")) {
          if (!line) continue;
          try {
            const rec = JSON.parse(line) as UsageRecord;
            if (dayKey(rec.ts) === key && reachedApi(rec)) callsToday += 1;
          } catch {}
        }
      }
    } catch {}
  }
  return callsToday;
}

export function logUsage(rec: UsageRecord, env: Env = process.env): void {
  try {
    const file = env.HIVE_JEV_USAGE;
    if (file) fs.appendFileSync(file, `${JSON.stringify(rec)}\n`, "utf8");
  } catch {}
}

export interface CallOptions {
  settings: Settings;
  feature: string;
  state: unknown;
  questions: Record<string, Question>;
  timeoutMs?: number;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  env?: Env;
  now?: () => number;
  /** Extra fields for the usage record (session, sources, ...). */
  meta?: UsageMeta;
}

/** POST /v1/systemone. Never throws; records every attempt that reaches the API in the usage log. */
export async function callJev(opts: CallOptions): Promise<CallResult> {
  const env = opts.env ?? process.env;
  const now = opts.now ?? Date.now;
  const started = now();
  const fail = (error: string, errorKind: ErrorKind, status?: number): CallResult => {
    const r: CallResult = { ok: false, error, errorKind, status, ms: now() - started, logged: true };
    noteResult(r, now());
    logUsage({ ts: started, feature: opts.feature, model: opts.settings.model, inputTokens: 0, outputTokens: 0, ms: r.ms, ok: false, error, errorKind, ...opts.meta }, env);
    return r;
  };

  // Cancelled by the caller: not a failure, not logged, not counted, never trips the breaker.
  const abortedResult = (): CallResult => ({ ok: false, error: "Aborted", errorKind: "aborted", ms: now() - started, logged: false });
  if (opts.signal?.aborted) return abortedResult();
  if (now() < breaker.openUntil) return { ok: false, error: "Jev paused after repeated failures", errorKind: "api", ms: 0, logged: false };
  const cap = opts.settings.maxCallsPerDay;
  if (cap > 0 && callsMadeToday(started, env) >= cap) return { ok: false, error: `Daily Jev call limit reached (${cap})`, errorKind: "cap", ms: 0, logged: false };
  callsToday += 1;

  const timeout = AbortSignal.timeout(opts.timeoutMs ?? CALL_TIMEOUT_MS);
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
  try {
    const res = await (opts.fetchImpl ?? fetch)(`${API_URL}/v1/systemone`, {
      method: "POST",
      headers: { Authorization: `Bearer ${opts.settings.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: opts.settings.model, state: opts.state, questions: opts.questions }),
      signal,
    });
    if (!res.ok) {
      let detail = "";
      try {
        const body = (await res.json()) as any;
        detail = typeof body?.detail === "string" ? body.detail : (body?.detail?.message ?? JSON.stringify(body?.detail ?? body)).slice(0, 200);
      } catch {}
      const auth = res.status === 401 || res.status === 402 || res.status === 403;
      return fail(`HTTP ${res.status}${detail ? `: ${detail}` : ""}`, auth ? "auth" : "api", res.status);
    }
    const body = (await res.json()) as any;
    if (!body || typeof body.answers !== "object" || body.answers === null) return fail("Malformed response from Jev", "api");
    const r: CallResult = {
      ok: true,
      answers: body.answers,
      inputTokens: Number(body.usage?.input_tokens) || 0,
      outputTokens: Number(body.usage?.output_tokens) || 0,
      model: typeof body.model === "string" ? body.model : opts.settings.model,
      ms: now() - started,
    };
    noteResult(r, now());
    const confidence = Object.values(r.answers as Record<string, Answer>)
      .map(answerConfidence)
      .filter((c): c is number => c !== null)
      .map((c) => Math.round(c * 1000) / 1000);
    logUsage({ ts: started, feature: opts.feature, model: r.model, inputTokens: r.inputTokens, outputTokens: r.outputTokens, ms: r.ms, ok: true, ...opts.meta, confidence }, env);
    return r;
  } catch (err) {
    if (opts.signal?.aborted) {
      callsToday = Math.max(0, callsToday - 1);
      return abortedResult();
    }
    const aborted = signal.aborted;
    return aborted ? fail("Jev request timed out", "timeout") : fail(err instanceof Error ? err.message : String(err), "api");
  }
}

// ---------------------------------------------------------------------------------------------------------
// Smart compaction
// ---------------------------------------------------------------------------------------------------------

export const COMPACTION_QUESTIONS: Record<string, Question> = {
  switched_gears: {
    type: "noul",
    instructions:
      "Did the user's most recent request start a different task from what the earlier conversation was working on?",
    criteria: {
      true: "The latest request is about a new feature, bug or topic unrelated to the earlier work.",
      false: "The latest request continues, refines or follows up on the earlier work.",
    },
  },
  at_boundary: {
    type: "noul",
    instructions:
      "Did the assistant's last message complete a whole unit of work (a feature done, a bug fixed, a question fully answered) rather than stop partway?",
    criteria: { true: "The unit of work is finished and nothing obvious is left to do.", false: "Work is unfinished or the assistant is waiting on something." },
  },
  mid_operation: {
    type: "noul",
    instructions:
      "Is a multi-step operation still in progress, such as half-applied edits, a failing test being debugged, or an unfinished plan?",
    criteria: { true: "Steps remain and the next turn depends on exact details from this one.", false: "Nothing is half done." },
  },
  needs_history: {
    type: "score",
    instructions: "How much of the earlier conversation will the assistant's very next step need in detail?",
    criteria: [
      "Almost none: the next step is self-contained or a fresh task.",
      "Some: a few earlier decisions or facts matter.",
      "Most: the next step depends on detailed earlier context.",
    ],
  },
};

interface ChatLine {
  role: string;
  text: string;
}

const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n)}…` : s);

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const p of content as any[]) {
    if (p?.type === "text" && typeof p.text === "string") parts.push(p.text);
    else if (p?.type === "toolCall") parts.push(`[called ${p.name ?? "tool"}]`);
  }
  return parts.join("\n");
}

/** Recent conversation (since the last compaction) as compact lines for Jev. */
export function buildRecentMessages(entries: readonly any[], maxMessages = 8, perMessage = 700, total = 6_000): ChatLine[] {
  const since: any[] = [];
  for (const e of entries) {
    if (e?.type === "compaction") since.length = 0;
    else if (e?.type === "message" && e.message) since.push(e.message);
  }
  const lines: ChatLine[] = [];
  let used = 0;
  for (const m of since.slice(-maxMessages).reverse()) {
    const role = String(m.role ?? "unknown");
    const text = role === "toolResult" ? `[result of ${m.toolName ?? "tool"}]` : clip(textOf(m.content).trim(), perMessage);
    if (!text) continue;
    if (used + text.length > total) break;
    used += text.length;
    lines.unshift({ role, text });
  }
  return lines;
}

export interface Signals {
  switchedGears: number;
  atBoundary: number;
  midOperation: number;
  needsHistory: number;
}

/** Null when the response lacks any of the four expected answers. */
export function extractSignals(answers: Record<string, Answer>): Signals | null {
  const n = (a: Answer | undefined, key: "noul" | "score"): number | null => {
    const v = a && key in a ? Number((a as any)[key]) : NaN;
    return Number.isFinite(v) ? v : null;
  };
  const s = n(answers.switched_gears, "noul");
  const b = n(answers.at_boundary, "noul");
  const m = n(answers.mid_operation, "noul");
  const h = n(answers.needs_history, "score");
  if (s === null || b === null || m === null || h === null) return null;
  return { switchedGears: s, atBoundary: b, midOperation: m, needsHistory: h };
}

/** True when the turn handed control back to the user (no tool calls pending), so a boundary is plausible. */
export function turnEndedForUser(event: any): boolean {
  const msg = event?.message;
  if (!msg || msg.role !== "assistant") return false;
  if (Array.isArray(event.toolResults) && event.toolResults.length > 0) return false;
  if (msg.stopReason === "toolUse") return false;
  if (msg.stopReason === "error" || msg.stopReason === "aborted") return false;
  return true;
}

// ---------------------------------------------------------------------------------------------------------
// ask_jev helpers
// ---------------------------------------------------------------------------------------------------------

// No cat/type: file contents go through the confined `files` parameter instead.
const READ_ONLY_BINS = new Set(["ls", "dir", "head", "tail", "wc", "grep", "rg", "find", "git", "pwd", "tree"]);
const READ_ONLY_GIT = new Set(["status", "diff", "log", "show", "ls-files", "branch", "rev-parse", "blame", "grep", "describe", "shortlog", "ls-tree", "cat-file", "remote", "tag"]);

/** Splits a command into args (honouring simple quotes) when it is a plain read-only invocation, else null. */
export function parseReadOnlyCommand(command: string): { bin: string; args: string[] } | null {
  const cmd = command.trim();
  if (!cmd || /[;&|<>`\n\r]|\$\(|\$\{/.test(cmd)) return null;
  const tokens = cmd.match(/"[^"]*"|'[^']*'|\S+/g)?.map((t) => t.replace(/^(["'])(.*)\1$/, "$2"));
  if (!tokens?.length) return null;
  const [bin, ...args] = tokens;
  if (!READ_ONLY_BINS.has(bin!)) return null;
  if (bin === "git") {
    const sub = args.find((a) => !a.startsWith("-"));
    if (!sub || !READ_ONLY_GIT.has(sub)) return null;
    if (args.some((a) => /^(--output|--ext-diff|--textconv|-c|--exec-path)/.test(a))) return null;
    if (sub === "branch") {
      // Listing only: any write flag, or a bare name (which would create a branch), is refused.
      const writes = (a: string) => (/^-[a-zA-Z]+$/.test(a) && /[dDmMcCfut]/.test(a)) || /^--(delete|move|copy|force|set-upstream-to|unset-upstream|edit-description|track|no-track|create-reflog)/.test(a);
      if (args.some(writes)) return null;
      const listing = args.some((a) => /^(-l|--list|--contains|--no-contains|--merged|--no-merged|--points-at)(=|$)/.test(a));
      if (!listing && args.some((a) => a !== sub && !a.startsWith("-"))) return null;
    }
    if (sub === "tag" && args.some((a) => !a.startsWith("-") && a !== "tag") ) return null;
    if (sub === "remote" && args.some((a) => /^(add|remove|rm|rename|set-url|prune|update)$/.test(a))) return null;
  }
  if ((bin === "find" || bin === "rg" || bin === "grep") && args.some((a) => /^(-delete|-exec|-execdir|-ok|--pre|-fprint|-fls)/.test(a))) return null;
  // Pattern/ignore files are read from arbitrary paths, and a bare `--` would let later args dodge the exclusions.
  if ((bin === "rg" || bin === "grep") && args.some((a) => a === "--" || /^(-f|--file|--ignore-file|--exclude-from|--include-from)(=|$)/.test(a))) return null;
  return { bin: bin!, args };
}

// ---------------------------------------------------------------------------------------------------------
// Workspace confinement: whatever the agent points ask_jev at is sent to a third party, so keep it in the cwd
// and away from files that look like credentials.
// ---------------------------------------------------------------------------------------------------------

const SECRET_SEGMENT = [
  /^\.(ssh|aws|gnupg|git)$/i,
  /^\.env$/i,
  /^\.env\.(?!example$|sample$|template$|dist$).+/i,
  /\.(pem|key|p12|pfx|jks|keystore|ppk)$/i,
  /^id_(rsa|dsa|ecdsa|ed25519)/i,
  /^\.(npmrc|netrc|pypirc|git-credentials)$/i,
  /^(auth|credentials|secrets?)\.(json|ya?ml|toml)$/i,
];

/** True when any segment of a workspace-relative path looks like a credential file or directory. */
export function isSecretPath(rel: string): boolean {
  return rel.split(/[\\/]/).some((seg) => seg !== "" && SECRET_SEGMENT.some((re) => re.test(seg)));
}

const realOrSelf = (p: string): string => {
  try {
    return fs.realpathSync(p);
  } catch {
    return p;
  }
};

/** Resolves `p` against `cwd` (following symlinks) and throws unless it stays inside the workspace and is not secret. */
export function confine(cwd: string, p: string): string {
  const root = realOrSelf(path.resolve(cwd));
  const real = realOrSelf(path.resolve(root, p));
  const rel = path.relative(root, real);
  if (rel === "") return real;
  if (rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) throw new Error(`${p} is outside the workspace`);
  if (isSecretPath(rel)) throw new Error(`${p} looks like a secret file`);
  return real;
}

const PATHISH = /[\\/]|^~|^\.\.$|^[a-zA-Z]:/;

/**
 * Every path argument must stay inside the workspace and not look like a credential. For git, only path-like args
 * (revs such as `HEAD~2` are fine); for everything else every positional arg counts, so a bare `.env` is caught.
 * `--flag=value` values are checked when path-like.
 */
export function checkCommandPaths(parsed: { bin: string; args: string[] }, cwd: string): void {
  const { bin, args } = parsed;
  // grep/rg: the first positional is the search pattern, not a path (unless given with -e/--regexp).
  let skipPattern = (bin === "grep" || bin === "rg") && !args.some((a) => /^(-e|--regexp)(=|$)/.test(a));
  for (const arg of args) {
    let v = arg;
    let positional = true;
    if (v.startsWith("-")) {
      const i = v.indexOf("=");
      if (i < 0) continue;
      v = v.slice(i + 1);
      positional = false;
    } else if (skipPattern) {
      skipPattern = false;
      continue;
    }
    if (v && ((positional && bin !== "git") || PATHISH.test(v))) confine(cwd, v);
  }
}

/** Appended after the user's args so they win over any `--glob`/`--include` the agent adds. */
function secretExcludes(bin: string): string[] {
  if (bin === "rg") return [".env", ".env.*", "*.pem", "*.key", "id_rsa*", "id_ed25519*", ".npmrc", ".netrc", "auth.json", ".ssh", ".aws", ".git-credentials"].flatMap((g) => ["--glob", `!${g}`]);
  if (bin === "grep") {
    return [".env", ".env.*", "*.pem", "*.key", "id_rsa*", "id_ed25519*", ".npmrc", ".netrc", "auth.json", ".git-credentials"]
      .map((g) => `--exclude=${g}`)
      .concat(["--exclude-dir=.ssh", "--exclude-dir=.aws", "--exclude-dir=.git"]);
  }
  return [];
}

function runReadOnly(command: string, cwd: string, signal?: AbortSignal): Promise<string> {
  const parsed = parseReadOnlyCommand(command);
  if (!parsed) return Promise.reject(new Error("command is not an allowed read-only command (no pipes, redirects or write operations)"));
  try {
    checkCommandPaths(parsed, cwd);
  } catch (err) {
    return Promise.reject(err);
  }
  return new Promise((resolve, reject) => {
    execFile(parsed.bin, [...parsed.args, ...secretExcludes(parsed.bin)], { cwd, timeout: 15_000, maxBuffer: MAX_FILE_BYTES, signal, windowsHide: true }, (err, stdout, stderr) => {
      if (err && !stdout) reject(new Error(String(stderr || err.message).slice(0, 300)));
      else resolve(String(stdout));
    });
  });
}

interface AskQuestionInput {
  type: "noul" | "choice" | "score";
  instructions: string;
  true_means?: string;
  false_means?: string;
  options?: Record<string, string>;
  levels?: string[];
}

/** Validates the tool's question map and converts it to the API shape. Throws a readable Error. */
export function toApiQuestions(input: Record<string, AskQuestionInput>): Record<string, Question> {
  const names = Object.keys(input ?? {});
  if (names.length === 0) throw new Error("questions is empty");
  const out: Record<string, Question> = {};
  for (const name of names) {
    const q = input[name]!;
    if (!q || typeof q.instructions !== "string" || !q.instructions.trim()) throw new Error(`question "${name}" needs instructions`);
    if (q.type === "noul") {
      const criteria = q.true_means || q.false_means ? { true: q.true_means, false: q.false_means } : undefined;
      out[name] = { type: "noul", instructions: q.instructions, ...(criteria ? { criteria } : {}) };
    } else if (q.type === "choice") {
      const keys = Object.keys(q.options ?? {});
      if (keys.length < 2 || keys.length > 255) throw new Error(`choice question "${name}" needs 2-255 options`);
      out[name] = { type: "choice", instructions: q.instructions, criteria: q.options! };
    } else if (q.type === "score") {
      if (!Array.isArray(q.levels) || q.levels.length < 2 || q.levels.length > 10) throw new Error(`score question "${name}" needs 2-10 levels`);
      out[name] = { type: "score", instructions: q.instructions, criteria: q.levels };
    } else {
      throw new Error(`question "${name}" has unknown type "${String((q as any).type)}"`);
    }
  }
  return out;
}

/** One line per answer, with the numbers the agent needs to apply its own threshold. */
export function formatAnswers(answers: Record<string, Answer>): string {
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  return Object.entries(answers)
    .map(([name, a]) => {
      if (a.type === "noul") return `${name}: p(yes)=${a.noul.toFixed(3)} (${a.noul >= 0.5 ? "leans yes" : "leans no"})`;
      if (a.type === "choice") {
        const probs = Object.entries(a.probabilities).sort((x, y) => y[1] - x[1]).slice(0, 5).map(([k, v]) => `${k}=${pct(v)}`).join(", ");
        return `${name}: ${a.choice} (confidence ${pct(a.confidence)}; ${probs})`;
      }
      const near = Math.round(a.score);
      const label = a.legend?.[String(near)];
      return `${name}: score ${a.score.toFixed(2)}${label ? ` (~"${typeof label === "string" ? label : JSON.stringify(label)}")` : ""}, confidence ${pct(a.confidence)}`;
    })
    .join("\n");
}

/** A file sent to Jev (mirrored): bytes sent, plus a short preview for the transcript card. */
export interface SourceFile {
  path: string;
  bytes: number;
  preview: string;
  /** True when `preview` is shorter than what was sent. */
  truncated: boolean;
}

/** Command output sent to Jev (mirrored). */
export interface SourceCommand {
  command: string;
  bytes: number;
  preview: string;
  truncated: boolean;
}

/** What went into an ask_jev call, as stored in the tool result `details` (mirrored). */
export interface AskSources {
  stateChars: number;
  files: SourceFile[];
  command?: SourceCommand;
}

const preview = (text: string): { preview: string; truncated: boolean } =>
  text.length > PREVIEW_CHARS ? { preview: text.slice(0, PREVIEW_CHARS), truncated: true } : { preview: text, truncated: false };

/** Context the agent didn't have to read: file + command bytes / 4 (state doesn't count, the agent wrote it). */
export function estimateSavedTokens(sources: AskSources): number {
  const bytes = sources.files.reduce((n, f) => n + f.bytes, 0) + (sources.command?.bytes ?? 0);
  return Math.round(bytes / 4);
}

/** Usage-log view of the sources: sizes only, no previews. */
export function usageSources(sources: AskSources): UsageSources {
  return {
    stateChars: sources.stateChars,
    files: sources.files.map((f) => ({ path: f.path, bytes: f.bytes })),
    ...(sources.command ? { commandBytes: sources.command.bytes } : {}),
  };
}

export function questionCounts(questions: Record<string, Question>): { noul: number; choice: number; score: number } {
  const out = { noul: 0, choice: 0, score: 0 };
  for (const q of Object.values(questions)) out[q.type] += 1;
  return out;
}

export async function readFiles(files: string[], cwd: string): Promise<{ contents: Record<string, string>; sources: SourceFile[] }> {
  const contents: Record<string, string> = {};
  const sources: SourceFile[] = [];
  let total = 0;
  for (const f of files) {
    const abs = confine(cwd, f);
    const buf = await fs.promises.readFile(abs);
    if (buf.includes(0)) throw new Error(`${f} looks binary`);
    const text = buf.subarray(0, MAX_FILE_BYTES).toString("utf8");
    total += text.length;
    if (total > MAX_TOTAL_BYTES) throw new Error("files exceed the 400 KB total limit");
    contents[f] = text + (buf.length > MAX_FILE_BYTES ? "\n…[truncated]" : "");
    sources.push({ path: f, bytes: Math.min(buf.length, MAX_FILE_BYTES), ...preview(text) });
  }
  return { contents, sources };
}

const questionTypes = (questions: Record<string, Question> | undefined): Record<string, Question["type"]> =>
  Object.fromEntries(Object.entries(questions ?? {}).map(([name, q]) => [name, q.type]));

const QUESTION_SCHEMA = {
  type: "object",
  properties: {
    type: { type: "string", enum: ["noul", "choice", "score"], description: "noul = yes/no probability, choice = pick one option, score = rate on ordered levels" },
    instructions: { type: "string", description: "The question, or the statement to evaluate" },
    true_means: { type: "string", description: "noul only: what counts as yes" },
    false_means: { type: "string", description: "noul only: what counts as no" },
    options: { type: "object", additionalProperties: { type: "string" }, description: "choice only: option name -> when it applies (2-255 options)" },
    levels: { type: "array", items: { type: "string" }, description: "score only: ordered level descriptions, lowest first (2-10)" },
  },
  required: ["type", "instructions"],
} as const;

// ---------------------------------------------------------------------------------------------------------
// ask_jev execution (single call and `items` batch)
// ---------------------------------------------------------------------------------------------------------

export const MAX_BATCH_ITEMS = 40;
const BATCH_CONCURRENCY = 4;
/** Batch items keep shorter previews in `details` (up to 40 items would bloat the session file). */
const BATCH_PREVIEW_CHARS = 512;

/** One unit of content: the whole call in single mode, one entry of `items` in batch mode. */
export interface AskItem {
  id?: string;
  state?: string;
  files?: string[];
  command?: string;
}

export type OneResult =
  | {
      ok: true;
      answers: Record<string, Answer>;
      inputTokens: number;
      outputTokens: number;
      ms: number;
      model: string;
      sources: AskSources;
      savedTokensEst: number;
      confidence: Record<string, number>;
    }
  | { ok: false; error: string; errorKind: ErrorKind; ms: number; sources?: AskSources; savedTokensEst?: number };

/** Calls left under the daily cap (Infinity when uncapped). */
export function remainingCalls(settings: Settings, now: number = Date.now(), env: Env = process.env): number {
  const cap = settings.maxCallsPerDay;
  return cap > 0 ? Math.max(0, cap - callsMadeToday(now, env)) : Infinity;
}

/** Maps with at most `limit` in flight; results keep input order. `fn` must not throw. */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
  /** When `signal` aborts, items not yet started get `onSkip(item, index)` instead of running `fn`. */
  abort?: { signal?: AbortSignal; onSkip: (item: T, index: number) => R },
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++;
      out[i] = abort?.signal?.aborted ? abort.onSkip(items[i]!, i) : await fn(items[i]!, i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

const shrinkSources = (s: AskSources, n: number): AskSources => ({
  ...s,
  files: s.files.map((f) => (f.preview.length > n ? { ...f, preview: f.preview.slice(0, n), truncated: true } : f)),
  ...(s.command && s.command.preview.length > n ? { command: { ...s.command, preview: s.command.preview.slice(0, n), truncated: true } } : {}),
});

interface RunContext {
  settings: Settings;
  questions: Record<string, Question>;
  cwd: string;
  signal?: AbortSignal;
  /** Shared usage-record fields (sessionId, toolCallId, cwd). */
  meta: UsageMeta;
  previewChars?: number;
}

/** Gathers one item's content, asks Jev, and logs the attempt (callJev logs its own; local refusals are logged here). */
export async function runOne(item: AskItem, rc: RunContext): Promise<OneResult> {
  const started = Date.now();
  const { settings, questions, cwd, signal, meta } = rc;
  if (signal?.aborted) return { ok: false, error: "Aborted", errorKind: "aborted", ms: 0 };
  const logLocal = (error: string, errorKind: ErrorKind, ms: number, sources?: AskSources): void =>
    logUsage({
      ts: started, feature: "ask_jev", model: settings.model, inputTokens: 0, outputTokens: 0, ms, ok: false, error, errorKind,
      ...meta,
      questions: questionCounts(questions),
      ...(sources ? { sources: usageSources(sources), savedTokensEst: estimateSavedTokens(sources) } : {}),
    });
  const refuse = (error: string, errorKind: ErrorKind): OneResult => {
    const ms = Date.now() - started;
    logLocal(error, errorKind, ms);
    return { ok: false, error, errorKind, ms };
  };

  if (typeof item !== "object" || item === null || Array.isArray(item)) return refuse("Item must be an object with state, files and/or command.", "invalid");
  const state: Record<string, unknown> = {};
  const gathered: AskSources = { stateChars: 0, files: [] };
  try {
    if (typeof item.state === "string" && item.state) {
      state.content = item.state;
      gathered.stateChars = item.state.length;
    }
    if (Array.isArray(item.files) && item.files.length) {
      const read = await readFiles(item.files, cwd);
      state.files = read.contents;
      gathered.files = read.sources;
    }
    if (typeof item.command === "string" && item.command) {
      const output = await runReadOnly(item.command, cwd, signal);
      state.command_output = { command: item.command, output };
      gathered.command = { command: item.command, bytes: Buffer.byteLength(output, "utf8"), ...preview(output) };
    }
  } catch (err) {
    if (signal?.aborted) return { ok: false, error: "Aborted", errorKind: "aborted", ms: Date.now() - started };
    return refuse(`Could not gather content: ${err instanceof Error ? err.message : String(err)}`, "gather");
  }
  if (Object.keys(state).length === 0) return refuse("Give at least one of: state, files, command.", "invalid");
  const sources = rc.previewChars ? shrinkSources(gathered, rc.previewChars) : gathered;

  const savedTokensEst = estimateSavedTokens(sources);
  const result = await callJev({
    settings,
    feature: "ask_jev",
    state,
    questions,
    signal,
    meta: { ...meta, questions: questionCounts(questions), sources: usageSources(sources), savedTokensEst },
  });
  if (!result.ok) {
    // The daily cap is logged here; a paused breaker is not (it would only repeat the failures that opened it).
    const error = `Jev call failed: ${result.error}`;
    if (!result.logged && result.errorKind === "cap") logLocal(error, "cap", result.ms, sources);
    return { ok: false, error, errorKind: result.errorKind, ms: result.ms, sources, savedTokensEst };
  }
  const confidence: Record<string, number> = {};
  for (const [name, a] of Object.entries(result.answers)) {
    const c = answerConfidence(a);
    if (c !== null) confidence[name] = Math.round(c * 1000) / 1000;
  }
  return { ok: true, answers: result.answers, inputTokens: result.inputTokens, outputTokens: result.outputTokens, ms: result.ms, model: result.model, sources, savedTokensEst, confidence };
}

const ASK_DESCRIPTION =
  "Ask Jev, a fast typed classifier, yes/no, pick-one or rate-on-levels questions about content; it returns probabilities, not prose. " +
  "Pass RAW material: `files` (paths, read for you), `command` (read-only, e.g. `git diff -- src/a.ts`) or `state` text. " +
  "File and command output goes straight to Jev and never enters your context, so never pass your own summary of it. " +
  "Put all your questions in one call. For many files or commands use `items` (max 40, each counts against the daily cap): the same questions run on every item. " +
  "Use it for verdicts over large content: classify, rate risk, \"is this X\", sort many files or diffs into groups. " +
  "Don't ask what you already know; if you must read the content anyway, just read it. " +
  "Answers are hints: apply your own threshold and open near-50/50 or high-risk items yourself. " +
  "Example, per-file risk: questions={risk:{type:\"score\",instructions:\"How risky is this diff?\",levels:[\"trivial\",\"moderate\",\"high\"]}}, " +
  "items=[{id:\"a.ts\",command:\"git diff -- src/a.ts\"},{id:\"b.ts\",command:\"git diff -- src/b.ts\"}].";

const ASK_SNIPPET = "ask_jev: typed verdicts (yes/no, pick one, rate) from Jev over RAW files or command output without reading them; `items` batches up to 40";

const ASK_GUIDELINES = [
  "Use ask_jev instead of reading when you only need a verdict on large content: classify, rate risk, check \"is this X\", sort many files or diffs into groups.",
  "Pass raw material to ask_jev: `files` or `command` (e.g. `git diff -- path`), never your own summary of it.",
  "Put every question in one ask_jev call; use `items` to run the same questions over many files or commands.",
  "Don't ask Jev what you already know. If you need to read the content anyway, just read it.",
  "Treat ask_jev answers as hints: apply your own threshold, and open anything near 50/50 or high risk yourself.",
];

const ITEM_SCHEMA = {
  type: "object",
  properties: {
    id: { type: "string", description: "Label echoed in the results (defaults to the item number)" },
    state: { type: "string", description: "Text content for this item" },
    files: { type: "array", items: { type: "string" }, description: "File paths (relative to cwd) for this item" },
    command: { type: "string", description: "Read-only command whose output is this item's content" },
  },
} as const;

const ASK_PARAMETERS = {
  type: "object",
  properties: {
    questions: { type: "object", additionalProperties: QUESTION_SCHEMA, description: "Named questions; answers come back under the same names" },
    state: { type: "string", description: "Content the questions refer to" },
    files: { type: "array", items: { type: "string" }, description: "File paths (relative to cwd) to include as content" },
    command: { type: "string", description: "Read-only command whose output is included as content (no pipes or redirects)" },
    items: {
      type: "array",
      items: ITEM_SCHEMA,
      maxItems: MAX_BATCH_ITEMS,
      description: `Batch mode (max ${MAX_BATCH_ITEMS}): run the same questions over each item. Use either items or top-level state/files/command`,
    },
  },
  required: ["questions"],
} as const;

// ---------------------------------------------------------------------------------------------------------
// Extension entry
// ---------------------------------------------------------------------------------------------------------

export default function (pi: ExtensionAPI) {
  // Compaction advice: the context of the newest finished turn, kept so Hive can ask us to compact it.
  let lastCtx: any = null;
  let lastEvaluated = "";
  let inflight = false;

  pi.on("turn_end", async (event: any, ctx: any) => {
    lastCtx = ctx;
    try {
      const settings = loadSettings();
      if (!settings?.compact.enabled || inflight) return;
      if (!turnEndedForUser(event)) return;
      const entryId = String(event.messageEntryId ?? "");
      if (!entryId || entryId === lastEvaluated) return;
      const usage = ctx.getContextUsage?.();
      if (!usage || usage.tokens == null || !usage.contextWindow) return;
      const pct = (usage.tokens / usage.contextWindow) * 100;
      if (pct < settings.compact.floorPct) return;

      const recent = buildRecentMessages(ctx.sessionManager.getBranch());
      if (recent.length < 2) return;
      inflight = true;
      lastEvaluated = entryId;
      const result = await callJev({
        settings,
        feature: "compact",
        state: { situation: "A coding-agent chat. The assistant just finished its turn and is waiting for the user.", recent_messages: recent, context_used_percent: Math.round(pct) },
        questions: COMPACTION_QUESTIONS,
      });
      if (!result.ok) return;
      const signals = extractSignals(result.answers);
      if (!signals) return;
      pi.events.emit(TO_GUI, { kind: "jev_advice", entryId, at: Date.now(), usagePct: pct, tokens: usage.tokens, contextWindow: usage.contextWindow, signals });
    } catch {
      // Advice is best-effort.
    } finally {
      inflight = false;
    }
  });

  pi.events.on(FROM_GUI, (data: any) => {
    if (data?.kind !== "jev_compact" || !lastCtx) return;
    try {
      lastCtx.compact(typeof data.instructions === "string" && data.instructions ? { customInstructions: data.instructions } : undefined);
    } catch {}
  });

  // ask_jev is only offered when a key is configured and the feature is on (re-checked on every call).
  const initial = loadSettings();
  if (initial?.askJev.enabled) {
    pi.registerTool({
      name: "ask_jev",
      label: "Ask Jev",
      description: ASK_DESCRIPTION,
      promptSnippet: ASK_SNIPPET,
      promptGuidelines: ASK_GUIDELINES,
      parameters: ASK_PARAMETERS as any,
      async execute(toolCallId: string, params: any, signal: AbortSignal | undefined, _onUpdate: unknown, ctx: any) {
        const started = Date.now();
        const cwd: string = ctx?.cwd ?? process.cwd();
        let sessionId: string | undefined;
        try {
          const id = ctx?.sessionManager?.getSessionId?.();
          if (typeof id === "string" && id) sessionId = id;
        } catch {}
        const meta: UsageMeta = { ...(sessionId ? { sessionId } : {}), ...(toolCallId ? { toolCallId } : {}), cwd };
        let questions: Record<string, Question> | undefined;
        const settings = loadSettings();
        // `log`: record refusals that never reached runOne so error rates see them.
        const fail = (text: string, errorKind: ErrorKind, log = false, extra: Record<string, unknown> = {}): any => {
          if (log && settings) {
            logUsage({
              ts: started, feature: "ask_jev", model: settings.model, inputTokens: 0, outputTokens: 0, ms: Date.now() - started, ok: false, error: text, errorKind,
              ...meta,
              ...(questions ? { questions: questionCounts(questions) } : {}),
            });
          }
          return { content: [{ type: "text" as const, text }], details: { error: text, errorKind, ...(questions ? { questions: questionTypes(questions) } : {}), ...extra }, isError: true };
        };
        if (!settings?.askJev.enabled) return fail("ask_jev is disabled or no Jev API key is configured (Hive → Settings → AI Providers).", "disabled");

        const batch = params?.items !== undefined && params?.items !== null;
        try {
          questions = toApiQuestions(params.questions);
        } catch (err) {
          return fail(err instanceof Error ? err.message : String(err), "invalid", true);
        }
        const rc: RunContext = { settings, questions, cwd, signal, meta };

        if (!batch) {
          const r = await runOne(params, rc);
          if (!r.ok) {
            return fail(r.error, r.errorKind, false, r.sources ? { sources: r.sources, savedTokensEst: r.savedTokensEst } : {});
          }
          return {
            content: [{ type: "text" as const, text: `${formatAnswers(r.answers)}\n(${r.inputTokens} input tokens, ${r.ms} ms)` }],
            details: {
              answers: r.answers,
              inputTokens: r.inputTokens,
              outputTokens: r.outputTokens,
              ms: r.ms,
              model: r.model,
              questions: questionTypes(questions),
              sources: r.sources,
              savedTokensEst: r.savedTokensEst,
              confidence: r.confidence,
            },
          };
        }

        // ---- batch ----
        const items: unknown = params.items;
        if (!Array.isArray(items) || items.length === 0) return fail("items must be a non-empty array.", "invalid", true);
        if (items.length > MAX_BATCH_ITEMS) return fail(`Too many items: ${items.length} (max ${MAX_BATCH_ITEMS} per call). Split into several calls.`, "invalid", true);
        if ((typeof params.state === "string" && params.state) || (Array.isArray(params.files) && params.files.length) || (typeof params.command === "string" && params.command)) {
          return fail("Use either items or top-level state/files/command, not both.", "invalid", true);
        }
        const remaining = remainingCalls(settings, started);
        if (remaining < items.length) {
          return fail(`Daily Jev call limit: ${remaining} call${remaining === 1 ? "" : "s"} left today but the batch has ${items.length} items (each counts). Send fewer items.`, "cap", true);
        }

        const ids = (items as any[]).map((it, i) => (typeof it?.id === "string" && it.id ? it.id : String(i + 1)));
        const results = await mapLimit(items as AskItem[], BATCH_CONCURRENCY, async (item): Promise<OneResult> => {
          try {
            return await runOne(item, { ...rc, previewChars: BATCH_PREVIEW_CHARS });
          } catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : String(err), errorKind: "api", ms: 0 };
          }
        }, { signal, onSkip: (): OneResult => ({ ok: false, error: "Aborted", errorKind: "aborted", ms: 0 }) });

        const blocks = results.map((r, i) => (r.ok ? `[${ids[i]}] ${formatAnswers(r.answers).replace(/\n/g, "\n    ")}` : `[${ids[i]}] FAILED (${r.errorKind}): ${r.error}`));
        const okResults = results.filter((r): r is Extract<OneResult, { ok: true }> => r.ok);
        const failed = results.length - okResults.length;
        const inputTokens = results.reduce((n, r) => n + (r.ok ? r.inputTokens : 0), 0);
        const outputTokens = results.reduce((n, r) => n + (r.ok ? r.outputTokens : 0), 0);
        const ms = Date.now() - started;
        const text = `${blocks.join("\n\n")}\n(${results.length} items${failed ? `, ${failed} failed` : ""}, ${inputTokens} input tokens, ${ms} ms)`;
        const details = {
          batch: results.map((r, i) =>
            r.ok
              ? { id: ids[i], answers: r.answers, inputTokens: r.inputTokens, outputTokens: r.outputTokens, ms: r.ms, sources: r.sources, savedTokensEst: r.savedTokensEst, confidence: r.confidence }
              : { id: ids[i], error: r.error, errorKind: r.errorKind, inputTokens: 0, outputTokens: 0, ms: r.ms, ...(r.sources ? { sources: r.sources, savedTokensEst: r.savedTokensEst } : {}) },
          ),
          inputTokens,
          outputTokens,
          ms,
          model: okResults[0]?.model ?? settings.model,
          questions: questionTypes(questions),
          savedTokensEst: okResults.reduce((n, r) => n + r.savedTokensEst, 0),
        };
        return { content: [{ type: "text" as const, text }], details, ...(okResults.length === 0 ? { isError: true } : {}) };
      },
    });
  }
}
