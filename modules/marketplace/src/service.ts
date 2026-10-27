import type { MarketplacePackage, MarketplaceSourceKind } from "./shared.ts";

/** How long a source response is reused before we hit the network again. */
const CACHE_TTL_MS = 5 * 60_000;
const REQUEST_TIMEOUT_MS = 8000;
const MCP_OFFICIAL_META = "io.modelcontextprotocol.registry/official";

interface CacheEntry {
  at: number;
  value: Promise<MarketplacePackage[]>;
}

export interface SearchOptions {
  /** Skip the cache and fetch again (used by the Retry button). */
  force?: boolean;
}

export class MarketplaceService {
  /**
   * Caches the promise, not the value, so concurrent identical requests share one fetch.
   * Failed requests are evicted so the next call retries.
   */
  private cache = new Map<string, CacheEntry>();

  async search(
    query = "",
    kind: MarketplaceSourceKind = "pi-npm",
    opts: SearchOptions = {},
  ): Promise<MarketplacePackage[]> {
    const q = query.trim();
    if (kind === "pi-npm") {
      return this.cached(`pi-npm:${q}`, () => this.searchPiNpm(q), opts);
    }
    if (kind === "claude") {
      // One catalog for every query: filter locally instead of refetching.
      const all = await this.cached("claude:catalog", () => this.fetchClaudeCatalog(), opts);
      return filterClaude(all, q);
    }
    if (kind === "mcp") {
      return this.cached(`mcp:${q}`, () => this.fetchMcpRegistry(q), opts);
    }
    return [];
  }

  private cached(
    key: string,
    load: () => Promise<MarketplacePackage[]>,
    opts: SearchOptions,
  ): Promise<MarketplacePackage[]> {
    const hit = this.cache.get(key);
    if (!opts.force && hit && Date.now() - hit.at < CACHE_TTL_MS) {
      return hit.value;
    }
    const value = load().catch((err) => {
      if (this.cache.get(key)?.value === value) this.cache.delete(key);
      throw err;
    });
    this.cache.set(key, { at: Date.now(), value });
    return value;
  }

  private async fetchJson<T>(url: string, label: string): Promise<T> {
    let res: Response;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch (err: any) {
      throw new Error(`Couldn't reach marketplace: ${err?.message ?? err}`);
    }
    if (!res.ok) {
      throw new Error(`Couldn't reach marketplace: ${label} returned status ${res.status}`);
    }
    return (await res.json()) as T;
  }

  private async searchPiNpm(query: string): Promise<MarketplacePackage[]> {
    const q = query ? `${query}+keywords:pi-package` : "keywords:pi-package";
    const data = await this.fetchJson<{
      objects: Array<{
        package: {
          name: string;
          version: string;
          description?: string;
          keywords?: string[];
          date?: string;
          license?: string;
          author?: { name?: string };
          publisher?: { username?: string };
          maintainers?: unknown[];
          links?: { homepage?: string; repository?: string };
        };
        score?: { final?: number };
      }>;
    }>(`https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(q)}&size=30`, "npm");

    return data.objects.map((o) => {
      const p = o.package;
      const caps: MarketplacePackage["capabilities"] = [];
      const desc = (p.description || "").toLowerCase();
      if (desc.includes("tool") || desc.includes("action")) caps.push("tool");
      if (desc.includes("skill")) caps.push("skill");
      if (desc.includes("command")) caps.push("command");
      if (desc.includes("theme")) caps.push("theme");
      if (desc.includes("provider") || desc.includes("auth")) caps.push("provider");
      if (desc.includes("mcp")) caps.push("mcp");
      if (caps.length === 0) caps.push("tool");

      return {
        id: p.name,
        name: p.name,
        description: p.description || "No description provided.",
        version: p.version,
        sourceKind: "pi-npm",
        source: `npm:${p.name}`,
        author: p.author?.name ?? p.publisher?.username,
        homepage: p.links?.homepage,
        capabilities: caps,
        keywords: (p.keywords ?? []).filter((k) => k !== "pi-package").slice(0, 8),
        updatedAt: p.date,
        score: typeof o.score?.final === "number" ? o.score.final : undefined,
        maintainers: p.maintainers?.length || undefined,
        repository: p.links?.repository,
        license: p.license,
      };
    });
  }

