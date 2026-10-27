import { describe, expect, it } from "vitest";
import type { TimelineItem, ToolResultView, ToolRun } from "@hive/pi-adapter";
import {
  cleanBashCommand,
  extractBasename,
  extractToolPill,
  groupTimelineItems,
  isBatchableTool,
  type ToolCallBlockT,
} from "./tool-batch.ts";

describe("tool-batch utilities", () => {
  describe("extractBasename", () => {
    it("extracts filename from posix and windows paths", () => {
      expect(extractBasename("src/renderer/Transcript.tsx")).toBe("Transcript.tsx");
      expect(extractBasename("C:\\Users\\talel\\Documents\\cart.js")).toBe("cart.js");
      expect(extractBasename("plain-file.txt")).toBe("plain-file.txt");
      expect(extractBasename("folder/subfolder/")).toBe("subfolder");
      expect(extractBasename("")).toBe("");
    });
  });

  describe("cleanBashCommand", () => {
    it("strips directory change prefix and trailing redirect noise", () => {
      expect(
        cleanBashCommand('cd "C:/Users/talel/repo" && npm test 2>&1')
      ).toBe("npm test");
      expect(
        cleanBashCommand("cd /tmp/sandbox; git status --short")
      ).toBe("git status --short");
      expect(cleanBashCommand("vitest run 2>&1")).toBe("vitest run");
      expect(cleanBashCommand("  echo hello  ")).toBe("echo hello");
    });
  });

  describe("extractToolPill", () => {
    it("extracts pill data for file tools (read/edit/write)", () => {
      const readBlock: ToolCallBlockT = {
        type: "toolCall",
        id: "call-1",
        name: "read",
        arguments: { path: "src/renderer/components/Transcript.tsx", offset: 50 },
        complete: true,
      };
      const pill = extractToolPill(readBlock);
      expect(pill.op).toBe("read");
      expect(pill.opCategory).toBe("read");
      expect(pill.target).toBe("Transcript.tsx:50");
      expect(pill.filePath).toBe("src/renderer/components/Transcript.tsx");
      expect(pill.isError).toBe(false);
      expect(pill.isRunning).toBe(false);

      const editBlock: ToolCallBlockT = {
        type: "toolCall",
        id: "call-2",
        name: "edit",
        arguments: { path: "src/cart.js" },
        complete: true,
      };
      const editResult: ToolResultView = {
        toolCallId: "call-2",
        toolName: "edit",
        isError: true,
        text: "error",
        images: [],
      };
      const editPill = extractToolPill(editBlock, editResult);
      expect(editPill.op).toBe("edit");
      expect(editPill.opCategory).toBe("edit");
      expect(editPill.target).toBe("cart.js");
      expect(editPill.isError).toBe(true);
    });

    it("extracts pill data for bash commands", () => {
      const bashBlock: ToolCallBlockT = {
        type: "toolCall",
        id: "call-3",
        name: "bash",
        arguments: { command: "cd /dir && npm test 2>&1" },
        complete: true,
      };
      const pill = extractToolPill(bashBlock, undefined, true);
      expect(pill.op).toBe("$");
      expect(pill.opCategory).toBe("bash");
      expect(pill.target).toBe("npm test");
      expect(pill.tooltip).toBe("$ cd /dir && npm test 2>&1");
      expect(pill.isRunning).toBe(true);
      expect(pill.filePath).toBeUndefined();
    });

    it("extracts pill data for search tools", () => {
      const grepBlock: ToolCallBlockT = {
        type: "toolCall",
        id: "call-4",
        name: "grep",
        arguments: { pattern: "ToolBatchGroup", path: "src/components" },
        complete: true,
      };
      const pill = extractToolPill(grepBlock);
      expect(pill.op).toBe("grep");
      expect(pill.opCategory).toBe("search");
      expect(pill.target).toBe("ToolBatchGroup in components");
    });
  });

  describe("isBatchableTool", () => {
    it("filters out subagents and module-matched cards", () => {
      const subagentBlock: ToolCallBlockT = {
        type: "toolCall",
        id: "s1",
        name: "Agent",
        arguments: { prompt: "test" },
        complete: true,
      };
      expect(isBatchableTool(subagentBlock)).toBe(false);

      const planReviewBlock: ToolCallBlockT = {
        type: "toolCall",
        id: "p1",
        name: "plan_review",
        arguments: {},
        complete: true,
      };
      expect(
        isBatchableTool(planReviewBlock, (name) => name === "plan_review")
      ).toBe(false);

      const readBlock: ToolCallBlockT = {
        type: "toolCall",
        id: "r1",
        name: "read",
        arguments: { path: "a.ts" },
        complete: true,
      };
      expect(isBatchableTool(readBlock)).toBe(true);
    });
  });

  describe("groupTimelineItems", () => {
    const results: Record<string, ToolResultView> = {
      t1: { toolCallId: "t1", toolName: "read", text: "ok", isError: false, images: [] },
      t2: { toolCallId: "t2", toolName: "edit", text: "ok", isError: false, images: [] },
      t3: { toolCallId: "t3", toolName: "bash", text: "ok", isError: false, images: [] },
    };
    const tools: Record<string, ToolRun | undefined> = {};

    it("batches consecutive assistant messages with tool calls (>= 2)", () => {
      const items: TimelineItem[] = [
        { kind: "user", key: "u1", text: "Fix cart bug", images: [] },
        {
          kind: "assistant",
          key: "a1",
          blocks: [
            { type: "thinking", thinking: "Read cart" },
            { type: "toolCall", id: "t1", name: "read", arguments: { path: "src/cart.js" }, complete: true },
          ],
          streaming: false,
        },
        {
          kind: "assistant",
          key: "a2",
          blocks: [
            { type: "thinking", thinking: "Edit cart" },
            { type: "toolCall", id: "t2", name: "edit", arguments: { path: "src/cart.js" }, complete: true },
          ],
          streaming: false,
        },
        {
          kind: "assistant",
          key: "a3",
          blocks: [
            { type: "toolCall", id: "t3", name: "bash", arguments: { command: "npm test" }, complete: true },
          ],
          streaming: false,
        },
        {
          kind: "assistant",
          key: "a4",
          blocks: [{ type: "text", text: "All tests pass!" }],
          streaming: false,
        },
      ];

      const grouped = groupTimelineItems(items, results, tools);
      // user, thought, read, thought, [edit+bash batch], text — thoughts break batches
      expect(grouped.map((g) => g.kind)).toEqual([
        "timelineRow",
        "timelineRow",
        "timelineRow",
        "timelineRow",
        "toolBatch",
        "timelineRow",
      ]);

      const batch = grouped[4];
      if (batch?.kind === "toolBatch") {
        expect(batch.items.map((i) => i.block.id)).toEqual(["t2", "t3"]);
      }
    });

    it("keeps a single tool call unbatched", () => {
      const items: TimelineItem[] = [
        { kind: "user", key: "u1", text: "Read package.json", images: [] },
        {
          kind: "assistant",
          key: "a1",
          blocks: [
            { type: "toolCall", id: "t1", name: "read", arguments: { path: "package.json" }, complete: true },
          ],
          streaming: false,
        },
        {
          kind: "assistant",
          key: "a2",
          blocks: [{ type: "text", text: "Package details here" }],
          streaming: false,
        },
      ];

      const grouped = groupTimelineItems(items, results, tools);
      expect(grouped).toHaveLength(3); // user, single assistant tool, assistant text
      expect(grouped[1]?.kind).toBe("timelineRow");
      const g1 = grouped[1];
      if (g1?.kind === "timelineRow") {
        expect(g1.item.kind).toBe("assistant");
      }
    });

    it("batches multiple tool calls inside a single assistant message", () => {
      const items: TimelineItem[] = [
        {
          kind: "assistant",
          key: "a1",
          blocks: [
            { type: "toolCall", id: "t1", name: "read", arguments: { path: "a.ts" }, complete: true },
            { type: "toolCall", id: "t2", name: "read", arguments: { path: "b.ts" }, complete: true },
          ],
          streaming: false,
        },
      ];

      const grouped = groupTimelineItems(items, results, tools);
      expect(grouped).toHaveLength(1);
      expect(grouped[0]?.kind).toBe("toolBatch");
      if (grouped[0]?.kind === "toolBatch") {
        expect(grouped[0].items).toHaveLength(2);
      }
    });

    it("separates introductory text from tool calls in same assistant message", () => {
      const items: TimelineItem[] = [
        {
          kind: "assistant",
          key: "a1",
          blocks: [
            { type: "text", text: "Let me check the files first." },
            { type: "toolCall", id: "t1", name: "read", arguments: { path: "a.ts" }, complete: true },
          ],
          streaming: false,
        },
        {
          kind: "assistant",
          key: "a2",
          blocks: [
            { type: "toolCall", id: "t2", name: "read", arguments: { path: "b.ts" }, complete: true },
          ],
          streaming: false,
        },
      ];

      const grouped = groupTimelineItems(items, results, tools);
      expect(grouped).toHaveLength(2); // text message, toolBatch
      expect(grouped[0]?.kind).toBe("timelineRow");
      expect(grouped[1]?.kind).toBe("toolBatch");
      if (grouped[1]?.kind === "toolBatch") {
        expect(grouped[1].items).toHaveLength(2);
      }
    });

    it("does not batch interactive cards like Agent", () => {
      const items: TimelineItem[] = [
        {
          kind: "assistant",
          key: "a1",
          blocks: [
            { type: "toolCall", id: "t1", name: "read", arguments: { path: "a.ts" }, complete: true },
          ],
          streaming: false,
        },
        {
          kind: "assistant",
          key: "a2",
          blocks: [
            { type: "toolCall", id: "agent-1", name: "Agent", arguments: { prompt: "run task" }, complete: true },
          ],
          streaming: false,
        },
        {
          kind: "assistant",
          key: "a3",
          blocks: [
            { type: "toolCall", id: "t2", name: "read", arguments: { path: "b.ts" }, complete: true },
          ],
          streaming: false,
        },
      ];

      const grouped = groupTimelineItems(items, results, tools);
      expect(grouped).toHaveLength(3);
      // None should be toolBatch since they are separated by Agent
      expect(grouped.every((g) => g.kind === "timelineRow")).toBe(true);
    });
  });
});
