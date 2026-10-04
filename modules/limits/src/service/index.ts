/**
 * QuotaService: one snapshot of subscription windows (5h / weekly / ...) for every connected account.
 * Live data comes from each provider's usage endpoint; when that fails we fall back to the cache written
 * by the pi-quota-status extension so the panel still shows the last known values.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { PiInstallInfo, ProviderQuota, QuotaGroup, QuotaSnapshot } from "@hive/protocol";
import { resolveCredentials, type ProviderCredential } from "./credentials.ts";
import { QUOTA_FETCHERS, UnsupportedError } from "./fetchers.ts";
import { parseQuotaStatusCache } from "./parsers.ts";

const CACHE_TTL_MS = 45_000;
const BACKOFF_MS = 5 * 60_000;

export const PROVIDER_NAMES: Record<string, string> = {
  anthropic: "Anthropic Claude",
  antigravity: "Google Antigravity",
  "openai-codex": "ChatGPT / Codex",
  openai: "OpenAI",
  google: "Google Gemini",
  "github-copilot": "GitHub Copilot",
  openrouter: "OpenRouter",
  xai: "xAI",
  groq: "Groq",
  mistral: "Mistral",
  deepseek: "DeepSeek",
};

type Fetcher = (apiKey: string) => Promise<QuotaGroup[]>;
type CacheReader = () => Map<string, { fetchedAt: number; groups: QuotaGroup[] }>;

export interface QuotaServiceDeps {
  /** Pi's agent dir (auth.json, extension quota cache). Required unless `readAccounts`/`readCache` are given. */
  agentDir?: () => string;
  /** Absolute path of the pi-credentials.mjs helper. */
  helperPath?: string;
  resolveCredentials?: (pi: PiInstallInfo) => Promise<ProviderCredential[]>;
  fetchers?: Record<string, Fetcher>;
  readAccounts?: () => Record<string, string | undefined>;
  readCache?: CacheReader;
  now?: () => number;
}

export class QuotaService {
  private cached: QuotaSnapshot | null = null;
  /** Last successful live result per provider (preferred fallback over the extension cache). */
  private readonly lastGood = new Map<string, { fetchedAt: number; groups: QuotaGroup[] }>();
  /** Providers that rate-limited us are not re-queried until this time. */
  private readonly backoffUntil = new Map<string, number>();
  private inflight: Promise<QuotaSnapshot> | null = null;
  private readonly deps: Required<Omit<QuotaServiceDeps, "agentDir" | "helperPath">>;

  constructor(
    private readonly pi: PiInstallInfo | null,
    deps: QuotaServiceDeps = {},
  ) {
    const agentDir = deps.agentDir ?? (() => "");
    const helperPath = deps.helperPath ?? "";
    this.deps = {
      resolveCredentials: deps.resolveCredentials ?? ((p) => resolveCredentials(p, helperPath)),
      fetchers: deps.fetchers ?? QUOTA_FETCHERS,
      readAccounts: deps.readAccounts ?? (() => readAccountLabels(agentDir())),
      readCache: deps.readCache ?? (() => readQuotaStatusCache(agentDir())),
      now: deps.now ?? Date.now,
    };
  }

  async getSnapshot(force = false): Promise<QuotaSnapshot> {
    if (!force && this.cached && this.deps.now() - this.cached.fetchedAt < CACHE_TTL_MS) return this.cached;
    this.inflight ??= this.build().finally(() => {
      this.inflight = null;
    });
    this.cached = await this.inflight;
    return this.cached;
  }

  private async build(): Promise<QuotaSnapshot> {
    const fetchedAt = this.deps.now();
    const accounts = this.deps.readAccounts();
    let credentials: ProviderCredential[] = [];
    let credentialError: string | undefined;
    if (this.pi) {
      try {
        credentials = await this.deps.resolveCredentials(this.pi);
      } catch (err) {
        credentialError = err instanceof Error ? err.message : String(err);
      }
    }
    // If the helper failed, still list the providers that have stored credentials.
    if (!credentials.length) {
      credentials = Object.keys(accounts).map((providerId) => ({ providerId, type: "oauth", apiKey: null }));
    }

    const fallback = this.deps.readCache();
    const providers = await Promise.all(
      credentials.map(async (cred): Promise<ProviderQuota> => {
        const base = {
          providerId: cred.providerId,
          name: PROVIDER_NAMES[cred.providerId] ?? cred.providerId,
          account: accounts[cred.providerId],
          fetchedAt,
          groups: [] as QuotaGroup[],
        };
        const fetcher = this.deps.fetchers[cred.providerId];
        if (!fetcher) {
          return { ...base, status: "unsupported", source: "live", error: "Usage-based billing — no subscription windows." };
        }
        try {
          const until = this.backoffUntil.get(cred.providerId) ?? 0;
          if (until > this.deps.now()) throw new Error("Rate limited by provider — retrying shortly");
          if (!cred.apiKey) throw new Error(cred.error || credentialError || "No credential available");
          const groups = await fetcher(cred.apiKey);
          if (!groups.length) throw new Error("Provider returned no quota windows");
          this.lastGood.set(cred.providerId, { fetchedAt, groups });
          this.backoffUntil.delete(cred.providerId);
          return { ...base, status: "ok", source: "live", groups };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (err instanceof UnsupportedError) return { ...base, status: "unsupported", source: "live", error: message };
          if (/HTTP 429/.test(message)) this.backoffUntil.set(cred.providerId, this.deps.now() + BACKOFF_MS);
          const good = this.lastGood.get(cred.providerId);
          const ext = fallback.get(cred.providerId);
          const cachedObs = good && (!ext || good.fetchedAt >= ext.fetchedAt) ? good : ext;
          if (cachedObs) {
            return { ...base, status: "ok", source: "cache", error: message, fetchedAt: cachedObs.fetchedAt, groups: cachedObs.groups };
          }
          return { ...base, status: "error", source: "live", error: message };
        }
      }),
    );

    const rank = (p: ProviderQuota) => (p.status === "ok" ? 0 : p.status === "error" ? 1 : 2);
    providers.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
    return { providers, fetchedAt };
  }
}

function readAccountLabels(agentDir: string): Record<string, string | undefined> {
  if (!agentDir) return {};
  const path = join(agentDir, "auth.json");
  if (!existsSync(path)) return {};
  try {
    const data = JSON.parse(readFileSync(path, "utf8")) as Record<string, { email?: string } | undefined>;
    return Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v?.email]));
  } catch {
    return {};
  }
}

function readQuotaStatusCache(agentDir: string): Map<string, { fetchedAt: number; groups: QuotaGroup[] }> {
  if (!agentDir) return new Map();
  const path = join(agentDir, "pi-quota-status", "state.json");
  try {
    return existsSync(path) ? parseQuotaStatusCache(JSON.parse(readFileSync(path, "utf8"))) : new Map();
  } catch {
    return new Map();
  }
}
