/**
 * Types describing tools and skills exposed by a Pi session, and requests
 * to inspect subagents and MCP servers.
 */

export interface RegistryTool {
  name: string;
  description: string;
  active: boolean;
  source: "builtin" | "sdk" | "extension";
  sourcePath: string;
  packageName?: string;
}

export interface RegistrySkill {
  name: string;
  description: string;
  filePath: string;
  baseDir: string;
  scope?: string;
}

export interface SessionRegistry {
  sessionId: string | null;
  cwd: string;
  homeDir: string;
  tools: RegistryTool[];
  skills: RegistrySkill[];
  receivedAt: number;
}

export interface McpServerInfo {
  name: string;
  tools: Array<{ name: string; description?: string }>;
}

export interface SubagentLocateRequest {
  key?: string;
  sessionPath?: string;
  agentId?: string;
  outputFile?: string;
  prompt?: string;
  excludeAgentIds?: string[];
}

export interface SubagentOutputRef {
  agentId: string;
  path: string;
}

export interface SubagentOutputChunk {
  lines: unknown[];
  nextOffset: number;
  size: number;
}
