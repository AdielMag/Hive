/** Turns a raw provider/Pi error into one plain-language line, plus an optional suggested action. Pure. */
export interface ErrorSummary {
  headline: string;
  action?: "compact" | "retry";
}

const RULES: Array<[RegExp, ErrorSummary]> = [
  [
    /context[\s_-]*(length|window)|too many tokens|prompt is too long|prompt too long|maximum context|exceeds? the (context|maximum)/i,
    { headline: "This conversation is too long for the model", action: "compact" },
  ],
  [/(^|\D)529(\D|$)|overloaded/i, { headline: "The provider is overloaded — try again shortly", action: "retry" }],
  [/(^|\D)429(\D|$)|rate[\s_-]*limit|too many requests/i, { headline: "Rate limit reached — wait a moment and try again", action: "retry" }],
  [/ECONNREFUSED|ENOTFOUND|fetch failed|network (error|request)|\bnetwork\b|ECONNRESET|ETIMEDOUT/i, { headline: "Can't reach the provider — check your connection", action: "retry" }],
  [
    /(^|\D)40[13](\D|$)|invalid[\s_-]*(x-)?api[\s_-]*key|unauthorized|forbidden/i,
    { headline: "Authentication failed — sign in again in Settings › AI Providers" },
  ],
];

export function summarizeError(raw: string): ErrorSummary {
  for (const [re, out] of RULES) if (re.test(raw)) return { ...out };
  const first = raw.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  return { headline: first.length > 160 ? `${first.slice(0, 159).trimEnd()}…` : first };
}
