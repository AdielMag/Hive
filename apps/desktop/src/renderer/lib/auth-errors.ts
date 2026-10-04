/**
 * Recognises "your subscription login is no longer valid" failures in Pi/provider error text, so the UI can
 * offer Reconnect instead of a raw error. Pure: no store / IPC access.
 */

/** Providers that sign in through Settings → AI Providers. */
export type AuthProviderId = "anthropic" | "antigravity" | "openai";

export type AuthErrorKind = "expired" | "missing" | "refresh_failed";

export interface AuthError {
  providerId: AuthProviderId;
  kind: AuthErrorKind;
}

export const AUTH_PROVIDER_NAMES: Record<AuthProviderId, string> = {
  anthropic: "Claude",
  antigravity: "Antigravity",
  openai: "OpenAI",
};

const PROVIDER_HINTS: Array<[RegExp, AuthProviderId]> = [
  [/\b(anthropic|claude)\b/i, "anthropic"],
  [/\b(antigravity|google|cloudcode|gemini)\b/i, "antigravity"],
  [/\b(openai|chatgpt|codex)\b/i, "openai"],
];

const isAuthProvider = (id: string | undefined): id is AuthProviderId =>
  id === "anthropic" || id === "antigravity" || id === "openai";

/** Maps a Pi provider id (`google-antigravity`, `openai-codex`, …) onto a Settings account, if any. */
export function toAuthProvider(id: string | undefined | null): AuthProviderId | undefined {
  if (!id) return undefined;
  if (isAuthProvider(id)) return id;
  if (/antigravity/i.test(id)) return "antigravity";
  if (/^openai/i.test(id)) return "openai";
  if (/^anthropic/i.test(id)) return "anthropic";
  return undefined;
}

// Order matters: the first match wins. Each entry is a signal that credentials, not the request, are at fault.
const SIGNALS: Array<[RegExp, AuthErrorKind]> = [
  [/refresh(ing)?\s+(the\s+)?(oauth\s+)?token[^.\n]{0,40}(fail|error|invalid)|(fail|unable|could not|couldn't)[^.\n]{0,40}refresh[^.\n]{0,20}token|invalid_grant|token refresh failed/i, "refresh_failed"],
  [/no api key found for|not logged in|no credentials|missing credentials/i, "missing"],
  [
    /authentication failed for|re-?authenticate|\/login\b|token (has )?(expired|been revoked)|expired token|oauth token[^.\n]{0,30}(expired|invalid|revoked)|invalid (x-api-key|api key|bearer token|access token)|authentication_error|unauthorized|(?:http|status|error|code)[\s:=]*401\b|^\s*401\b|invalid_token|credentials? (may have )?(expired|are invalid)/i,
    "expired",
  ],
];

/**
 * @param message          raw error text
 * @param fallbackProvider provider of the active model/message, used when the text doesn't name one
 */
export function detectAuthError(message: string | null | undefined, fallbackProvider?: string | null): AuthError | null {
  if (!message) return null;

  const kind = SIGNALS.find(([re]) => re.test(message))?.[1];
  if (!kind) return null;

  // 1) `for "anthropic"` / `login anthropic` / `found for anthropic`
  const named = /(?:for|login|logout)\s+["']?([a-z][\w-]*)["']?/gi;
  let providerId: AuthProviderId | undefined;
  for (const m of message.matchAll(named)) {
    providerId = toAuthProvider(m[1]);
    if (providerId) break;
  }
  // 2) the caller knows which provider produced the error — more reliable than keywords
  providerId ??= toAuthProvider(fallbackProvider);
  // 3) keywords in the text
  providerId ??= PROVIDER_HINTS.find(([re]) => re.test(message))?.[1];

  return providerId ? { providerId, kind } : null;
}

/** One-line explanation shown in Settings / next to the Reconnect button. */
export function describeAuthError(err: AuthError): string {
  const name = AUTH_PROVIDER_NAMES[err.providerId];
  switch (err.kind) {
    case "missing":
      return `You're not signed in to ${name}.`;
    case "refresh_failed":
      return `Your ${name} session couldn't be refreshed. Reconnect to continue.`;
    default:
      return `Your ${name} session has expired (or couldn't be reached). Refresh or reconnect to continue.`;
  }
}
