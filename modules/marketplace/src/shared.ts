/**
 * Contract between the marketplace module's main and renderer halves.
 * Transported over the generic module bridge: `mod:marketplace:<method>`.
 */

export const MODULE_ID = "marketplace";
export const MARKETPLACE_PANEL_ID = "marketplace";

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
}

export interface MarketplaceSearchArgs {
  query?: string;
  kind?: MarketplaceSourceKind;
}
