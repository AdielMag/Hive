import type { AssistantBlock, TimelineItem, ToolResultView, ToolRun } from "@hive/pi-adapter";

export type ToolCallBlockT = Extract<AssistantBlock, { type: "toolCall" }>;

export interface ToolBatchItem {
  block: ToolCallBlockT;
  result?: ToolResultView;
  run?: ToolRun;
  running: boolean;
  thinking?: string;
  itemKey: string;
  sourceItem?: Extract<TimelineItem, { kind: "assistant" }>;
}

export interface ToolPillData {
  op: string;
  opCategory: "read" | "edit" | "write" | "bash" | "search" | "default";
  target: string;
  tooltip: string;
  filePath?: string;
  isError: boolean;
  isRunning: boolean;
}

export type TimelineGroupItem =
  | { kind: "timelineRow"; item: TimelineItem }
  | { kind: "toolBatch"; key: string; items: ToolBatchItem[] };

/** Extract filename / basename from a Unix or Windows path. */
export function extractBasename(filePath: string): string {
  if (!filePath) return "";
  const normalized = filePath.replace(/\\/g, "/").replace(/\/+$/, "");
  const idx = normalized.lastIndexOf("/");
  return idx >= 0 ? normalized.slice(idx + 1) : normalized;
}

/** Clean up verbose wrappers around bash commands. */
export function cleanBashCommand(command: string): string {
  let cmd = command.trim();
  // Strip trailing redirect noise e.g. 2>&1
  cmd = cmd.replace(/\s+2>&1\s*$/, "");
  // If command starts with directory change e.g. cd "..." && cmd or cd ...; cmd
  const cdMatch = cmd.match(/^cd\s+(?:"[^"]*"|'[^']*'|\S+)\s*(?:&&|;)\s*(.+)$/);
  if (cdMatch && cdMatch[1]) {
    cmd = cdMatch[1].trim();
  }
  return cmd;
}

/** Extract concise pill metadata for unexpanded batch display. */
export function extractToolPill(
  block: ToolCallBlockT,
  result?: ToolResultView,
  running?: boolean
): ToolPillData {
  const args = block.arguments ?? {};
  const isError = Boolean(result?.isError);
  const isRunning = Boolean(running);

  switch (block.name) {
    case "read":
    case "edit":
    case "write":
    case "ls": {
      const rawPath = typeof args.path === "string" ? args.path : typeof args.file_path === "string" ? args.file_path : "";
      const base = extractBasename(rawPath) || block.name;
      const range = args.offset ? `:${args.offset}` : "";
      const opCategory =
        block.name === "read"
          ? "read"
          : block.name === "edit"
            ? "edit"
            : block.name === "write"
              ? "write"
              : "search";

      return {
        op: block.name,
        opCategory,
        target: `${base}${range}`,
        tooltip: `${block.name} ${rawPath}${range}`,
        filePath: rawPath || undefined,
        isError,
        isRunning,
      };
    }
    case "bash": {
      const fullCmd = typeof args.command === "string" ? args.command : "";
      const cleaned = cleanBashCommand(fullCmd);
      const shortCmd = cleaned.length > 25 ? `${cleaned.slice(0, 24)}…` : cleaned || "bash";
      return {
        op: "$",
        opCategory: "bash",
        target: shortCmd,
        tooltip: fullCmd ? `$ ${fullCmd}` : "bash",
        filePath: undefined,
        isError,
        isRunning,
      };
    }
    case "grep":
    case "find": {
      const q = typeof args.pattern === "string" ? args.pattern : typeof args.query === "string" ? args.query : "";
      const targetPath = typeof args.path === "string" ? extractBasename(args.path) : "";
      const shortQ = q.length > 20 ? `${q.slice(0, 19)}…` : q;
      const displayTarget = targetPath ? `${shortQ || block.name} in ${targetPath}` : shortQ || block.name;
      return {
        op: block.name,
        opCategory: "search",
        target: displayTarget,
        tooltip: `${block.name}: ${q} ${args.path ? `in ${args.path}` : ""}`,
        filePath: typeof args.path === "string" ? args.path : undefined,
        isError,
        isRunning,
      };
    }
    default: {
      const firstStr = Object.values(args).find((v) => typeof v === "string") as string | undefined;
      const targetStr = firstStr ? (firstStr.length > 22 ? `${firstStr.slice(0, 21)}…` : firstStr) : "";
      return {
        op: block.name.length > 8 ? `${block.name.slice(0, 7)}…` : block.name,
        opCategory: "default",
        target: targetStr || block.name,
        tooltip: `${block.name}${firstStr ? `: ${firstStr}` : ""}`,
        filePath: undefined,
        isError,
        isRunning,
      };
    }
  }
}

/** Check if a tool call should be batched into the compact row. */
export function isBatchableTool(
  block: ToolCallBlockT,
  customMatches?: (name: string, args: Record<string, unknown>) => boolean,
  hasSkillLoad?: boolean
): boolean {
  // Subagent cards and workflows have rich nested viewers / interactive tabs
  if (block.name === "Agent" || block.name === "SubagentWorkflow") return false;
  // Subagent action rows
  if (block.name === "get_subagent_result" || block.name === "steer_subagent") return false;
  // Skill load notifications
  if (hasSkillLoad) return false;
  // Module-owned custom cards (e.g. plan previewer review approval)
  if (customMatches && customMatches(block.name, (block.arguments as Record<string, unknown>) ?? {})) {
    return false;
  }
  return true;
}

/**
 * Group consecutive tooling actions (across consecutive assistant messages or within messages)
 * into compact tool batch groups if 2 or more tool calls occur without intervening user-facing text.
 */
export function groupTimelineItems(
  items: TimelineItem[],
  toolResults: Record<string, ToolResultView>,
  tools: Record<string, ToolRun | undefined>,
  isCustomCard?: (block: ToolCallBlockT) => boolean
): TimelineGroupItem[] {
  const out: TimelineGroupItem[] = [];
  let pendingBatch: ToolBatchItem[] = [];

  const flushBatch = () => {
    if (pendingBatch.length >= 2) {
      out.push({
        kind: "toolBatch",
        key: `batch-${pendingBatch.map((p) => p.block.id).join("-")}`,
        items: [...pendingBatch],
      });
    } else if (pendingBatch.length === 1) {
      const single = pendingBatch[0]!;
      const blocks: AssistantBlock[] = [];
      if (single.thinking) {
        blocks.push({ type: "thinking", thinking: single.thinking });
      }
      blocks.push(single.block);
      out.push({
        kind: "timelineRow",
        item: single.sourceItem
          ? { ...single.sourceItem, blocks }
          : {
              kind: "assistant",
              key: single.itemKey,
              blocks,
              streaming: single.running,
            },
      });
    }
    pendingBatch = [];
  };

  for (const item of items) {
    if (item.kind !== "assistant") {
      flushBatch();
      out.push({ kind: "timelineRow", item });
      continue;
    }

    // If assistant item has an error message, flush and display it as an item
    if (item.errorMessage) {
      flushBatch();
      out.push({ kind: "timelineRow", item });
      continue;
    }

    const hasText = item.blocks.some(
      (b) => b.type === "text" && Boolean(b.text?.trim())
    );

    // If there is no user-facing text, all blocks are tooling and/or thinking
    if (!hasText) {
      let currentThinking: string | undefined = undefined;
      for (const block of item.blocks) {
        if (block.type === "thinking") {
          currentThinking = block.thinking;
        } else if (block.type === "toolCall") {
          const batchable = isBatchableTool(
            block,
            isCustomCard ? (name, args) => isCustomCard({ type: "toolCall", id: block.id, name, arguments: args, complete: true }) : undefined
          );

          if (batchable) {
            pendingBatch.push({
              block,
              result: toolResults[block.id],
              run: tools[block.id],
              running: tools[block.id]?.status === "running" || (!block.complete && !toolResults[block.id]),
              thinking: currentThinking,
              itemKey: item.key,
              sourceItem: item,
            });
            currentThinking = undefined;
          } else {
            flushBatch();
            out.push({
              kind: "timelineRow",
              item: {
                ...item,
                key: `${item.key}-card-${block.id}`,
                blocks: currentThinking ? [{ type: "thinking", thinking: currentThinking }, block] : [block],
              },
            });
            currentThinking = undefined;
          }
        }
      }
      // If there was only thinking in this message (e.g. streaming thought) and no tool calls, emit it
      if (currentThinking && !item.blocks.some((b) => b.type === "toolCall")) {
        flushBatch();
        out.push({ kind: "timelineRow", item });
      }
      continue;
    }

    // Item has text (and possibly tool calls as well)
    let currentThinking: string | undefined = undefined;
    for (const block of item.blocks) {
      if (block.type === "thinking") {
        currentThinking = block.thinking;
      } else if (block.type === "text") {
        flushBatch();
        out.push({
          kind: "timelineRow",
          item: {
            ...item,
            key: `${item.key}-text-${out.length}`,
            blocks: currentThinking ? [{ type: "thinking", thinking: currentThinking }, block] : [block],
          },
        });
        currentThinking = undefined;
      } else if (block.type === "toolCall") {
        const batchable = isBatchableTool(
          block,
          isCustomCard ? (name, args) => isCustomCard({ type: "toolCall", id: block.id, name, arguments: args, complete: true }) : undefined
        );

        if (batchable) {
          pendingBatch.push({
            block,
            result: toolResults[block.id],
            run: tools[block.id],
            running: tools[block.id]?.status === "running" || (!block.complete && !toolResults[block.id]),
            thinking: currentThinking,
            itemKey: item.key,
            sourceItem: item,
          });
          currentThinking = undefined;
        } else {
          flushBatch();
          out.push({
            kind: "timelineRow",
            item: {
              ...item,
              key: `${item.key}-card-${block.id}`,
              blocks: currentThinking ? [{ type: "thinking", thinking: currentThinking }, block] : [block],
            },
          });
          currentThinking = undefined;
        }
      }
    }
  }

  flushBatch();
  return out;
}

/**
 * Closing tool calls: the contiguous run of `match`ing tool calls at the very end of the transcript that
 * directly follows the agent's final user-facing text (e.g. the `ask_jev` self-review run after the answer).
 * Empty when the run isn't preceded by text, or anything else follows it. Returned in transcript order.
 */
export function findClosingCalls(items: TimelineItem[], match: (block: ToolCallBlockT) => boolean): ToolCallBlockT[] {
  const blocks: AssistantBlock[] = [];
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]!;
    // Turn timers, markers and hook-injected notices (e.g. the jev-enforce nudge) sit between the answer and the
    // review run; they must not break the walk or the review stays expanded below the answer.
    if (item.kind === "turn" || item.kind === "marker" || (item.kind === "custom" && item.customType === "jev-enforce")) continue;
    if (item.kind !== "assistant") break;
    if (item.errorMessage) return [];
    blocks.unshift(...item.blocks);
  }
  const out: ToolCallBlockT[] = [];
  for (let i = blocks.length - 1; i >= 0; i--) {
    const b = blocks[i]!;
    if (b.type === "thinking") continue;
    if (b.type === "toolCall" && match(b)) {
      out.unshift(b);
      continue;
    }
    return b.type === "text" && b.text?.trim() ? out : [];
  }
  return [];
}
