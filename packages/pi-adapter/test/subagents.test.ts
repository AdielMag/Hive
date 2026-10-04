import { describe, expect, it } from "vitest";
import {
  hasActiveSubagents,
  indexSubagents,
  parseAgentResultText,
  parseGetResultText,
  parseOutputLines,
  resolveSubagentView,
} from "../src/ai/subagents.ts";
import type { AssistantBlock, Timeline } from "../src/index.ts";

describe("subagents helpers", () => {
  it("parses Agent ID and Output file from result text", () => {
    const text = `Agent started in background.
Agent ID: agent_abc_123
Type: Scout
Output file: C:\\temp\\agent_abc_123.output`;

    const parsed = parseAgentResultText(text);
    expect(parsed.agentId).toBe("agent_abc_123");
    expect(parsed.outputFile).toBe("C:\\temp\\agent_abc_123.output");
  });

  it("parses get_subagent_result output", () => {
    const text = `Agent: agent_abc_123
Status: completed
Execution summary here...`;

    const parsed = parseGetResultText(text);
    expect(parsed.agentId).toBe("agent_abc_123");
    expect(parsed.status).toBe("completed");
  });

  it("indexes subagents and handles completion notifications with others", () => {
    const timeline: Timeline = {
      items: [
        {
          kind: "assistant",
          key: "a1",
          streaming: false,
          blocks: [
            {
              type: "toolCall",
              id: "call_agent",
              name: "Agent",
              arguments: { description: "Explore codebase" },
              complete: true,
            },
          ],
        },
        {
          kind: "custom",
          key: "c1",
          customType: "subagent-notification",
          text: "Agent group finished",
          images: [],
          details: {
            id: "agent_primary",
            description: "Primary agent",
            status: "completed",
            totalCost: 0.02,
            others: [
              {
                id: "agent_secondary",
                description: "Secondary agent",
                status: "failed",
                totalCost: 0.01,
              },
            ],
          },
        },
      ],
      toolResults: {
        call_agent: {
          toolCallId: "call_agent",
          toolName: "Agent",
          isError: false,
          text: "Agent ID: agent_primary\nOutput file: /tmp/agent_primary.output",
          images: [],
        },
      },
    };

    const index = indexSubagents(timeline);
    expect(index.cards.get("agent_primary")).toBe("call_agent");
    expect(index.notifications.has("agent_primary")).toBe(true);
    expect(index.notifications.get("agent_primary")?.details.status).toBe("completed");
    expect(index.notifications.has("agent_secondary")).toBe(true);
    expect(index.notifications.get("agent_secondary")?.details.status).toBe("failed");
  });

  it("resolves subagent view and applies background notifications", () => {
    const block: AssistantBlock & { type: "toolCall" } = {
      type: "toolCall",
      id: "call_1",
      name: "Agent",
      arguments: {
        description: "Scout task",
        subagent_type: "scout",
        prompt: "Check files",
        thinking: "high",
        run_in_background: true,
      },
      complete: true,
    };

    const result = {
      toolCallId: "call_1",
      toolName: "Agent",
      isError: false,
      text: "Agent ID: bg_1\nOutput file: /tmp/bg_1.output",
      images: [],
    };

    const index = {
      notifications: new Map([
        [
          "bg_1",
          {
            details: {
              id: "bg_1",
              description: "Scout task",
              status: "completed",
              totalCost: 0.045,
              totalTokens: 25000,
              toolUses: 12,
            },
            itemKey: "c1",
          },
        ],
      ]),
      results: new Map(),
      cards: new Map([["bg_1", "call_1"]]),
    };

    const view = resolveSubagentView({ block, result, subagentIndex: index });
    expect(view.agentId).toBe("bg_1");
    expect(view.status).toBe("completed");
    expect(view.thinking).toBe("high");
    expect(view.cost).toBe(0.045);
    expect(view.toolUses).toBe(12);
  });

  it("does not report completed before the subagent run has a result", () => {
    const block = {
      type: "toolCall" as const,
      id: "call_2",
      name: "Agent",
      arguments: { description: "Scout", subagent_type: "scout", prompt: "x" },
      complete: false,
    };
    expect(resolveSubagentView({ block }).status).toBe("running");
    const run = { toolCallId: "call_2", toolName: "Agent", args: {}, status: "running" as const, startedAt: 0 };
    expect(resolveSubagentView({ block, run }).status).toBe("running");
  });

  it("does not show an orphaned call as queued", () => {
    const block = {
      type: "toolCall" as const,
      id: "call_3",
      name: "Agent",
      arguments: { description: "Scout", subagent_type: "scout", prompt: "x" },
      complete: true,
    };
    // Session executing but the run start was missed (tab switch / reload): in flight.
    expect(resolveSubagentView({ block, sessionRunning: true }).status).toBe("running");
    // Session idle and no result: nothing is running it any more.
    expect(resolveSubagentView({ block, sessionRunning: false }).status).toBe("aborted");
  });

  it("parses output lines into user prompt and messages", () => {
    const lines = [
      {
        isSidechain: true,
        agentId: "a1",
        type: "user",
        message: { role: "user", content: "Initial prompt text" },
      },
      {
        isSidechain: true,
        agentId: "a1",
        type: "assistant",
        message: { role: "assistant", content: [{ type: "text", text: "Answer" }] },
      },
    ];

    const parsed = parseOutputLines(lines);
    expect(parsed.prompt).toBe("Initial prompt text");
    expect(parsed.messages).toHaveLength(2);
    expect(parsed.messages[0]?.role).toBe("user");
    expect(parsed.messages[1]?.role).toBe("assistant");
  });

  it("parses Task ID from workflow result text and resolves SubagentWorkflow", () => {
    const text = `Workflow "test-flow" started in the background.\nTask ID: wf_123456\nScript: /tmp/test.js`;
    const parsed = parseAgentResultText(text);
    expect(parsed.agentId).toBe("wf_123456");

    const block: AssistantBlock & { type: "toolCall" } = {
      type: "toolCall",
      id: "call_wf",
      name: "SubagentWorkflow",
      arguments: { script: "phase('Test'); await agent('hello');" },
      complete: true,
    };
    const result = {
      toolCallId: "call_wf",
      toolName: "SubagentWorkflow",
      isError: false,
      text,
      details: { taskId: "wf_123456" },
      images: [],
    };

    // Before notification arrives, it stays in background status
    const pendingView = resolveSubagentView({ block, result, subagentIndex: { notifications: new Map(), results: new Map(), cards: new Map() } });
    expect(pendingView.agentId).toBe("wf_123456");
    expect(pendingView.status).toBe("background");

    // After notification arrives, it completes
    const completedIndex = {
      notifications: new Map([
        ["wf_123456", { details: { id: "wf_123456", description: "Workflow test-flow", status: "completed" }, itemKey: "c_wf" }],
      ]),
      results: new Map(),
      cards: new Map([["wf_123456", "call_wf"]]),
    };
    const completedView = resolveSubagentView({ block, result, subagentIndex: completedIndex });
    expect(completedView.status).toBe("completed");
  });

  it("determines whether timeline has active subagents", () => {
    const timeline: Timeline = {
      items: [
        {
          kind: "assistant",
          key: "a1",
          streaming: false,
          blocks: [
            {
              type: "toolCall",
              id: "call_bg",
              name: "Agent",
              arguments: { description: "Scout task", run_in_background: true },
              complete: true,
            },
          ],
        },
      ],
      toolResults: {
        call_bg: {
          toolCallId: "call_bg",
          toolName: "Agent",
          isError: false,
          text: "Agent started in background.\nAgent ID: bg_999",
          details: { status: "background", agentId: "bg_999" },
          images: [],
        },
      },
    };

    // Initially active because no completion notification exists
    expect(hasActiveSubagents(timeline)).toBe(true);

    // After notification item is added to timeline
    timeline.items.push({
      kind: "custom",
      key: "c_notif",
      customType: "subagent-notification",
      text: "Finished",
      images: [],
      details: { id: "bg_999", description: "Scout task", status: "completed" },
    });

    expect(hasActiveSubagents(timeline)).toBe(false);
  });
});
