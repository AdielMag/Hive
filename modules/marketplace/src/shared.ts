/**
 * Contract between the marketplace module's main and renderer halves.
 * Transported over the generic module bridge: `mod:marketplace:<method>`.
 */

export const MODULE_ID = "marketplace";

export const MarketplaceMethods = {
  search: "search",
  installed: "installed",
  install: "install",
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

export interface MarketplaceInstallArgs {
  source: string;
}

export interface MarketplaceInstallResult {
  ok: boolean;
  message: string;
}

/**
 * Comparable form of a package source: drops the npm version (`npm:pkg@1.2.3`) and git ref (`#main`),
 * so a marketplace entry matches the source Pi writes into settings.json.
 */
export function normalizeSource(source: string): string {
  let s = source.trim();
  if (s.startsWith("npm:")) {
    const name = s.slice(4);
    const at = name.lastIndexOf("@");
    s = `npm:${at > 0 ? name.slice(0, at) : name}`;
  }
  return s.replace(/#.*$/, "");
}
