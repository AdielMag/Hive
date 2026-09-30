export type MarketplaceSourceKind = "pi-npm" | "claude" | "mcp";

export interface MarketplacePackage {
  id: string;
  name: string;
  description: string;
  version: string;
  sourceKind: MarketplaceSourceKind;
  source: string; // npm:package, git:url, etc.
  author?: string;
  homepage?: string;
  capabilities: Array<"tool" | "skill" | "command" | "theme" | "mcp" | "provider">;
}

export class MarketplaceService {
  async search(query = "", kind: MarketplaceSourceKind = "pi-npm"): Promise<MarketplacePackage[]> {
    if (kind === "pi-npm") {
      return this.searchPiNpm(query);
    }
    if (kind === "claude") {
      return this.fetchClaudeOfficial();
    }
    if (kind === "mcp") {
      return this.fetchMcpRegistry(query);
    }
    return [];
  }

  private async searchPiNpm(query: string): Promise<MarketplacePackage[]> {
    try {
      const q = query ? `${query}+keywords:pi-package` : "keywords:pi-package";
      const res = await fetch(`https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(q)}&size=30`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return [];
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
          description: p.description || "",
          version: p.version,
          sourceKind: "pi-npm",
          source: `npm:${p.name}@${p.version}`,
          author: p.author?.name,
          homepage: p.links?.homepage,
          capabilities: caps,
        };
      });
    } catch {
      return [];
    }
  }

  private async fetchClaudeOfficial(): Promise<MarketplacePackage[]> {
    try {
      const res = await fetch(
        "https://raw.githubusercontent.com/anthropics/claude-plugins-official/main/.claude-plugin/marketplace.json",
        { signal: AbortSignal.timeout(8000) },
      );
      if (!res.ok) return [];
      const data = (await res.json()) as {
        plugins: Array<{
          name: string;
          description?: string;
          version?: string;
          source?: any;
          category?: string;
        }>;
      };

      return data.plugins.map((p) => ({
        id: `claude:${p.name}`,
        name: p.name,
        description: p.description || "",
        version: p.version || "1.0.0",
        sourceKind: "claude",
        source: typeof p.source === "string" ? p.source : JSON.stringify(p.source),
        capabilities: ["skill", "command"],
      }));
    } catch {
      return [];
    }
  }

  private async fetchMcpRegistry(query: string): Promise<MarketplacePackage[]> {
    try {
      const res = await fetch("https://registry.modelcontextprotocol.io/v0/servers?limit=40", {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return [];
      const data = (await res.json()) as {
        servers: Array<{
          server: {
            name: string;
            description?: string;
            version?: string;
            title?: string;
          };
        }>;
      };

      return data.servers
        .filter((s) => {
          if (!query) return true;
          const text = `${s.server.name} ${s.server.description ?? ""}`.toLowerCase();
          return text.includes(query.toLowerCase());
        })
        .map((s) => ({
          id: `mcp:${s.server.name}`,
          name: s.server.title || s.server.name,
          description: s.server.description || "",
          version: s.server.version || "1.0.0",
          sourceKind: "mcp",
          source: s.server.name,
          capabilities: ["mcp", "tool"],
        }));
    } catch {
      return [];
    }
  }
}
