/**
 * Contract between the marketplace module's main and renderer halves.
 * Transported over the generic module bridge: `mod:marketplace:<method>`.
 */

export const MODULE_ID = "marketplace";

export const MarketplaceMethods = {
  search: "search",
} as const;

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
  /** Free-form tags from the registry or npm keywords. */
  keywords?: string[];
  /** ISO timestamp of the last publish or update. */
  updatedAt?: string;
  /** npm search ranking, 0..1 (npm's own quality/popularity blend). */
  score?: number;
  maintainers?: number;
  repository?: string;
  license?: string;
  /** Plugin category (Claude) or MCP package/remote types. */
  category?: string;
  transports?: string[];
  /** Registry status, e.g. "active" or "deprecated". */
  status?: string;
}

export interface MarketplaceSearchArgs {
  query?: string;
  kind?: MarketplaceSourceKind;
  /** Bypass the service cache (Retry). */
  force?: boolean;
}
