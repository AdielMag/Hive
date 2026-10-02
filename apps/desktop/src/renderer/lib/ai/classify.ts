import type { RegistryTool } from "@pi-studio/protocol";

export type ToolCategory = "skill" | "mcp" | "subagent" | "builtin" | "extension";

export interface ToolClassification {
  category: ToolCategory;
  server?: string;
  mcpTool?: string;
  packageName?: string;
}

export interface ClassifyContext {
  mcpServers: Set<string>;
  tools: RegistryTool[];
}

const BUILTIN_NAMES = new Set(["read", "bash", "edit", "write", "grep", "find", "ls"]);
const SUBAGENT_NAMES = new Set(["Agent", "get_subagent_result", "steer_subagent", "SubagentWorkflow"]);

/**
 * Classifies a tool call by category (skill, mcp, subagent, builtin, extension),
 * resolving MCP servers/tools and extension packages when known.
 */
export function classifyTool(
  name: string,
  args?: Record<string, unknown>,
  ctx?: ClassifyContext,
): ToolClassification {
  // 1. Subagent tools
  if (SUBAGENT_NAMES.has(name)) {
    return { category: "subagent" };
  }

  // 2. MCP gateway tool
  if (name === "mcp") {
    let server = typeof args?.server === "string" ? args.server : undefined;
    let mcpTool = typeof args?.tool === "string" ? args.tool : undefined;
    if (!server && mcpTool) {
      const idx = mcpTool.indexOf("_");
      if (idx > 0 && ctx?.mcpServers.has(mcpTool.slice(0, idx))) {
        server = mcpTool.slice(0, idx);
        mcpTool = mcpTool.slice(idx + 1);
      }
    }
    return { category: "mcp", server, mcpTool };
  }

  // 3. MCP script execution
  if (name === "mcpScript") {
    return { category: "mcp" };
  }

  // 4. Direct MCP tools (<server>_<tool>)
  if (ctx?.mcpServers) {
    for (const server of ctx.mcpServers) {
      if (name.startsWith(`${server}_`)) {
        return {
          category: "mcp",
          server,
          mcpTool: name.slice(server.length + 1),
        };
      }
    }
  }

  // 5. Built-in tools
  if (BUILTIN_NAMES.has(name)) {
    return { category: "builtin" };
  }

  // Check registry if available
  const regTool = ctx?.tools.find((t) => t.name === name);
  if (regTool) {
    if (regTool.source === "builtin") {
      return { category: "builtin" };
    }
    return {
      category: "extension",
      packageName: regTool.packageName,
    };
  }

  // Default fallback
  return { category: "extension" };
}
