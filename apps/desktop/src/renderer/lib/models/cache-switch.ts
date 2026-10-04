/**
 * "Compact before your first message on a new model" advice.
 *
 * Prompt caches are per model: the first request after a mid-session model switch re-reads the whole
 * conversation with no cache hits (slower, billed at the full / cache-write rate), and every later turn
 * keeps carrying that full history. A model switch is a natural task boundary, so compacting right
 * then means the new model starts from summary + recent turns instead.
 * See https://code.claude.com/docs/en/prompt-caching#switching-models.
 *
 * Note: unlike Claude Code, Pi's summarization request does not reuse the conversation cache
 * (serialized history, `cacheRetention: "none"`), so there is no "compact on the warm old model" trick —
 * compacting on the current model is just as good.
 */
import { activePath, type AnyMessage, type TranscriptState, type UsageLike } from "@hive/pi-adapter";

/** Rough size of a Pi compaction summary. */
export const SUMMARY_TOKENS_ESTIMATE = 2_000;
/** Below this many saved tokens per request the nudge is noise. */
export const MIN_SAVED_TOKENS = 15_000;
/** Only advise when the conversation was last sent within this window (a switch "mid-session", not on reopening an old one). */
export const RECENT_RESPONSE_MS = 60 * 60_000;
/**
 * Anthropic's default prompt-cache lifetime (5 minutes, refreshed on every cache hit; the 1-hour TTL is opt-in).
 * Measured from the start of the request that last wrote/read the cache, which is what a Pi assistant
 * message's `timestamp` records. Past it the cache is cold and the next message re-reads everything uncached.
 * See https://platform.claude.com/docs/en/build-with-claude/prompt-caching#cache-lifetime.
 */
export const CACHE_TTL_MS = 5 * 60_000;
/** Hive's default `keepRecentPercent` (share of the window Pi keeps verbatim after compaction). */
export const DEFAULT_KEEP_RECENT_PERCENT = 10;
/** Hive's default ceiling on the verbatim tail (`keepRecentMaxTokens`). */
export const DEFAULT_KEEP_RECENT_MAX_TOKENS = 20_000;

export interface LastResponse {
  /** Stable identity of the message (dismissals are keyed on it). */
  key: string;
  provider: string;
  model: string;
  /** Message timestamp (ms epoch), when known. */
  at?: number;
  /** Prompt size of the first response after the last compaction ≈ system prompt + tools + first turn. */
  baselineTokens: number;
}

type AssistantMsg = AnyMessage & { provider?: string; model?: string; usage?: UsageLike; stopReason?: string };

const promptTokens = (u: UsageLike | undefined) => (u ? (u.input || 0) + (u.cacheRead || 0) + (u.cacheWrite || 0) : 0);

/**
 * The newest successful assistant response in the model context (active branch + live messages), i.e.
 * the model the conversation was last sent to. Null when there is none since the last compaction.
 */
export function lastResponse(state: TranscriptState): LastResponse | null {
  const msgs: AssistantMsg[] = [];
  for (const entry of activePath(state)) {
    if (entry.type === "compaction") msgs.length = 0;
    else if (entry.type === "message") msgs.push(entry.message as unknown as AssistantMsg);
  }
  const seen = new Set(msgs.map((m) => `${m.role}:${m.timestamp}`));
  for (const m of state.live as AssistantMsg[]) if (!seen.has(`${m.role}:${m.timestamp}`)) msgs.push(m);

  const ok = (m: AssistantMsg) =>
    m.role === "assistant" && !!m.provider && !!m.model && m.stopReason !== "aborted" && m.stopReason !== "error";
  const assistants = msgs.filter(ok);
  const last = assistants[assistants.length - 1];
  if (!last) return null;
  const first = assistants.find((m) => promptTokens(m.usage) > 0);
  return {
    key: `${last.provider}/${last.model}@${last.timestamp ?? assistants.length}`,
    provider: last.provider!,
    model: last.model!,
    ...(typeof last.timestamp === "number" ? { at: last.timestamp } : {}),
    baselineTokens: promptTokens(first?.usage),
  };
}

export interface SwitchAdvice {
  contextTokens: number;
  /** Estimated context after compaction: baseline + kept recent turns + summary. */
  afterCompactTokens: number;
  /** Tokens no longer carried by each later request (the first one on the new model would be uncached). */
  savedTokens: number;
}

export function estimateSwitchSavings(args: { contextTokens: number; baselineTokens: number; keepRecentTokens: number }): SwitchAdvice {
  const contextTokens = Math.max(0, args.contextTokens);
  const baseline = Math.min(Math.max(0, args.baselineTokens), contextTokens);
  const conversation = contextTokens - baseline;
  const kept = Math.min(conversation, Math.max(0, args.keepRecentTokens));
  const summary = conversation > kept ? Math.min(SUMMARY_TOKENS_ESTIMATE, conversation - kept) : 0;
  const afterCompactTokens = baseline + kept + summary;
  return { contextTokens, afterCompactTokens, savedTokens: Math.max(0, contextTokens - afterCompactTokens) };
}

export const isWorthCompacting = (advice: SwitchAdvice): boolean => advice.savedTokens >= MIN_SAVED_TOKENS;

export const isRecent = (last: LastResponse, now = Date.now()): boolean => last.at === undefined || now - last.at < RECENT_RESPONSE_MS;

/** True once more than {@link CACHE_TTL_MS} has passed since the conversation was last sent to the model. */
export const isCacheExpired = (last: LastResponse, now = Date.now()): boolean => last.at !== undefined && now - last.at >= CACHE_TTL_MS;

export const sameModel = (a: { provider: string; id: string } | null | undefined, provider: string, id: string) =>
  !!a && a.provider === provider && a.id === id;
