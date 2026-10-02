import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { McpServerInfo } from "@pi-studio/protocol";
import { piAgentDir } from "../paths.ts";

interface CachedTool {
  name: string;
  description?: string;
  [key: string]: unknown;
}

interface CachedServer {
  tools?: CachedTool[];
  [key: string]: unknown;
}

interface McpCacheFile {
  version?: number;
  servers?: Record<string, CachedServer>;
}

/**
 * Reads the MCP tool cache from `~/.pi/agent/mcp-cache.json`.
 * Only server names and tool definitions (name, description) are returned.
 * Any sensitive credentials or env configs are strictly omitted.
 */
export function getMcpCatalog(customPath?: string): McpServerInfo[] {
  const filePath = customPath || join(piAgentDir(), "mcp-cache.json");
  try {
    const raw = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as McpCacheFile;
    if (!parsed || typeof parsed !== "object" || !parsed.servers) {
      return [];
    }

    const results: McpServerInfo[] = [];
    for (const [serverName, server] of Object.entries(parsed.servers)) {
      if (!server || typeof server !== "object") continue;
      const tools: Array<{ name: string; description?: string }> = [];

      if (Array.isArray(server.tools)) {
        for (const t of server.tools) {
          if (t && typeof t.name === "string") {
            tools.push({
              name: t.name,
              description: typeof t.description === "string" ? t.description : undefined,
            });
          }
        }
      }

      results.push({
        name: serverName,
        tools,
      });
    }

    return results;
  } catch {
    // If file doesn't exist or isn't readable, return empty array gracefully
    return [];
  }
}
