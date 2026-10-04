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

export type CallResult =
  | { ok: true; answers: Record<string, Answer>; inputTokens: number; outputTokens: number; model: string; ms: number }
  | { ok: false; error: string; status?: number; ms: number };

export interface UsageRecord {
  ts: number;
  feature: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  ms: number;
  ok: boolean;
  error?: string;
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
            if (dayKey(rec.ts) === key) callsToday += 1;
          } catch {}
        }
      }
    } catch {}
  }
  return callsToday;
}

function logUsage(rec: UsageRecord, env: Env): void {
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
}

/** POST /v1/systemone. Never throws; records every attempt in the usage log. */
export async function callJev(opts: CallOptions): Promise<CallResult> {
  const env = opts.env ?? process.env;
  const now = opts.now ?? Date.now;
  const started = now();
  const fail = (error: string, status?: number): CallResult => {
    const r: CallResult = { ok: false, error, status, ms: now() - started };
    noteResult(r, now());
    logUsage({ ts: started, feature: opts.feature, model: opts.settings.model, inputTokens: 0, outputTokens: 0, ms: r.ms, ok: false, error }, env);
    return r;
  };

  if (now() < breaker.openUntil) return { ok: false, error: "Jev paused after repeated failures", ms: 0 };
  const cap = opts.settings.maxCallsPerDay;
  if (cap > 0 && callsMadeToday(started, env) >= cap) return { ok: false, error: `Daily Jev call limit reached (${cap})`, ms: 0 };
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
      return fail(`HTTP ${res.status}${detail ? `: ${detail}` : ""}`, res.status);
    }
    const body = (await res.json()) as any;
    if (!body || typeof body.answers !== "object" || body.answers === null) return fail("Malformed response from Jev");
    const r: CallResult = {
      ok: true,
      answers: body.answers,
      inputTokens: Number(body.usage?.input_tokens) || 0,
      outputTokens: Number(body.usage?.output_tokens) || 0,
      model: typeof body.model === "string" ? body.model : opts.settings.model,
      ms: now() - started,
    };
    noteResult(r, now());
    logUsage({ ts: started, feature: opts.feature, model: r.model, inputTokens: r.inputTokens, outputTokens: r.outputTokens, ms: r.ms, ok: true }, env);
    return r;
  } catch (err) {
    const aborted = signal.aborted;
    return fail(aborted ? "Jev request timed out" : err instanceof Error ? err.message : String(err));
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

const READ_ONLY_BINS = new Set(["ls", "dir", "cat", "head", "tail", "wc", "grep", "rg", "find", "git", "pwd", "type", "tree"]);
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
    if (sub === "branch" && args.some((a) => /^-(d|D|m|M|c|C)\b|--delete|--move|--copy/.test(a))) return null;
    if (sub === "tag" && args.some((a) => !a.startsWith("-") && a !== "tag") ) return null;
    if (sub === "remote" && args.some((a) => /^(add|remove|rm|rename|set-url|prune|update)$/.test(a))) return null;
  }
  if ((bin === "find" || bin === "rg" || bin === "grep") && args.some((a) => /^(-delete|-exec|-execdir|-ok|--pre|-fprint|-fls)/.test(a))) return null;
  return { bin: bin!, args };
}

function runReadOnly(command: string, cwd: string, signal?: AbortSignal): Promise<string> {
  const parsed = parseReadOnlyCommand(command);
  if (!parsed) return Promise.reject(new Error("command is not an allowed read-only command (no pipes, redirects or write operations)"));
  return new Promise((resolve, reject) => {
    execFile(parsed.bin, parsed.args, { cwd, timeout: 15_000, maxBuffer: MAX_FILE_BYTES, signal, windowsHide: true }, (err, stdout, stderr) => {
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

async function readFiles(files: string[], cwd: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  let total = 0;
  for (const f of files) {
    const abs = path.resolve(cwd, f);
    const buf = await fs.promises.readFile(abs);
    if (buf.includes(0)) throw new Error(`${f} looks binary`);
    const text = buf.subarray(0, MAX_FILE_BYTES).toString("utf8");
    total += text.length;
    if (total > MAX_TOTAL_BYTES) throw new Error("files exceed the 400 KB total limit");
    out[f] = text + (buf.length > MAX_FILE_BYTES ? "\n…[truncated]" : "");
  }
  return out;
}

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
      description:
        "Ask Jev, a fast typed classifier, yes/no, pick-one or rate-on-levels questions about some content. " +
        "Returns probabilities, not prose. Provide the content as `state` text, `files` (paths read for you) and/or `command` " +
        "(a read-only command such as `git diff --stat`); file and command output goes straight to Jev and never enters your context. " +
        "Use it to triage big inputs cheaply (is this diff one logical change? which of these categories is this log? how risky is this change?). " +
        "Do not use it for reasoning, planning or generating text.",
      promptSnippet: "ask_jev: cheap typed classifier (yes/no probability, pick one, rate) over text, files or read-only command output",
      promptGuidelines: [
        "Use ask_jev for classification or triage of large inputs; apply your own threshold to its probabilities and verify anything important.",
      ],
      parameters: {
        type: "object",
        properties: {
          questions: { type: "object", additionalProperties: QUESTION_SCHEMA, description: "Named questions; answers come back under the same names" },
          state: { type: "string", description: "Content the questions refer to" },
          files: { type: "array", items: { type: "string" }, description: "File paths (relative to cwd) to include as content" },
          command: { type: "string", description: "Read-only command whose output is included as content (no pipes or redirects)" },
        },
        required: ["questions"],
      } as any,
      async execute(_id: string, params: any, signal: AbortSignal | undefined, _onUpdate: unknown, ctx: any) {
        const fail = (text: string): any => ({ content: [{ type: "text" as const, text }], details: { error: text }, isError: true });
        const settings = loadSettings();
        if (!settings?.askJev.enabled) return fail("ask_jev is disabled or no Jev API key is configured (Hive → Settings → Jev).");
        let questions: Record<string, Question>;
        try {
          questions = toApiQuestions(params.questions);
        } catch (err) {
          return fail(err instanceof Error ? err.message : String(err));
        }
        const cwd: string = ctx?.cwd ?? process.cwd();
        const state: Record<string, unknown> = {};
        try {
          if (typeof params.state === "string" && params.state) state.content = params.state;
          if (Array.isArray(params.files) && params.files.length) state.files = await readFiles(params.files, cwd);
          if (typeof params.command === "string" && params.command) state.command_output = { command: params.command, output: await runReadOnly(params.command, cwd, signal) };
        } catch (err) {
          return fail(`Could not gather content: ${err instanceof Error ? err.message : String(err)}`);
        }
        if (Object.keys(state).length === 0) return fail("Give at least one of: state, files, command.");

        const result = await callJev({ settings, feature: "ask_jev", state, questions, signal });
        if (!result.ok) return fail(`Jev call failed: ${result.error}`);
        return {
          content: [{ type: "text" as const, text: `${formatAnswers(result.answers)}\n(${result.inputTokens} input tokens, ${result.ms} ms)` }],
          details: { answers: result.answers, inputTokens: result.inputTokens, outputTokens: result.outputTokens, ms: result.ms },
        };
      },
    });
  }
}
