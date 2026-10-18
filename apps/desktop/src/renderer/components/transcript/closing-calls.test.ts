import { describe, expect, it } from "vitest";
import type { AssistantBlock, TimelineItem } from "@hive/pi-adapter";
import { findClosingCalls, type ToolCallBlockT } from "./tool-batch.ts";

const call = (id: string, name: string): ToolCallBlockT => ({ type: "toolCall", id, name, arguments: {}, complete: true });
const asst = (key: string, blocks: AssistantBlock[]): TimelineItem => ({ kind: "assistant", key, blocks, streaming: false }) as TimelineItem;
const isJev = (b: ToolCallBlockT) => b.name === "ask_jev";

describe("findClosingCalls", () => {
  it("returns the matching run after the final text", () => {
    const items = [asst("a", [{ type: "text", text: "Done." }, call("1", "ask_jev")]), asst("b", [call("2", "ask_jev")])];
    expect(findClosingCalls(items, isJev).map((b) => b.id)).toEqual(["1", "2"]);
  });
  it("ignores mid-work calls and runs followed by other tools", () => {
    expect(findClosingCalls([asst("a", [call("1", "ask_jev")])], isJev)).toEqual([]);
    expect(findClosingCalls([asst("a", [{ type: "text", text: "x" }, call("1", "ask_jev"), call("2", "bash")])], isJev)).toEqual([]);
  });
  it("sees through turn timers and the jev-enforce hook notice", () => {
    const items = [
      asst("a", [{ type: "text", text: "Done." }]),
      { kind: "turn", key: "t", ms: 1 },
      { kind: "custom", key: "c", customType: "jev-enforce", text: "run jev", images: [] },
      asst("b", [call("1", "ask_jev")]),
    ] as TimelineItem[];
    expect(findClosingCalls(items, isJev).map((b) => b.id)).toEqual(["1"]);
  });
});
