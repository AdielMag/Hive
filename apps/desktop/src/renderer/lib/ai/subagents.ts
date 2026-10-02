import type { AnyMessage, AssistantBlock, Timeline, ToolResultView, ToolRun } from "@pi-studio/pi-adapter";

export interface AgentDetails {
  displayName?: string;
  description: string;
  subagentType: string;
  toolUses?: number;
  tokens?: string;
  cost?: number;
  turnCount?: number;
  maxTurns?: number;
  durationMs?: number;
  status: "queued" | "running" | "completed" | "steered" | "aborted" | "stopped" | "error" | "background";
  activity?: string;
  spinnerFrame?: number;
  modelName?: string;
  tags?: string[];
  agentId?: string;
  error?: string;
}

export interface NotificationDetails {
  id: string;
  description: string;
  status: string;
  toolUses?: number;
  turnCount?: number;
  maxTurns?: number;
  totalTokens?: number;
  totalCost?: number;
  durationMs?: number;
  outputFile?: string;
  error?: string;
  resultPreview?: string;
  others?: NotificationDetails[];
}

export interface SubagentView {
  toolCallId: string;
  agentId?: string;
  outputFile?: string;
  type: string;
  description: string;
  prompt: string;
  model?: string;
  thinking?: string;
  tags: string[];
  background: boolean;
  status: "queued" | "running" | "completed" | "steered" | "aborted" | "stopped" | "error" | "background";
  activity?: string;
  toolUses?: number;
  turns?: number;
  maxTurns?: number;
  tokens?: string;
  cost?: number;
  durationMs?: number;
  error?: string;
  resultText?: string;
}

/**
 * Parses `Agent ID: <id>` and `Output file: <path>` from tool result text.
 */
export function parseAgentResultText(text: string): { agentId?: string; outputFile?: string } {
  if (!text || typeof text !== "string") return {};
  const idMatch = text.match(/Agent ID:\s*(\S+)/i);
  const outMatch = text.match(/Output file:\s*(.+)/i);
  return {
    agentId: idMatch?.[1]?.trim(),
    outputFile: outMatch?.[1]?.trim(),
  };
}

/**
 * Parses `Agent: <id>` and `Status: <status>` from `get_subagent_result` output text.
 */
export function parseGetResultText(text: string): { agentId?: string; status?: string } {
  if (!text || typeof text !== "string") return {};
  const idMatch = text.match(/^Agent:\s*(\S+)/m);
  const statusMatch = text.match(/Status:\s*(\w+)/i);
  return {
    agentId: idMatch?.[1]?.trim(),
    status: statusMatch?.[1]?.trim().toLowerCase(),
  };
}

export interface SubagentIndex {
  notifications: Map<string, { details: NotificationDetails; itemKey: string }>;
  results: Map<string, { status: string; toolCallId: string }>;
  cards: Map<string, string>;
}

/**
 * Scans timeline to index background notifications, get_subagent_result outcomes,
 * and mapping of agentId to toolCallId.
 */
export function indexSubagents(timeline: Timeline): SubagentIndex {
  const notifications = new Map<string, { details: NotificationDetails; itemKey: string }>();
  const results = new Map<string, { status: string; toolCallId: string }>();
  const cards = new Map<string, string>();

  // Helper to register notification details (including flattend 'others')
  const registerNotification = (d: NotificationDetails, itemKey: string) => {
    if (d?.id) {
      notifications.set(d.id, { details: d, itemKey });
    }
    if (Array.isArray(d?.others)) {
      for (const other of d.others) {
        if (other?.id) {
          notifications.set(other.id, { details: other, itemKey });
        }
      }
    }
  };

  for (const item of timeline.items) {
    if (item.kind === "custom" && item.customType === "subagent-notification") {
      const details = item.details as NotificationDetails | undefined;
      if (details) {
        registerNotification(details, item.key);
      }
    } else if (item.kind === "assistant") {
      for (const block of item.blocks) {
        if (block.type === "toolCall") {
          const res = timeline.toolResults[block.id];
          if (block.name === "Agent" || block.name === "SubagentWorkflow") {
            const parsed = parseAgentResultText(res?.text ?? "");
            const details = res?.details as AgentDetails | undefined;
            const agentId = details?.agentId || parsed.agentId;
            if (agentId) {
              cards.set(agentId, block.id);
            }
          } else if (block.name === "get_subagent_result") {
            const parsed = parseGetResultText(res?.text ?? "");
            const argId = typeof block.arguments?.agent_id === "string" ? block.arguments.agent_id : undefined;
            const agentId = parsed.agentId || argId;
            if (agentId && parsed.status) {
              results.set(agentId, { status: parsed.status, toolCallId: block.id });
            }
          }
        }
      }
    }
  }

  return { notifications, results, cards };
}

