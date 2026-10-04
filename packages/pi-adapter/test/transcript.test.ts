import { describe, expect, it } from "vitest";
import { applyEvent, applyEntries, buildTimeline, createTranscript, messagesToTimeline } from "../src/transcript.ts";
import type { PiStreamEvent } from "@hive/protocol";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";

describe("transcript reducer", () => {
  it("accumulates text and thinking deltas into streaming message", () => {
    let state = createTranscript();
    state = applyEvent(state, { type: "agent_start" } as PiStreamEvent);
    expect(state.running).toBe(true);

    state = applyEvent(state, {
      type: "message_start",
      message: { role: "assistant", content: [] },
    } as unknown as PiStreamEvent);
    expect(state.streaming).not.toBeNull();

    // thinking delta
    state = applyEvent(state, {
      type: "message_update",
      assistantMessageEvent: { type: "thinking_start", contentIndex: 0 },
    } as PiStreamEvent);
    state = applyEvent(state, {
      type: "message_update",
      assistantMessageEvent: { type: "thinking_delta", contentIndex: 0, delta: "Ponder" },
    } as PiStreamEvent);
    state = applyEvent(state, {
      type: "message_update",
      assistantMessageEvent: { type: "thinking_delta", contentIndex: 0, delta: "ing..." },
    } as PiStreamEvent);

    // text delta
    state = applyEvent(state, {
      type: "message_update",
      assistantMessageEvent: { type: "text_start", contentIndex: 1 },
    } as PiStreamEvent);
    state = applyEvent(state, {
      type: "message_update",
      assistantMessageEvent: { type: "text_delta", contentIndex: 1, delta: "Hello " },
    } as PiStreamEvent);
    state = applyEvent(state, {
      type: "message_update",
      assistantMessageEvent: { type: "text_delta", contentIndex: 1, delta: "world!" },
    } as PiStreamEvent);

    expect(state.streaming?.message.content).toEqual([
      { type: "thinking", thinking: "Pondering..." },
      { type: "text", text: "Hello world!" },
    ]);

    // message_end replaces streaming with authoritative message
    state = applyEvent(state, {
      type: "message_end",
      message: {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "Pondering..." },
          { type: "text", text: "Hello world!" },
        ],
        stopReason: "stop",
        usage: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, totalTokens: 15 },
      },
    } as unknown as PiStreamEvent);

    expect(state.streaming).toBeNull();
    expect(state.live).toHaveLength(1);
    expect(state.lastUsage?.totalTokens).toBe(15);

    state = applyEvent(state, { type: "agent_settled" } as PiStreamEvent);
    expect(state.running).toBe(false);
  });

  it("handles tool execution lifecycle and associates results", () => {
    let state = createTranscript();
    state = applyEvent(state, {
      type: "tool_execution_start",
      toolCallId: "call_1",
      toolName: "read",
      args: { path: "README.md" },
    } as PiStreamEvent);

    expect(state.tools["call_1"]?.status).toBe("running");

    state = applyEvent(state, {
      type: "tool_execution_end",
      toolCallId: "call_1",
      toolName: "read",
      isError: false,
      result: { content: [{ type: "text", text: "file content" }] },
    } as PiStreamEvent);

    expect(state.tools["call_1"]?.status).toBe("done");
  });

  it("adopts an unknown run from a tool_execution_update (transcript rebuilt mid-execution)", () => {
    let state = createTranscript();
    state = applyEvent(state, {
      type: "tool_execution_update",
      toolCallId: "call_9",
      toolName: "Agent",
      args: { prompt: "x" },
      partialResult: { details: { agentId: "abc", status: "running" } },
    } as PiStreamEvent);

    expect(state.tools["call_9"]?.status).toBe("running");
    expect(state.tools["call_9"]?.toolName).toBe("Agent");
    expect(state.tools["call_9"]?.partial).toEqual({ details: { agentId: "abc", status: "running" } });
  });

  it("builds timeline from active branch and filters first system message", () => {
    let state = createTranscript();
    const entries: SessionEntry[] = [
      {
        type: "message",
        id: "e1",
        parentId: null,
        timestamp: "2026-09-30T12:00:00.000Z",
        message: {
          role: "system",
          content: "System prompt",
          sections: { preamble: "you are pi" },
          timestamp: 1000,
        },
      } as SessionEntry,
      {
        type: "message",
        id: "e2",
        parentId: "e1",
        timestamp: "2026-09-30T12:00:01.000Z",
        message: {
          role: "user",
          content: "Hi pi",
          timestamp: 1001,
        },
      } as SessionEntry,
      {
        type: "message",
        id: "e3",
        parentId: "e2",
        timestamp: "2026-09-30T12:00:02.000Z",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "Ahoy!" }],
          stopReason: "stop",
          timestamp: 1002,
        },
      } as SessionEntry,
    ];

    state = applyEntries(state, entries, "e3", "replace");
    expect(state.order).toEqual(["e1", "e2", "e3"]);
    expect(state.cursor).toBe("e3");

    const timeline = buildTimeline(state);
    // e1 is the first system message, so it's filtered out from chat view
    expect(timeline.items).toHaveLength(2);
    expect(timeline.items[0]?.kind).toBe("user");
    expect(timeline.items[1]?.kind).toBe("assistant");
  });

  it("preserves details on custom messages and custom_message entries", () => {
    let state = createTranscript();
    const notificationDetails = { id: "agent_42", status: "completed", totalCost: 0.05 };

    // Live custom message
    state = applyEvent(state, {
      type: "message_end",
      message: {
        role: "custom",
        customType: "subagent-notification",
        content: "Agent finished",
        details: notificationDetails,
      },
    } as unknown as PiStreamEvent);

    const timelineLive = buildTimeline(state);
    const customItem = timelineLive.items.find((i) => i.kind === "custom");
    expect(customItem).toBeDefined();
    if (customItem && customItem.kind === "custom") {
      expect(customItem.customType).toBe("subagent-notification");
      expect(customItem.details).toEqual(notificationDetails);
    }

    // Persisted custom_message entry
    let persistedState = createTranscript();
    persistedState = applyEntries(
      persistedState,
      [
        {
          type: "custom_message",
          id: "cm_1",
          parentId: null,
          customType: "subagent-notification",
          content: "Agent completed in background",
          display: true,
          details: notificationDetails,
        } as unknown as SessionEntry,
      ],
      "cm_1",
      "replace",
    );
    const timelinePersisted = buildTimeline(persistedState);
    const persistedItem = timelinePersisted.items[0];
    expect(persistedItem?.kind).toBe("custom");
    if (persistedItem && persistedItem.kind === "custom") {
      expect(persistedItem.details).toEqual(notificationDetails);
    }
  });

  it("builds timeline from standalone messages with messagesToTimeline", () => {
    const messages = [
      { role: "user", content: "Analyze repo", timestamp: 100 },
      {
        role: "assistant",
        content: [
          { type: "text", text: "Working on it" },
          { type: "toolCall", id: "sub_1", name: "read", arguments: { path: "package.json" }, complete: true },
        ],
        timestamp: 101,
      },
      {
        role: "toolResult",
        toolCallId: "sub_1",
        toolName: "read",
        content: [{ type: "text", text: "{ name: 'hive' }" }],
        isError: false,
        timestamp: 102,
      },
      {
        role: "assistant",
        content: [{ type: "text", text: "All done!" }],
        timestamp: 103,
      },
    ];

    const timeline = messagesToTimeline(messages, "subagent");
    expect(timeline.items).toHaveLength(3); // 1 user + 2 assistants (toolResult is mapped to toolResults)
    expect(timeline.items[0]?.kind).toBe("user");
    expect(timeline.items[1]?.kind).toBe("assistant");
    expect(timeline.items[2]?.kind).toBe("assistant");
    expect(timeline.toolResults["sub_1"]).toBeDefined();
    expect(timeline.toolResults["sub_1"]?.text).toBe("{ name: 'hive' }");
  });

  it('derives lastUsage from persisted entries on a full load (context ring after switching sessions)', () => {
    const usage = { input: 100, output: 50, cacheRead: 1000, cacheWrite: 0, totalTokens: 1150 };
    const entries = [
      { type: 'message', id: 'u1', parentId: null, timestamp: '', message: { role: 'user', content: 'hi' } },
      { type: 'message', id: 'a1', parentId: 'u1', timestamp: '', message: { role: 'assistant', content: [], usage, stopReason: 'stop' } },
      { type: 'message', id: 'u2', parentId: 'a1', timestamp: '', message: { role: 'user', content: 'again' } },
    ] as unknown as SessionEntry[];
    const state = applyEntries(createTranscript(), entries, 'u2', 'replace');
    expect(state.lastUsage?.totalTokens).toBe(1150);

    const compacted = [...entries, { type: 'compaction', id: 'c1', parentId: 'u2', timestamp: '', summary: 's' }] as unknown as SessionEntry[];
    expect(applyEntries(createTranscript(), compacted, 'c1', 'replace').lastUsage).toBeNull();
  });
});
