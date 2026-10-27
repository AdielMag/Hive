import { describe, expect, it } from "vitest";
import { applyEvent, buildTimeline, createTranscript, type TranscriptState } from "@hive/pi-adapter";
import type { PiStreamEvent } from "@hive/protocol";
import { getTimeline } from "./transcript-timeline.ts";

const ev = (e: Record<string, unknown>) => e as unknown as PiStreamEvent;
const end = (message: Record<string, unknown>) => ev({ type: "message_end", message: { timestamp: Date.now(), ...message } });

function sequence(): TranscriptState[] {
  const states: TranscriptState[] = [];
  let s = createTranscript();
  const push = (e: PiStreamEvent) => {
    s = applyEvent(s, e);
    states.push(s);
  };
  push(ev({ type: "agent_start" }));
  push(end({ role: "user", content: "hello" }));
  push(ev({ type: "message_start", message: { role: "assistant", content: [], provider: "p", model: "m" } }));
  for (const chunk of ["a", "b", "c"]) {
    push(
      ev({
        type: "message_update",
        message: { role: "assistant", content: [] },
        assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: chunk, partial: { role: "assistant", content: [] } },
      }),
    );
  }
  push(end({ role: "assistant", content: [{ type: "text", text: "abc" }], provider: "p", model: "m" }));
  push(end({ role: "user", content: "again" }));
  push(ev({ type: "message_start", message: { role: "assistant", content: [], provider: "p", model: "m" } }));
  push(ev({ type: "agent_settled" }));
  return states;
}

describe("getTimeline", () => {
  it("matches buildTimeline across a simulated streaming sequence", () => {
    for (const state of sequence()) {
      expect(getTimeline(state)).toEqual(buildTimeline(state));
    }
  });

  it("returns the same object for the same transcript and reuses the base across streaming batches", () => {
    const states = sequence().filter((s) => s.streaming);
    expect(getTimeline(states[0]!)).toBe(getTimeline(states[0]!));
    const a = getTimeline(states[1]!);
    const b = getTimeline(states[2]!);
    // Persisted items keep identity; only the streaming item differs.
    expect(a.items.slice(0, -1).every((it, i) => it === b.items[i])).toBe(true);
    expect(a.toolResults).toBe(b.toolResults);
  });
});
