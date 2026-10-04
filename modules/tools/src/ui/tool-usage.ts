import type { Timeline } from "@hive/pi-adapter";
import type { McpServerInfo, RegistrySkill, RegistryTool, SessionRegistry } from "@hive/protocol";
import { classifyTool, indexSkills, indexSubagents, resolveSubagentView, type PathContext, type SubagentView } from "@hive/pi-adapter";

export interface ToolUsageRef {
  toolCallId?: string;
  itemKey?: string;
}

export interface ToolUsageItem {
  id: string;
  label: string;
  category: "skill" | "mcp" | "subagent" | "builtin" | "extension";
  count: number;
  errors: number;
  firstRef?: ToolUsageRef;
  details?: Record<string, unknown>;
}

export interface McpServerUsage {
  server: string;
  tools: Record<string, { count: number; errors: number; firstRef?: ToolUsageRef }>;
  totalCount: number;
}

export interface ExtensionPackageUsage {
  packageName: string;
  tools: Record<string, { count: number; errors: number; firstRef?: ToolUsageRef }>;
  totalCount: number;
}

export interface ToolUsageReport {
  skills: ToolUsageItem[];
  mcp: McpServerUsage[];
  subagents: {
    agents: SubagentView[];
    totalCost: number;
    totalCount: number;
  };
  builtin: ToolUsageItem[];
  extensions: ExtensionPackageUsage[];
  totalCallCount: number;
}

export interface ToolUsageContext extends PathContext {
  registry?: SessionRegistry | null;
  mcpCatalog?: McpServerInfo[] | null;
}

/**
 * Aggregates all tool usage, skill loads, subagents, and MCP calls across a session timeline.
 */
export function collectToolUsage(timeline: Timeline, ctx: ToolUsageContext): ToolUsageReport {
  const mcpServerNames = new Set<string>();
  if (ctx.mcpCatalog) {
    for (const s of ctx.mcpCatalog) mcpServerNames.add(s.name);
  }
  const registryTools = ctx.registry?.tools ?? [];
  const classifyCtx = { mcpServers: mcpServerNames, tools: registryTools };

  const skillIndex = indexSkills(timeline, ctx.registry, ctx);
  const subagentIndex = indexSubagents(timeline);

  const skillsMap = new Map<string, ToolUsageItem>();
  const mcpMap = new Map<string, McpServerUsage>();
  const builtinMap = new Map<string, ToolUsageItem>();
  const extMap = new Map<string, ExtensionPackageUsage>();
  const subagentsList: SubagentView[] = [];

  let totalCallCount = 0;

  // 1. Index skill loads
  for (const [key, load] of skillIndex.loads.entries()) {
    if (!skillsMap.has(load.name)) {
      skillsMap.set(load.name, {
        id: load.name,
        label: load.name,
        category: "skill",
        count: 1,
        errors: 0,
        firstRef: load.source === "/skill" ? { itemKey: key } : { toolCallId: key },
        details: { description: load.description, source: load.source },
      });
    } else {
      const item = skillsMap.get(load.name)!;
      item.count += 1;
    }
  }

  // 2. Scan assistant tool calls
  for (const item of timeline.items) {
    if (item.kind !== "assistant") continue;

    for (const block of item.blocks) {
      if (block.type !== "toolCall") continue;
      totalCallCount++;

      const res = timeline.toolResults[block.id];
      const isError = res?.isError === true;
      const toolName = block.name;

      // Check if this tool is attributed to a skill usage
      const skillName = skillIndex.usedBy.get(block.id);
      if (skillName) {
        if (!skillsMap.has(skillName)) {
          skillsMap.set(skillName, {
            id: skillName,
            label: skillName,
            category: "skill",
            count: 1,
            errors: isError ? 1 : 0,
            firstRef: { toolCallId: block.id },
          });
        } else {
          const s = skillsMap.get(skillName)!;
          s.count++;
          if (isError) s.errors++;
        }
      }

      // Check subagent
      if (toolName === "Agent" || toolName === "SubagentWorkflow") {
        const view = resolveSubagentView({ block, result: res, subagentIndex });
        subagentsList.push(view);
        continue;
      }

      const classification = classifyTool(toolName, block.arguments, classifyCtx);

      if (classification.category === "mcp") {
        const sName = classification.server || "gateway";
        const tName = classification.mcpTool || (toolName === "mcpScript" ? "script" : toolName);

        let sUsage = mcpMap.get(sName);
        if (!sUsage) {
          sUsage = { server: sName, tools: {}, totalCount: 0 };
          mcpMap.set(sName, sUsage);
        }
        sUsage.totalCount++;
        let tUsage = sUsage.tools[tName];
        if (!tUsage) {
          tUsage = { count: 1, errors: isError ? 1 : 0, firstRef: { toolCallId: block.id } };
          sUsage.tools[tName] = tUsage;
        } else {
          tUsage.count++;
          if (isError) tUsage.errors++;
        }
      } else if (classification.category === "builtin") {
        let bItem = builtinMap.get(toolName);
        if (!bItem) {
          bItem = {
            id: toolName,
            label: toolName,
            category: "builtin",
            count: 1,
            errors: isError ? 1 : 0,
            firstRef: { toolCallId: block.id },
          };
          builtinMap.set(toolName, bItem);
        } else {
          bItem.count++;
          if (isError) bItem.errors++;
        }
      } else if (classification.category === "extension") {
        const pkgName = classification.packageName || "other";
        let pkgUsage = extMap.get(pkgName);
        if (!pkgUsage) {
          pkgUsage = { packageName: pkgName, tools: {}, totalCount: 0 };
          extMap.set(pkgName, pkgUsage);
        }
        pkgUsage.totalCount++;
        let tUsage = pkgUsage.tools[toolName];
        if (!tUsage) {
          tUsage = { count: 1, errors: isError ? 1 : 0, firstRef: { toolCallId: block.id } };
          pkgUsage.tools[toolName] = tUsage;
        } else {
          tUsage.count++;
          if (isError) tUsage.errors++;
        }
      }
    }
  }

  const subagentsTotalCost = subagentsList.reduce((acc, a) => acc + (a.cost ?? 0), 0);

  return {
    skills: Array.from(skillsMap.values()),
    mcp: Array.from(mcpMap.values()),
    subagents: {
      agents: subagentsList,
      totalCost: subagentsTotalCost,
      totalCount: subagentsList.length,
    },
    builtin: Array.from(builtinMap.values()),
    extensions: Array.from(extMap.values()),
    totalCallCount,
  };
}

