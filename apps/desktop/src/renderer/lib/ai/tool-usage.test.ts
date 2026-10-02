import { describe, expect, it } from "vitest";
import { availableOnly, collectToolUsage } from "./tool-usage.ts";
import type { Timeline } from "@hive/pi-adapter";
import type { McpServerInfo, SessionRegistry } from "@hive/protocol";

describe("tool-usage helpers", () => {
  const ctx = {
    cwd: "C:/Users/talel/project",
    homeDir: "C:/Users/talel",
    registry: {
      sessionId: "sess_1",
      cwd: "C:/Users/talel/project",
      homeDir: "C:/Users/talel",
      receivedAt: 1000,
      tools: [
        { name: "read", description: "Read", active: true, source: "builtin", sourcePath: "" },
        { name: "write", description: "Write", active: true, source: "builtin", sourcePath: "" },
        { name: "questionnaire", description: "Ask questions", active: true, source: "extension", sourcePath: "", packageName: "pi-questionnaire" },
        { name: "unused_ext", description: "Unused", active: true, source: "extension", sourcePath: "", packageName: "pi-extra" },
      ],
      skills: [
        { name: "active-skill", description: "Desc", filePath: "skills/active/SKILL.md", baseDir: "skills/active" },
        { name: "unused-skill", description: "Desc 2", filePath: "skills/unused/SKILL.md", baseDir: "skills/unused" },
      ],
    } as SessionRegistry,
    mcpCatalog: [
      {
        name: "github",
        tools: [
          { name: "list_repos", description: "List" },
          { name: "create_issue", description: "Create" },
        ],
      },
    ] as McpServerInfo[],
  };

  const timeline: Timeline = {
    items: [
      {
        kind: "assistant",
        key: "a1",
        streaming: false,
        blocks: [
          {
            type: "toolCall",
            id: "call_read",
            name: "read",
            arguments: { path: "skills/active/SKILL.md" },
            complete: true,
          },
          {
            type: "toolCall",
            id: "call_mcp",
            name: "mcp",
            arguments: { server: "github", tool: "list_repos" },
            complete: true,
          },
          {
            type: "toolCall",
            id: "call_agent",
            name: "Agent",
            arguments: { description: "Inspect code", subagent_type: "scout", prompt: "hello" },
            complete: true,
          },
        ],
      },
    ],
    toolResults: {
      call_read: {
        toolCallId: "call_read",
        toolName: "read",
        isError: false,
        text: "---\nname: active-skill\n---\nBody",
        images: [],
      },
      call_agent: {
        toolCallId: "call_agent",
        toolName: "Agent",
        isError: false,
        text: "Agent ID: a_1",
        details: {
          subagentType: "scout",
          description: "Inspect code",
          cost: 0.05,
          status: "completed",
        },
        images: [],
      },
    },
  };

  it("collects used tools by category", () => {
    const report = collectToolUsage(timeline, ctx);
    expect(report.skills).toHaveLength(1);
    expect(report.skills[0]?.id).toBe("active-skill");

    expect(report.mcp).toHaveLength(1);
    expect(report.mcp[0]?.server).toBe("github");
    expect(report.mcp[0]?.tools["list_repos"]?.count).toBe(1);

    expect(report.subagents.agents).toHaveLength(1);
    expect(report.subagents.totalCost).toBe(0.05);
  });

  it("filters out used items to leave availableOnly items", () => {
    const report = collectToolUsage(timeline, ctx);
    const available = availableOnly(report, ctx.registry, ctx.mcpCatalog);

    expect(available.skills.map((s) => s.name)).toEqual(["unused-skill"]);
    expect(available.builtin.map((b) => b.name)).toEqual(["write"]);
    expect(available.mcp[0]?.tools.map((t) => t.name)).toEqual(["create_issue"]);
    expect(available.extensions.some((e) => e.packageName === "pi-extra")).toBe(true);
  });
});
