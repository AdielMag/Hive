import type { MarketplacePackage, MarketplaceSourceKind } from "./shared.ts";

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
          description: p.description || "No description provided.",
          version: p.version,
          sourceKind: "pi-npm",
          source: `npm:${p.name}`,
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
      const res = await fetch("https://raw.githubusercontent.com/anthropics/anthropic-tools/main/marketplace.json", {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return [];
      const data = (await res.json()) as any[];
      return data.map((item) => ({
        id: item.name || item.id,
        name: item.name || item.id,
        description: item.description || "Anthropic tool/skill definition",
        version: item.version || "1.0.0",
        sourceKind: "claude",
        source: item.repo ? `git:${item.repo}` : item.source || item.name,
        author: item.author || "Anthropic / Community",
        homepage: item.homepage,
        capabilities: item.capabilities || ["tool"],
      }));
    } catch {
      return [];
    }
  }

  private async fetchMcpRegistry(query: string): Promise<MarketplacePackage[]> {
    try {
      const q = encodeURIComponent(query);
      const res = await fetch(`https://registry.modelcontextprotocol.io/v0/servers?query=${q}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return [];
      const data = (await res.json()) as any;
      const servers = data.servers || [];

      return servers.map((s: any) => ({
        id: s.name || s.id,
        name: s.name || s.id,
        description: s.description || "MCP Protocol Server",
        version: s.version || "0.1.0",
        sourceKind: "mcp",
        source: s.repository?.url || s.url || s.name,
        author: s.publisher || s.author,
        homepage: s.homepage || s.repository?.url,
        capabilities: ["mcp", "tool"],
      }));
    } catch {
      return [];
    }
  }
}
