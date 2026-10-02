import { describe, expect, it } from "vitest";
import { classifyTool } from "./classify.ts";
import type { RegistryTool } from "@hive/protocol";

describe("classifyTool", () => {
  const tools: RegistryTool[] = [
    { name: "read", description: "Read file", active: true, source: "builtin", sourcePath: "" },
    { name: "Agent", description: "Spawn agent", active: true, source: "extension", sourcePath: "", packageName: "@tintinweb/pi-subagents" },
    { name: "questionnaire", description: "Ask questions", active: true, source: "extension", sourcePath: "", packageName: "pi-questionnaire" },
  ];
  const mcpServers = new Set(["github", "postgres"]);
  const ctx = { mcpServers, tools };

  it("classifies subagent tools", () => {
    expect(classifyTool("Agent", { description: "Explore" }, ctx)).toEqual({ category: "subagent" });
    expect(classifyTool("get_subagent_result", { agent_id: "123" }, ctx)).toEqual({ category: "subagent" });
    expect(classifyTool("steer_subagent", { agent_id: "123" }, ctx)).toEqual({ category: "subagent" });
  });

  it("classifies mcp gateway calls", () => {
    expect(classifyTool("mcp", { server: "github", tool: "create_issue" }, ctx)).toEqual({
      category: "mcp",
      server: "github",
      mcpTool: "create_issue",
    });
    expect(classifyTool("mcp", { tool: "postgres_query" }, ctx)).toEqual({
      category: "mcp",
      server: "postgres",
      mcpTool: "query",
    });
    expect(classifyTool("mcpScript", { code: "tools.call(...)" }, ctx)).toEqual({
      category: "mcp",
    });
  });

  it("classifies direct mcp tools", () => {
    expect(classifyTool("github_list_repos", {}, ctx)).toEqual({
      category: "mcp",
      server: "github",
      mcpTool: "list_repos",
    });
  });

  it("classifies built-in tools", () => {
    expect(classifyTool("read", { path: "foo.txt" }, ctx)).toEqual({ category: "builtin" });
    expect(classifyTool("bash", { command: "ls" }, ctx)).toEqual({ category: "builtin" });
  });

  it("classifies extension tools and finds package name", () => {
    expect(classifyTool("questionnaire", {}, ctx)).toEqual({
      category: "extension",
      packageName: "pi-questionnaire",
    });
    expect(classifyTool("unknown_tool", {}, ctx)).toEqual({
      category: "extension",
      packageName: undefined,
    });
  });
});
