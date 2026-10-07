import { describe, expect, it } from "vitest";
import { applyEvent, applyEntries, buildTimeline, computeTurnStats, createTranscript, messagesToTimeline } from "../src/transcript.ts";
import type { PiStreamEvent } from "@hive/protocol";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";

describe("transcript reducer", () => {
  it("accumulates text and thinking deltas into streaming message", () => {
    let state = createTranscript();
    state = applyEvent(state, { type: "agent_start" } as unknown as PiStreamEvent);
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
    } as unknown as PiStreamEvent);
    state = applyEvent(state, {
      type: "message_update",
      assistantMessageEvent: { type: "thinking_delta", contentIndex: 0, delta: "Ponder" },
    } as unknown as PiStreamEvent);
    state = applyEvent(state, {
      type: "message_update",
      assistantMessageEvent: { type: "thinking_delta", contentIndex: 0, delta: "ing..." },
    } as unknown as PiStreamEvent);

    // text delta
    state = applyEvent(state, {
      type: "message_update",
      assistantMessageEvent: { type: "text_start", contentIndex: 1 },
    } as unknown as PiStreamEvent);
    state = applyEvent(state, {
      type: "message_update",
      assistantMessageEvent: { type: "text_delta", contentIndex: 1, delta: "Hello " },
    } as unknown as PiStreamEvent);
    state = applyEvent(state, {
      type: "message_update",
      assistantMessageEvent: { type: "text_delta", contentIndex: 1, delta: "world!" },
    } as unknown as PiStreamEvent);

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

    state = applyEvent(state, { type: "agent_settled" } as unknown as PiStreamEvent);
    expect(state.running).toBe(false);
  });

  it("handles tool execution lifecycle and associates results", () => {
    let state = createTranscript();
    state = applyEvent(state, {
      type: "tool_execution_start",
      toolCallId: "call_1",
      toolName: "read",
      args: { path: "README.md" },
    } as unknown as PiStreamEvent);

    expect(state.tools["call_1"]?.status).toBe("running");

    state = applyEvent(state, {
      type: "tool_execution_end",
      toolCallId: "call_1",
      toolName: "read",
      isError: false,
      result: { content: [{ type: "text", text: "file content" }] },
    } as unknown as PiStreamEvent);

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
    } as unknown as PiStreamEvent);

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
    expect(timeline.items).toHaveLength(3); // user, assistant, end-of-turn divider
    expect(timeline.items[0]?.kind).toBe("user");
    expect(timeline.items[1]?.kind).toBe("assistant");
    expect(timeline.items[2]?.kind).toBe("turn");
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

  describe("turn timing", () => {
    const at = (sec: number) => new Date(Date.UTC(2026, 0, 1, 12, 0, sec)).toISOString();
    const ms = (sec: number) => Date.UTC(2026, 0, 1, 12, 0, sec);
    const entry = (id: string, parentId: string | null, sec: number, message: Record<string, unknown>) =>
      ({ type: "message", id, parentId, timestamp: at(sec), message }) as unknown as SessionEntry;
    const entries = [
      entry("u1", null, 0, { role: "user", content: "a", timestamp: ms(0) }),
      entry("a1", "u1", 10, { role: "assistant", content: [], timestamp: ms(2) }),
      entry("t1", "a1", 12, { role: "toolResult", toolCallId: "x", content: [], timestamp: ms(12) }),
      entry("a2", "t1", 30, { role: "assistant", content: [], timestamp: ms(13) }),
      entry("u2", "a2", 100, { role: "user", content: "b", timestamp: ms(100) }),
      entry("a3", "u2", 105, { role: "assistant", content: [], timestamp: ms(101) }),
    ];

    it("sums finished turns and emits an end-of-turn divider per turn", () => {
      const state = applyEntries(createTranscript(), entries, "a3", "replace");
      const stats = computeTurnStats(state);
      expect(stats).toMatchObject({ turns: 2, completedMs: 35_000, lastMs: 5_000, activeStart: null });
      const turns = buildTimeline(state).items.filter((i) => i.kind === "turn");
      expect(turns.map((t) => (t as { ms: number }).ms)).toEqual([30_000, 5_000]);
    });

    it("leaves the running turn out of the totals and the timeline", () => {
      let state = applyEntries(createTranscript(), entries.slice(0, 4), "a2", "replace");
      state = applyEvent(state, { type: "agent_start" } as unknown as PiStreamEvent);
      state = applyEvent(state, { type: "message_end", message: { role: "user", content: "b", timestamp: ms(100) } } as unknown as PiStreamEvent);
      const stats = computeTurnStats(state);
      expect(stats).toMatchObject({ turns: 1, completedMs: 30_000, activeStart: ms(100) });
      expect(stats.runStartedAt).not.toBeNull();
      expect(buildTimeline(state).items.filter((i) => i.kind === "turn")).toHaveLength(1);
    });

    it("excludes time spent waiting on a question tool", () => {
      const q = [
        entry("u1", null, 0, { role: "user", content: "a", timestamp: ms(0) }),
        entry("a1", "u1", 10, { role: "assistant", content: [], timestamp: ms(2) }),
        entry("t1", "a1", 70, { role: "toolResult", toolName: "questionnaire", toolCallId: "x", content: [], timestamp: ms(70) }),
        entry("a2", "t1", 75, { role: "assistant", content: [], timestamp: ms(71) }),
      ];
      const state = applyEntries(createTranscript(), q, "a2", "replace");
      expect(computeTurnStats(state).completedMs).toBe(15_000); // 75s total minus 60s waiting on the user
      expect(buildTimeline(state).items.find((i) => i.kind === "turn")).toMatchObject({ ms: 15_000 });
    });

    it("reports an unanswered question tool as waiting while running", () => {
      let state = applyEntries(createTranscript(), entries.slice(0, 1), "u1", "replace");
      state = applyEvent(state, { type: "agent_start" } as unknown as PiStreamEvent);
      state = applyEvent(state, { type: "tool_execution_start", toolCallId: "q1", toolName: "questionnaire", args: {} } as unknown as PiStreamEvent);
      expect(computeTurnStats(state).waitingSince).not.toBeNull();
      state = applyEvent(state, { type: "tool_execution_end", toolCallId: "q1", toolName: "questionnaire", result: {}, isError: false } as unknown as PiStreamEvent);
      expect(computeTurnStats(state).waitingSince).toBeNull();
    });

    it("uses the live finish time and finalizes the turn when the run settles", () => {
      let state = createTranscript();
      state = applyEvent(state, { type: "message_end", message: { role: "user", content: "a", timestamp: 1_000 } } as unknown as PiStreamEvent);
      state = applyEvent(state, { type: "message_end", message: { role: "assistant", content: [], timestamp: 1_500 } } as unknown as PiStreamEvent);
      const live = state.live.find((m) => m.role === "assistant");
      state = { ...state, live: state.live.map((m) => (m === live ? { ...m, endedAt: 9_000 } : m)) };
      expect(computeTurnStats(state).turns).toBe(1);
      expect(computeTurnStats(state).lastMs).toBe(8_000);
      expect(computeTurnStats({ ...state, running: true }).turns).toBe(0);
    });
  });
});