export interface AvailableTools {
  skills: RegistrySkill[];
  mcp: McpServerInfo[];
  builtin: RegistryTool[];
  extensions: Array<{ packageName: string; tools: RegistryTool[] }>;
}

/**
 * Filters the registry and MCP catalog to find items that have NOT yet been used in the session.
 */
export function availableOnly(
  report: ToolUsageReport,
  registry?: SessionRegistry | null,
  mcpCatalog?: McpServerInfo[] | null,
): AvailableTools {
  const usedSkills = new Set(report.skills.map((s) => s.id.toLowerCase()));
  const usedMcpTools = new Set<string>();
  for (const s of report.mcp) {
    for (const t of Object.keys(s.tools)) {
      usedMcpTools.add(`${s.server.toLowerCase()}:${t.toLowerCase()}`);
    }
  }
  const usedBuiltin = new Set(report.builtin.map((b) => b.id));
  const usedExtTools = new Set<string>();
  for (const pkg of report.extensions) {
    for (const t of Object.keys(pkg.tools)) {
      usedExtTools.add(t);
    }
  }

  // Filter skills
  const skills = (registry?.skills ?? []).filter((s) => !usedSkills.has(s.name.toLowerCase()));

  // Filter MCP
  const mcp: McpServerInfo[] = [];
  if (mcpCatalog) {
    for (const server of mcpCatalog) {
      const unusedTools = server.tools.filter(
        (t) => !usedMcpTools.has(`${server.name.toLowerCase()}:${t.name.toLowerCase()}`),
      );
      if (unusedTools.length > 0) {
        mcp.push({ name: server.name, tools: unusedTools });
      }
    }
  }

  // Filter builtin & extension tools
  const builtin: RegistryTool[] = [];
  const extGroups = new Map<string, RegistryTool[]>();

  for (const tool of registry?.tools ?? []) {
    if (tool.name === "Agent" || tool.name === "SubagentWorkflow") continue;

    if (tool.source === "builtin") {
      if (!usedBuiltin.has(tool.name)) {
        builtin.push(tool);
      }
    } else {
      if (!usedExtTools.has(tool.name)) {
        const pkg = tool.packageName || "other";
        if (!extGroups.has(pkg)) extGroups.set(pkg, []);
        extGroups.get(pkg)!.push(tool);
      }
    }
  }

  const extensions = Array.from(extGroups.entries()).map(([packageName, tools]) => ({
    packageName,
    tools,
  }));

  return { skills, mcp, builtin, extensions };
}
