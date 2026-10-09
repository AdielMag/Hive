/**
 * Pure view model for the ask_jev transcript card: reads the tool call's arguments (always present, possibly still
 * streaming) and its result `details` (absent for running calls, minimal for calls made before the rich details
 * existed) into what JevToolCard renders.
 */
import { JEV_PRICE_PER_MTOK_USD, type AskJevDetails, type AskSources, type JevAnswer, type JevErrorKind, type JevQuestionType } from "../shared.ts";

export interface CardQuestion {
  name: string;
  type: JevQuestionType | "unknown";
  instructions: string;
  trueMeans?: string;
  falseMeans?: string;
  /** choice: [option, description] in the order the agent wrote them. */
  options?: Array<[string, string]>;
  /** score: level descriptions, lowest first. */
  levels?: string[];
}

export interface CardAnswer {
  name: string;
  answer: JevAnswer;
  question?: CardQuestion;
  /** 0.5-1 for yes/no, the API's confidence otherwise. */
  confidence: number | null;
}

/** One item of a batch call (`items` argument zipped with `details.batch`). */
export interface CardItem {
  id: string;
  files: string[];
  command?: string;
  state?: string;
  sources?: AskSources;
  /** "pending" until the result carries `details.batch`. */
  status: "pending" | "done" | "error";
  answers: CardAnswer[];
  error?: string;
  errorKind?: JevErrorKind;
  ms?: number;
}

export type CardStatus = "running" | "error" | "done";
export type CardTab = "in" | "out" | "raw";

export interface CardModel {
  status: CardStatus;
  questions: CardQuestion[];
  state?: string;
  files: string[];
  command?: string;
  sources?: AskSources;
  answers: CardAnswer[];
  /** True for `items` calls; then `items` holds the per-item view and `answers` is empty. */
  batch: boolean;
  items: CardItem[];
  /** Batch items that failed. */
  failedItems: number;
  details: AskJevDetails | null;
  error?: string;
  ms?: number;
  /** Tabs to offer, in order. */
  tabs: CardTab[];
  defaultTab: CardTab;
}

const rec = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);
const QTYPES = new Set(["noul", "choice", "score"]);

export function parseQuestions(args: Record<string, unknown>): CardQuestion[] {
  return Object.entries(rec(args.questions)).map(([name, raw]) => {
    const q = rec(raw);
    const type = typeof q.type === "string" && QTYPES.has(q.type) ? (q.type as JevQuestionType) : "unknown";
    const out: CardQuestion = { name, type, instructions: typeof q.instructions === "string" ? q.instructions : "" };
    if (str(q.true_means)) out.trueMeans = q.true_means as string;
    if (str(q.false_means)) out.falseMeans = q.false_means as string;
    const options = Object.entries(rec(q.options)).map(([k, v]) => [k, typeof v === "string" ? v : ""] as [string, string]);
    if (options.length) out.options = options;
    if (Array.isArray(q.levels)) out.levels = q.levels.map((l) => (typeof l === "string" ? l : JSON.stringify(l)));
    return out;
  });
}

function isAnswer(v: unknown): v is JevAnswer {
  const a = rec(v);
  if (a.type === "noul") return typeof a.noul === "number";
  if (a.type === "choice") return typeof a.choice === "string";
  if (a.type === "score") return typeof a.score === "number";
  return false;
}

export function confidenceOf(a: JevAnswer): number | null {
  if (a.type === "noul") return Number.isFinite(a.noul) ? Math.max(a.noul, 1 - a.noul) : null;
  return typeof a.confidence === "number" && Number.isFinite(a.confidence) ? a.confidence : null;
}

/** Null when there is nothing structured (no details, or details that aren't an object). */
export function readDetails(v: unknown): AskJevDetails | null {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
  return v as AskJevDetails;
}

function toCardAnswers(raw: unknown, confidence: unknown, byName: Map<string, CardQuestion>): CardAnswer[] {
  const conf = rec(confidence);
  return Object.entries(rec(raw))
    .filter(([, a]) => isAnswer(a))
    .map(([name, a]) => {
      const answer = a as JevAnswer;
      const stored = conf[name];
      return { name, answer, question: byName.get(name), confidence: typeof stored === "number" ? stored : confidenceOf(answer) };
    });
}

function buildItems(args: Record<string, unknown>, details: AskJevDetails | null, byName: Map<string, CardQuestion>): CardItem[] {
  const argItems = Array.isArray(args.items) ? args.items : [];
  const results = Array.isArray(details?.batch) ? details.batch : [];
  return Array.from({ length: Math.max(argItems.length, results.length) }, (_, i) => {
    const a = rec(argItems[i]);
    const r = rec(results[i]);
    const hasResult = results[i] !== undefined;
    const sources = r.sources && typeof r.sources === "object" ? (r.sources as AskSources) : undefined;
    const error = str(r.error);
    return {
      id: str(r.id) ?? str(a.id) ?? String(i + 1),
      files: Array.isArray(a.files) ? a.files.filter((f): f is string => typeof f === "string") : [],
      command: str(a.command),
      state: str(a.state),
      sources,
      status: !hasResult ? "pending" : error ? "error" : "done",
      answers: toCardAnswers(r.answers, r.confidence, byName),
      error,
      errorKind: str(r.errorKind) as JevErrorKind | undefined,
      ms: typeof r.ms === "number" ? r.ms : undefined,
    } satisfies CardItem;
  });
}

