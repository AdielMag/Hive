import type { MarketplacePackage, MarketplaceSourceKind } from "./shared.ts";

export class MarketplaceService {
  async search(query = "", kind: MarketplaceSourceKind = "pi-npm"): Promise<MarketplacePackage[]> {
    if (kind === "pi-npm") {
      return this.searchPiNpm(query);
    }
    if (kind === "claude") {
      return this.fetchClaudeOfficial(query);
    }
    if (kind === "mcp") {
      return this.fetchMcpRegistry(query);
    }
    return [];
  }

  private async searchPiNpm(query: string): Promise<MarketplacePackage[]> {
    const q = query ? `${query}+keywords:pi-package` : "keywords:pi-package";
    let res: Response;
    try {
      res = await fetch(`https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(q)}&size=30`, {
        signal: AbortSignal.timeout(8000),
      });
    } catch (err: any) {
      throw new Error(`Couldn't reach marketplace: ${err?.message ?? err}`);
    }
    if (!res.ok) {
      throw new Error(`Couldn't reach marketplace: npm returned status ${res.status}`);
    }
    const data = (await res.json()) as {
      objects: Array<{
        package: {
          name: string;
          version: string;
          description?: string;
          author?: { name?: string };
          links?: { homepage?: string };
        };
      }>;
    };

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
        author: p.author?.name,
        homepage: p.links?.homepage,
        capabilities: caps,
      };
    });
  }

  private async fetchClaudeOfficial(query = ""): Promise<MarketplacePackage[]> {
    let res: Response;
    try {
      res = await fetch(
        "https://raw.githubusercontent.com/anthropics/claude-plugins-official/main/.claude-plugin/marketplace.json",
        { signal: AbortSignal.timeout(8000) },
      );
    } catch (err: any) {
      throw new Error(`Couldn't reach marketplace: ${err?.message ?? err}`);
    }
    if (!res.ok) {
      throw new Error(`Couldn't reach marketplace: GitHub returned status ${res.status}`);
    }
    const data = (await res.json()) as { plugins?: any[] };
    const q = query.trim().toLowerCase();
    return (data.plugins ?? [])
      .filter((p) => p?.name)
      .filter((p) => !q || `${p.name} ${p.description ?? ""} ${p.category ?? ""}`.toLowerCase().includes(q))
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
        return {
          id: p.name,
          name: p.name,
          description: isRelative && subpath
            ? `${p.description || "Claude plugin"} (${subpath} in claude-plugins-official)`
            : (p.description || "Claude plugin"),
          version: p.version || p.category || "plugin",
          sourceKind: "claude",
          source: url ? `git:${url}` : p.name,
          author: p.author?.name ?? "Community",
          homepage,
          capabilities: caps,
        };
      });
  }

  private async fetchMcpRegistry(query: string): Promise<MarketplacePackage[]> {
    const params = new URLSearchParams({ limit: "50", version: "latest" });
    if (query.trim()) params.set("search", query.trim());
    let res: Response;
    try {
      res = await fetch(`https://registry.modelcontextprotocol.io/v0/servers?${params}`, {
        signal: AbortSignal.timeout(8000),
      });
    } catch (err: any) {
      throw new Error(`Couldn't reach marketplace: ${err?.message ?? err}`);
    }
    if (!res.ok) {
      throw new Error(`Couldn't reach marketplace: MCP registry returned status ${res.status}`);
    }
    const data = (await res.json()) as { servers?: any[] };
    const seen = new Set<string>();
    const out: MarketplacePackage[] = [];
    for (const entry of data.servers ?? []) {
      const s = entry?.server ?? entry; // registry wraps each entry as { server, _meta }
      const name: string | undefined = s?.name ?? s?.id;
      if (!name || seen.has(name)) continue;
      seen.add(name);
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
      });
    }
    return out;
  }
}