/**
 * Resolves all metadata and live updates for a subagent tool call into a SubagentView.
 */
export function resolveSubagentView(params: {
  block: AssistantBlock & { type: "toolCall" };
  run?: ToolRun;
  result?: ToolResultView;
  subagentIndex?: SubagentIndex;
}): SubagentView {
  const { block, run, result, subagentIndex } = params;
  const args = block.arguments ?? {};

  // Extract details from first available source
  const details =
    (result?.details as AgentDetails | undefined) ||
    ((run?.result as { details?: AgentDetails } | undefined)?.details) ||
    ((run?.partial as { details?: AgentDetails } | undefined)?.details);

  const parsed = parseAgentResultText(result?.text ?? "");
  const agentId = details?.agentId || parsed.agentId || (typeof args.name === "string" ? args.name : undefined);
  const outputFile = parsed.outputFile;

  const subagentType = (details?.subagentType || args.subagent_type || block.name) as string;
  const description = (details?.description || args.description || "Subagent") as string;
  const prompt = (args.prompt as string) || "";
  const background = args.run_in_background === true;

  // Model & thinking
  const model = details?.modelName || (args.model as string | undefined);
  let thinking = args.thinking as string | undefined;
  const tags: string[] = [...(details?.tags ?? [])];
  if (!thinking) {
    const thinkingTag = tags.find((t) => t.toLowerCase().startsWith("thinking:"));
    if (thinkingTag) {
      thinking = thinkingTag.slice("thinking:".length).trim();
    }
  }

  // Without a result yet, the call is still streaming/pending — never default to "completed".
  const fallbackStatus: SubagentView["status"] = result
    ? result.isError ? "error" : "completed"
    : run
      ? run.status === "running" ? "running" : run.status === "error" ? "error" : "completed"
      : "queued";
  let status = (details?.status ?? fallbackStatus) as SubagentView["status"];
  let toolUses = details?.toolUses;
  let turns = details?.turnCount;
  let maxTurns = details?.maxTurns ?? (typeof args.max_turns === "number" ? args.max_turns : undefined);
  let tokens = details?.tokens;
  let cost = details?.cost;
  let durationMs = details?.durationMs;
  let error = details?.error || (result?.isError ? result.text : undefined);

  // Check background completion notification
  if (agentId && subagentIndex?.notifications.has(agentId)) {
    const notif = subagentIndex.notifications.get(agentId)!.details;
    status = (notif.status.toLowerCase() as SubagentView["status"]) || "completed";
    if (typeof notif.toolUses === "number") toolUses = notif.toolUses;
    if (typeof notif.turnCount === "number") turns = notif.turnCount;
    if (typeof notif.maxTurns === "number") maxTurns = notif.maxTurns;
    if (typeof notif.totalCost === "number") cost = notif.totalCost;
    if (typeof notif.durationMs === "number") durationMs = notif.durationMs;
    if (typeof notif.totalTokens === "number") tokens = `${Math.round(notif.totalTokens / 1000)}k`;
    if (notif.error) error = notif.error;
  } else if (agentId && subagentIndex?.results.has(agentId)) {
    // Check get_subagent_result outcome
    const getRes = subagentIndex.results.get(agentId)!;
    status = (getRes.status as SubagentView["status"]) || status;
  }

  return {
    toolCallId: block.id,
    agentId,
    outputFile,
    type: subagentType,
    description,
    prompt,
    model,
    thinking,
    tags,
    background,
    status,
    activity: details?.activity,
    toolUses,
    turns,
    maxTurns,
    tokens,
    cost,
    durationMs,
    error,
    resultText: result?.text,
  };
}

/**
 * Parses raw lines from a subagent `.output` JSONL file into user prompt and messages.
 */
export function parseOutputLines(lines: unknown[]): { prompt?: string; messages: AnyMessage[] } {
  const messages: AnyMessage[] = [];
  let prompt: string | undefined;

  for (const line of lines) {
    if (!line || typeof line !== "object") continue;
    const entry = line as Record<string, unknown>;

    // Subagent JSONL wrapper entry: { isSidechain: true, agentId, type, message, ... }
    if (entry.message && typeof entry.message === "object") {
      const msg = entry.message as AnyMessage;
      if (!prompt && msg.role === "user" && typeof msg.content === "string") {
        prompt = msg.content;
      }
      messages.push(msg);
    } else if (typeof entry.role === "string") {
      // Direct AnyMessage
      const msg = entry as unknown as AnyMessage;
      if (!prompt && msg.role === "user" && typeof msg.content === "string") {
        prompt = msg.content;
      }
      messages.push(msg);
    }
  }

  return { prompt, messages };
}