export function buildCardModel(input: {
  arguments: Record<string, unknown>;
  running: boolean;
  complete: boolean;
  result?: { text: string; isError: boolean; details?: unknown };
  run?: { startedAt?: number; endedAt?: number };
}): CardModel {
  const args = input.arguments ?? {};
  const questions = parseQuestions(args);
  const byName = new Map(questions.map((q) => [q.name, q]));
  const details = input.result ? readDetails(input.result.details) : null;
  const status: CardStatus = !input.result ? "running" : input.result.isError ? "error" : "done";

  const answers = toCardAnswers(details?.answers, details?.confidence, byName);
  const batch = Array.isArray(args.items) || Array.isArray(details?.batch);
  const items = batch ? buildItems(args, details, byName) : [];
  const failedItems = items.filter((it) => it.status === "error").length;

  const sources = details?.sources && typeof details.sources === "object" ? details.sources : undefined;
  const ms =
    typeof details?.ms === "number"
      ? details.ms
      : input.run?.startedAt && input.run.endedAt
        ? input.run.endedAt - input.run.startedAt
        : undefined;

  let tabs: CardTab[];
  if (status === "running") tabs = ["in", "raw"];
  else if (!details) tabs = ["raw"];
  else if (batch) tabs = items.some((it) => it.status !== "pending") ? ["in", "out", "raw"] : ["in", "raw"];
  else tabs = answers.length ? ["in", "out", "raw"] : ["in", "raw"];
  const defaultTab: CardTab = tabs.includes("out") ? "out" : tabs[0]!;

  const error =
    status === "error"
      ? (str(details?.error) ?? (batch && items.length ? `all ${items.length} items failed` : input.result?.text))
      : undefined;
  return {
    status,
    questions,
    state: str(args.state),
    files: Array.isArray(args.files) ? args.files.filter((f): f is string => typeof f === "string") : [],
    command: str(args.command),
    sources,
    answers,
    batch,
    items,
    failedItems,
    details,
    error,
    ms,
    tabs,
    defaultTab,
  };
}

const pct = (n: number): string => `${Math.round(n * 100)}%`;
const clipLabel = (s: string, n = 22): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Label of the score level nearest to `score`: the agent's level text, else the API legend. */
export function scoreLabel(a: Extract<JevAnswer, { type: "score" }>, levels?: string[]): string | undefined {
  const near = Math.round(a.score);
  const fromLevels = levels?.[near];
  if (fromLevels) return fromLevels;
  const legend = a.legend?.[String(near)];
  if (typeof legend === "string") return legend;
  if (legend && typeof legend === "object") {
    const l = legend as Record<string, unknown>;
    return str(l.label) ?? str(l.description) ?? str(l.name);
  }
  return undefined;
}

/** Compact chip text: "buggy 96% yes", "lang python", "severity major". */
export function answerChip(c: CardAnswer): string {
  const a = c.answer;
  if (a.type === "noul") return a.noul >= 0.5 ? `${c.name} ${pct(a.noul)} yes` : `${c.name} ${pct(1 - a.noul)} no`;
  if (a.type === "choice") return `${c.name} ${a.choice}`;
  const label = scoreLabel(a, c.question?.levels);
  return `${c.name} ${label ? clipLabel(label) : a.score.toFixed(1)}`;
}

const plural = (n: number, one: string): string => `${n} ${one}${n === 1 ? "" : "s"}`;

/** "3 questions · 2 files · git diff --stat" */
export function summaryText(m: CardModel): string {
  const parts: string[] = [];
  if (m.questions.length) parts.push(plural(m.questions.length, "question"));
  if (m.batch) {
    parts.push(plural(m.items.length, "item"));
    if (m.failedItems) parts.push(`${m.failedItems} failed`);
    return parts.join(" · ");
  }
  const files = m.sources?.files.length ?? m.files.length;
  if (files) parts.push(plural(files, "file"));
  const command = m.sources?.command?.command ?? m.command;
  if (command) parts.push(command);
  if (!files && !command && m.state) parts.push("text");
  return parts.join(" · ");
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatTokens(n: number): string {
  return n >= 10_000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

/** Estimated USD of one call: input tokens at the list price (output tokens are free). */
export function estimateCostUsd(inputTokens: number, pricePerMTok = JEV_PRICE_PER_MTOK_USD): number {
  return (inputTokens / 1_000_000) * pricePerMTok;
}

export function formatUsd(n: number): string {
  if (n === 0) return "$0";
  if (n < 0.0001) return "<$0.0001";
  return `$${n.toFixed(n < 0.01 ? 4 : 2)}`;
}

/** Sorted [option, probability] for a choice answer, falling back to the question's options. */
export function rankedChoices(a: Extract<JevAnswer, { type: "choice" }>, q?: CardQuestion): Array<[string, number]> {
  const probs = rec(a.probabilities);
  const keys = new Set<string>([...Object.keys(probs), ...(q?.options?.map(([k]) => k) ?? [])]);
  return [...keys]
    .map((k) => [k, typeof probs[k] === "number" ? (probs[k] as number) : k === a.choice ? (a.confidence ?? 1) : 0] as [string, number])
    .sort((x, y) => y[1] - x[1]);
}

/** Level labels of a score answer and the per-level probability (by index). */
export function scoreLevels(a: Extract<JevAnswer, { type: "score" }>, q?: CardQuestion): Array<{ label: string; p: number | null }> {
  const probs = rec(a.probabilities);
  const legendKeys = Object.keys(rec(a.legend)).filter((k) => /^\d+$/.test(k));
  const count = q?.levels?.length ?? (legendKeys.length || Math.max(2, Math.ceil(a.score) + 1));
  return Array.from({ length: count }, (_, i) => {
    const legend = rec(a.legend)[String(i)];
    const label = q?.levels?.[i] ?? (typeof legend === "string" ? legend : String(i));
    const p = probs[String(i)] ?? probs[label];
    return { label, p: typeof p === "number" ? p : null };
  });
}
