import { describe, expect, it } from "vitest";
import {
  collectSubagents,
  hasActiveSubagents,
  indexSubagents,
  parseAgentResultText,
  parseGetResultText,
  parseOutputLines,
  parseTokenCount,
  getSubagentDetails,
  resolveSubagentView,
  summarizeSubagents,
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

  it("parses token count strings accurately", () => {
    expect(parseTokenCount(1234)).toBe(1234);
    expect(parseTokenCount("17.1k token")).toBe(17100);
    expect(parseTokenCount("25k")).toBe(25000);
    expect(parseTokenCount("1.5m")).toBe(1500000);
    expect(parseTokenCount("2,450 tokens")).toBe(2450);
    expect(parseTokenCount("invalid")).toBeUndefined();
    expect(parseTokenCount(undefined)).toBeUndefined();
  });

  it("collects subagents and computes usage summary", () => {
    const timeline: Timeline = {
      items: [
        {
          kind: "assistant",
          key: "a1",
          streaming: false,
          blocks: [
            {
              type: "toolCall",
              id: "call_scout",
              name: "Agent",
              arguments: { description: "Explore files", subagent_type: "scout" },
              complete: true,
            },
            {
              type: "toolCall",
              id: "call_worker",
              name: "Agent",
              arguments: { description: "Implement fix", subagent_type: "worker" },
              complete: true,
            },
          ],
        },
      ],
      toolResults: {
        call_scout: {
          toolCallId: "call_scout",
          toolName: "Agent",
          isError: false,
          text: "Agent completed",
          images: [],
          details: {
            subagentType: "scout",
            description: "Explore files",
            status: "completed",
            cost: 0.002,
            tokens: "15k token",
            toolUses: 5,
            turnCount: 4,
          },
        },
        call_worker: {
          toolCallId: "call_worker",
          toolName: "Agent",
          isError: false,
          text: "Agent completed",
          images: [],
          details: {
            subagentType: "worker",
            description: "Implement fix",
            status: "completed",
            cost: 0.045,
            totalTokens: 30000,
            toolUses: 8,
            turnCount: 6,
          },
        },
      },
    };

    const agents = collectSubagents(timeline, false);
    expect(agents).toHaveLength(2);
    expect(agents[0]?.type).toBe("scout");
    expect(agents[0]?.cost).toBe(0.002);
    expect(agents[0]?.totalTokens).toBe(15000);
    expect(agents[1]?.type).toBe("worker");
    expect(agents[1]?.cost).toBe(0.045);
    expect(agents[1]?.totalTokens).toBe(30000);

    const summary = summarizeSubagents(agents);
    expect(summary.count).toBe(2);
    expect(summary.completedCount).toBe(2);
    expect(summary.activeCount).toBe(0);
    expect(summary.totalCost).toBeCloseTo(0.047, 5);
    expect(summary.totalTokens).toBe(45000);
    expect(summary.totalToolUses).toBe(13);
    expect(summary.totalTurns).toBe(10);
  });
});

describe("unified subagent tool (pi extension `subagent`)", () => {
  const sub = (id: string, args: Record<string, unknown>): AssistantBlock & { type: "toolCall" } => ({
    type: "toolCall",
    id,
    name: "subagent",
    arguments: args,
    complete: true,
  });

  it("resolves single-mode details into agent, task, usage and tool-use counts", () => {
    const block = sub("call_single", { agent: "scout", task: "Find the router" });
    const timeline: Timeline = {
      items: [
        { kind: "assistant", key: "a1", streaming: false, blocks: [block] },
      ],
      toolResults: {
        call_single: {
          toolCallId: "call_single",
          toolName: "subagent",
          isError: false,
          text: "done",
          images: [],
          details: {
            mode: "single",
            results: [
              {
                agent: "scout",
                task: "Find the router",
                exitCode: 0,
                model: "antigravity/gemini-3.8-flash",
                usage: { input: 1000, output: 200, cacheRead: 0, cacheWrite: 0, cost: 0.004, turns: 2 },
                messages: [
                  { role: "assistant", content: [{ type: "toolCall", id: "t1", name: "read", arguments: {} }] },
                  { role: "toolResult", toolCallId: "t1", toolName: "read", content: [{ type: "text", text: "ok" }] },
                  { role: "assistant", content: [{ type: "text", text: "Router is in src/router.ts" }] },
                ],
              },
            ],
          },
        },
      },
    };

    const [view] = collectSubagents(timeline, false);
    expect(view?.type).toBe("scout");
    expect(view?.description).toBe("Find the router");
    expect(view?.model).toBe("antigravity/gemini-3.8-flash");
    expect(view?.status).toBe("completed");
    expect(view?.cost).toBeCloseTo(0.004, 6);
    expect(view?.totalTokens).toBe(1200);
    expect(view?.toolUses).toBe(1);
    expect(view?.turns).toBe(2);
    expect(view?.messages).toHaveLength(3);
    expect(hasActiveSubagents(timeline)).toBe(false);
  });

  it("treats a parallel call with a live partial as active and keeps every task", () => {
    const block = sub("call_par", {
      tasks: [
        { agent: "scout", task: "A" },
        { agent: "worker", task: "B" },
      ],
    });
    const timeline: Timeline = {
      items: [{ kind: "assistant", key: "a1", streaming: false, blocks: [block] }],
      toolResults: {},
    };
    const run = {
      status: "running",
      partial: {
        details: {
          mode: "parallel",
          results: [
            { agent: "scout", task: "A", exitCode: 0, messages: [] },
            { agent: "worker", task: "B", exitCode: -1, messages: [] },
          ],
        },
      },
    } as unknown as Parameters<typeof resolveSubagentView>[0]["run"];

    const view = resolveSubagentView({ block, run, subagentIndex: indexSubagents(timeline), sessionRunning: true });
    expect(view.type).toBe("scout, worker");
    expect(view.description).toBe("2 parallel tasks");
    expect(view.status).toBe("running");
    expect(view.subagentDetails?.results).toHaveLength(2);
    expect(hasActiveSubagents(timeline)).toBe(true);
  });

  it("shows a chain call as aborted when the session is idle and the result never arrived", () => {
    const block = sub("call_chain", {
      chain: [
        { agent: "scout", task: "Find" },
        { agent: "worker", task: "Fix" },
      ],
    });
    const timeline: Timeline = {
      items: [{ kind: "assistant", key: "a1", streaming: false, blocks: [block] }],
      toolResults: {},
    };

    const [view] = collectSubagents(timeline, false);
    expect(view?.type).toBe("scout → worker");
    expect(view?.description).toBe("2 chain steps");
    expect(view?.prompt).toContain("Step 2 [worker]: Fix");
    expect(view?.status).toBe("aborted");
  });
});