  private async fetchClaudeCatalog(): Promise<MarketplacePackage[]> {
    const data = await this.fetchJson<{ plugins?: any[] }>(
      "https://raw.githubusercontent.com/anthropics/claude-plugins-official/main/.claude-plugin/marketplace.json",
      "GitHub",
    );
    return (data.plugins ?? [])
      .filter((p) => p?.name)
      .map((p): MarketplacePackage => {
        const src = p.source;
        const isRelative = typeof src === "string";
        const subpath = isRelative ? src.replace(/^\.\//, "") : undefined;
        // Relative-path plugins live inside the official repo itself: include the subpath
        const url: string | undefined = isRelative
          ? `https://github.com/anthropics/claude-plugins-official.git//${subpath}`
          : src?.url;
        const homepage = isRelative
          ? `https://github.com/anthropics/claude-plugins-official/tree/main/${subpath}`
          : (p.homepage ?? url);
        const caps: MarketplacePackage["capabilities"] = [];
        if (p.category === "theme") caps.push("theme");
        if (`${p.name} ${p.description ?? ""}`.toLowerCase().includes("mcp")) caps.push("mcp");
        if (caps.length === 0) caps.push("tool");
        const tags: unknown[] = [
          ...(Array.isArray(p.keywords) ? p.keywords : []),
          ...(Array.isArray(p.tags) ? p.tags : []),
        ];
        return {
          id: p.name,
          name: p.name,
          description: isRelative && subpath
            ? `${p.description || "Claude plugin"} (${subpath} in claude-plugins-official)`
            : (p.description || "Claude plugin"),
          version: p.version || "plugin",
          sourceKind: "claude",
          source: url ? `git:${url}` : p.name,
          author: p.author?.name ?? "Community",
          homepage,
          capabilities: caps,
          keywords: uniqueStrings(tags).slice(0, 8),
          category: typeof p.category === "string" ? p.category : undefined,
          repository: url,
          license: typeof p.license === "string" ? p.license : undefined,
        };
      });
  }

  private async fetchMcpRegistry(query: string): Promise<MarketplacePackage[]> {
    const params = new URLSearchParams({ limit: "50", version: "latest" });
    if (query) params.set("search", query);
    const data = await this.fetchJson<{ servers?: any[] }>(
      `https://registry.modelcontextprotocol.io/v0/servers?${params}`,
      "MCP registry",
    );
    const seen = new Set<string>();
    const out: MarketplacePackage[] = [];
    for (const entry of data.servers ?? []) {
      const s = entry?.server ?? entry; // registry wraps each entry as { server, _meta }
      const name: string | undefined = s?.name ?? s?.id;
      if (!name || seen.has(name)) continue;
      seen.add(name);
      const meta = entry?._meta?.[MCP_OFFICIAL_META] ?? {};
      const transports = uniqueStrings([
        ...(s.remotes ?? []).map((r: any) => r?.type),
        ...(s.packages ?? []).map((p: any) => p?.registryType),
      ]);
      out.push({
        id: name,
        name,
        description: s.description || "MCP server",
        version: s.version || "0.1.0",
        sourceKind: "mcp",
        source: s.repository?.url || s.remotes?.[0]?.url || name,
        author: s.publisher || s.author,
        homepage: s.websiteUrl || s.homepage || s.repository?.url,
        capabilities: ["mcp", "tool"],
        updatedAt: meta.updatedAt ?? meta.publishedAt,
        repository: s.repository?.url,
        transports,
        status: meta.status ?? s.status,
      });
    }
    return out;
  }
}

function filterClaude(all: MarketplacePackage[], query: string): MarketplacePackage[] {
  const q = query.toLowerCase();
  if (!q) return all;
  return all.filter((p) =>
    `${p.name} ${p.description} ${p.category ?? ""} ${(p.keywords ?? []).join(" ")}`.toLowerCase().includes(q),
  );
}

function uniqueStrings(values: unknown[]): string[] {
  const out: string[] = [];
  for (const v of values) {
    if (typeof v === "string" && v && !out.includes(v)) out.push(v);
  }
  return out;
}
