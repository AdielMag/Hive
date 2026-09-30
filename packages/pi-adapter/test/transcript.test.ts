import { describe, expect, it } from "vitest";
import { applyEvent, applyEntries, buildTimeline, createTranscript } from "../src/transcript.ts";
import type { PiStreamEvent } from "@pi-studio/protocol";
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
});
