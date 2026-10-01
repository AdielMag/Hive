/** Network calls for each provider's subscription usage endpoint. */
import type { QuotaGroup } from "@pi-studio/protocol";
import { parseAnthropicUsage, parseAntigravityQuota, parseCodexUsage } from "./parsers.ts";

const TIMEOUT_MS = 10_000;

async function getJson(url: string, init: RequestInit): Promise<unknown> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
  return res.json();
}

export async function fetchAnthropic(token: string): Promise<QuotaGroup[]> {
  if (!token.startsWith("sk-ant-oat")) throw new UnsupportedError("API-key accounts are billed per token (no subscription window).");
  const json = await getJson("https://api.anthropic.com/api/oauth/usage", {
    headers: { authorization: `Bearer ${token}`, "anthropic-beta": "oauth-2025-04-20" },
  });
  return parseAnthropicUsage(json);
}

const AGY_ENDPOINTS = ["https://cloudcode-pa.googleapis.com", "https://daily-cloudcode-pa.sandbox.googleapis.com"];

export async function fetchAntigravity(apiKey: string): Promise<QuotaGroup[]> {
  let token = apiKey;
  try {
    const parsed = JSON.parse(apiKey) as { token?: string };
    if (parsed.token) token = parsed.token;
  } catch {
    // plain bearer token
  }
  const platform = process.platform === "darwin" ? "PLATFORM_MACOS" : process.platform === "win32" ? "PLATFORM_WINDOWS" : "PLATFORM_LINUX";
  let lastError: unknown;
  for (const ep of AGY_ENDPOINTS) {
    try {
      const json = await getJson(`${ep}/v1internal:retrieveUserQuotaSummary`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "User-Agent": `antigravity/1.15.8 ${process.platform}/${process.arch}`,
          "Client-Metadata": JSON.stringify({ ideType: "ANTIGRAVITY", platform, pluginType: "GEMINI" }),
        },
        body: "{}",
      });
      return parseAntigravityQuota(json);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Antigravity quota request failed");
}

function chatGptAccountId(token: string): string | undefined {
  const payload = token.split(".")[1];
  if (!payload) return undefined;
  try {
    const json = JSON.parse(Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as Record<string, any>;
    const auth = json["https://api.openai.com/auth"] ?? {};
    return auth.chatgpt_account_id ?? auth.account_id ?? json.chatgpt_account_id;
  } catch {
    return undefined;
  }
}

export async function fetchCodex(token: string): Promise<QuotaGroup[]> {
  const headers: Record<string, string> = { authorization: `Bearer ${token}` };
  const account = chatGptAccountId(token);
  if (account) headers["ChatGPT-Account-Id"] = account;
  return parseCodexUsage(await getJson("https://chatgpt.com/backend-api/wham/usage", { headers }));
}

export class UnsupportedError extends Error {}

export const QUOTA_FETCHERS: Record<string, (apiKey: string) => Promise<QuotaGroup[]>> = {
  anthropic: fetchAnthropic,
  antigravity: fetchAntigravity,
  "openai-codex": fetchCodex,
};
