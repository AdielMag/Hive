/**
 * Contracts for the "insights" features: subscription quota windows and historical usage analytics.
 * Pure data types only; shared by main (producers) and renderer (consumers).
 */

/** A single rate-limit window of a subscription (e.g. the rolling 5h window or the weekly window). */
export interface QuotaWindow {
  /** Stable id within the provider (e.g. "5h", "weekly", "weekly_opus", "gemini-5h"). */
  id: string;
  /** Human label ("5-hour", "Weekly", "Weekly · Opus"). */
  label: string;
  /** Normalized window kind, used for grouping/sorting in the UI. */
  kind: "5h" | "weekly" | "other";
  /** Percent of the window already used, 0..100. */
  usedPercent: number;
  /** Epoch ms at which the window resets, when known. */
  resetsAt?: number;
}

/** A group of windows that share a pool (Antigravity has "Gemini models" and "Claude and GPT models"). */
export interface QuotaGroup {
  id: string;
  label: string;
  description?: string;
  windows: QuotaWindow[];
}

export type QuotaSource = "live" | "cache";

export interface ProviderQuota {
  providerId: string;
  /** Display name ("Anthropic Claude", "Google Antigravity", "OpenAI Codex"). */
  name: string;
  /** Account label if known (e-mail). */
  account?: string;
  /** Plan label if known ("Max", "Pro"...). */
  plan?: string;
  status: "ok" | "error" | "unsupported";
  error?: string;
  source: QuotaSource;
  /** Epoch ms of the observation. */
  fetchedAt: number;
  groups: QuotaGroup[];
}

export interface QuotaSnapshot {
  providers: ProviderQuota[];
  fetchedAt: number;
}

/**
 * One aggregated usage bucket: all assistant turns on a given local day for a provider/model/project.
 * Main ships these compact buckets; the renderer slices them by range and dimension.
 */
export interface UsageBucket {
  /** Local calendar day, YYYY-MM-DD. */
  day: string;
  /** Local hour of day, 0..23. */
  hour: number;
  provider: string;
  model: string;
  /** Working directory the session ran in. */
  cwd: string;
  turns: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  /** USD. */
  cost: number;
}

export interface UsageReport {
  buckets: UsageBucket[];
  /** Number of session files scanned. */
  sessionFiles: number;
  /** For every session with at least one assistant turn: the local days it was active on. */
  sessionDays: string[][];
  generatedAt: number;
  /** ms spent building the report (diagnostics). */
  scanMs: number;
}