describe("subagent tool regressions", () => {
  it("rejects legacy Agent details as unified subagent details", () => {
    expect(getSubagentDetails({ subagentType: "scout", status: "completed", cost: 0.01 })).toBeUndefined();
    expect(getSubagentDetails(undefined)).toBeUndefined();
    expect(getSubagentDetails({ results: "nope" })).toBeUndefined();
    expect(getSubagentDetails({ results: [] })).toEqual({ results: [] });
  });

  it("gives two calls to the same agent distinct ids, so they never share a card or tab", () => {
    const mk = (id: string): AssistantBlock & { type: "toolCall" } => ({
      type: "toolCall",
      id,
      name: "subagent",
      arguments: { agent: "scout", task: "look" },
      complete: true,
    });
    const timeline: Timeline = {
      items: [{ kind: "assistant", key: "a1", streaming: false, blocks: [mk("c1"), mk("c2")] }],
      toolResults: {
        c1: { toolCallId: "c1", toolName: "subagent", isError: false, text: "", images: [], details: { mode: "single", results: [{ agent: "scout", task: "look", exitCode: 0, messages: [] }] } },
        c2: { toolCallId: "c2", toolName: "subagent", isError: false, text: "", images: [], details: { mode: "single", results: [{ agent: "scout", task: "look", exitCode: 0, messages: [] }] } },
      },
    };
    const views = collectSubagents(timeline, false);
    expect(views.map((v) => v.agentId)).toEqual(["c1", "c2"]);
    expect(views.every((v) => v.stopId === undefined)).toBe(true);
  });

  it("never treats a synchronous subagent answer as background work", () => {
    const block: AssistantBlock & { type: "toolCall" } = {
      type: "toolCall",
      id: "c3",
      name: "subagent",
      arguments: { agent: "scout", task: "check" },
      complete: true,
    };
    const timeline: Timeline = {
      items: [{ kind: "assistant", key: "a1", streaming: false, blocks: [block] }],
      toolResults: {
        c3: {
          toolCallId: "c3",
          toolName: "subagent",
          isError: false,
          text: "Job will finish in background later",
          images: [],
          details: { mode: "single", results: [{ agent: "scout", task: "check", exitCode: 0, messages: [] }] },
        },
      },
    };
    const [view] = collectSubagents(timeline, false);
    expect(view?.background).toBe(false);
    expect(view?.status).toBe("completed");
  });

  it("does not keep a finished call spinning on a leftover exitCode -1", () => {
    const block: AssistantBlock & { type: "toolCall" } = {
      type: "toolCall",
      id: "c4",
      name: "subagent",
      arguments: { agent: "scout", task: "x" },
      complete: true,
    };
    const timeline: Timeline = {
      items: [{ kind: "assistant", key: "a1", streaming: false, blocks: [block] }],
      toolResults: {
        c4: {
          toolCallId: "c4",
          toolName: "subagent",
          isError: false,
          text: "",
          images: [],
          details: { mode: "single", results: [{ agent: "scout", task: "x", exitCode: -1, messages: [] }] },
        },
      },
    };
    const [view] = collectSubagents(timeline, true);
    expect(view?.status).not.toBe("running");
  });
});
