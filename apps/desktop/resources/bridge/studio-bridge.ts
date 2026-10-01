import { connect, type Socket } from "node:net";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { VERSION } from "@earendil-works/pi-coding-agent";
import {
  BRIDGE_CAPABILITIES,
  BRIDGE_COMMAND,
  BRIDGE_ENV,
  BRIDGE_PROTOCOL_VERSION,
  BRIDGE_TOPICS,
  type BridgeAction,
  type BridgeToStudio,
  type LinkedProject,
  type StudioToBridge,
  renderLinkedProjectsSection,
} from "@pi-studio/protocol";

export default function studioBridge(pi: ExtensionAPI): void {
  const address = process.env[BRIDGE_ENV.address];
  const token = process.env[BRIDGE_ENV.token] ?? "";
  if (!address) return; // not running under Studio; behave as no-op

  let socket: Socket | null = null;
  let linkedProjects: LinkedProject[] = [];
  let readBuffer = "";

  const send = (message: BridgeToStudio) => {
    if (!socket || socket.destroyed) return;
    try {
      socket.write(`${JSON.stringify(message)}\n`);
    } catch {
      // ignore write errors; socket error handler handles disconnect
    }
  };

  const handleStudioMessage = (msg: StudioToBridge) => {
    if (msg.type === "config") {
      linkedProjects = msg.linkedProjects ?? [];
    } else if (msg.type === "emit") {
      pi.events.emit(msg.topic, msg.data);
    }
  };

  pi.on("session_start", async (_event, ctx) => {
    if (socket) return;

    const s = connect(address);
    socket = s;
    s.setEncoding("utf8");

    s.on("connect", () => {
      send({
        v: BRIDGE_PROTOCOL_VERSION,
        type: "hello",
        token,
        piVersion: VERSION,
        cwd: ctx.cwd,
        mode: ctx.mode,
        trusted: ctx.isProjectTrusted(),
        capabilities: BRIDGE_CAPABILITIES,
      });
    });

    s.on("data", (chunk: string) => {
      readBuffer += chunk;
      let idx;
      while ((idx = readBuffer.indexOf("\n")) >= 0) {
        let line = readBuffer.slice(0, idx);
        readBuffer = readBuffer.slice(idx + 1);
        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (!line) continue;
        try {
          handleStudioMessage(JSON.parse(line) as StudioToBridge);
        } catch {
          // ignore malformed lines from host
        }
      }
    });

    s.on("error", () => {
      // socket error; Studio may have closed or not yet opened
    });

    s.on("close", () => {
      socket = null;
    });

    // Forward events emitted by extensions targeting Studio
    pi.events.on(BRIDGE_TOPICS.toGui, (data) => {
      send({
        v: BRIDGE_PROTOCOL_VERSION,
        type: "event",
        topic: BRIDGE_TOPICS.toGui,
        data,
      });
    });
  });

  pi.on("before_agent_start", async (event) => {
    // 1. Inject linked projects section if configured
    if (linkedProjects.length > 0) {
      event.systemPromptOptions.sections = {
        ...(event.systemPromptOptions.sections ?? {}),
        linked_projects: renderLinkedProjectsSection(linkedProjects),
      };
    }

    // 2. Measure prompt sections for context inspector
    const sections: Record<string, number> = {};
    const opts = event.systemPromptOptions;
    if (opts.customPrompt) sections.custom_prompt = opts.customPrompt.length;
    if (opts.appendSystemPrompt) sections.append_system_prompt = opts.appendSystemPrompt.length;
    if (opts.sections) {
      for (const [k, v] of Object.entries(opts.sections)) {
        if (v) sections[k] = v.length;
      }
    }
    send({
      v: BRIDGE_PROTOCOL_VERSION,
      type: "prompt_sections",
      sections,
    });
  });

  // Checkpoint boundaries
  pi.on("agent_start", async (_event, ctx) => {
    send({
      v: BRIDGE_PROTOCOL_VERSION,
      type: "boundary",
      phase: "agent_start",
      leafEntryId: ctx.sessionManager.getLeafId?.() ?? null,
    });
  });

  pi.on("turn_end", async (_event, ctx) => {
    send({
      v: BRIDGE_PROTOCOL_VERSION,
      type: "boundary",
      phase: "turn_end",
      leafEntryId: ctx.sessionManager.getLeafId?.() ?? null,
    });
  });

  pi.on("agent_settled", async (_event, ctx) => {
    send({
      v: BRIDGE_PROTOCOL_VERSION,
      type: "boundary",
      phase: "agent_settled",
      leafEntryId: ctx.sessionManager.getLeafId?.() ?? null,
    });
  });

  // Hidden command for command-context actions
  pi.registerCommand(BRIDGE_COMMAND, {
    description: "Studio internal command bridge",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      let action: BridgeAction;
      try {
        action = JSON.parse(args) as BridgeAction;
      } catch (e) {
        send({
          v: BRIDGE_PROTOCOL_VERSION,
          type: "command_result",
          id: "unknown",
          ok: false,
          error: `Malformed action JSON: ${String(e)}`,
        });
        return;
      }

      try {
        switch (action.action) {
          case "ping": {
            send({
              v: BRIDGE_PROTOCOL_VERSION,
              type: "command_result",
              id: action.id,
              ok: true,
              data: { pong: true, idle: ctx.isIdle() },
            });
            break;
          }
          case "navigate_tree": {
            const res = await ctx.navigateTree(action.entryId, {
              summarize: action.summarize ?? false,
            });
            send({
              v: BRIDGE_PROTOCOL_VERSION,
              type: "command_result",
              id: action.id,
              ok: !res.cancelled,
              data: res,
            });
            break;
          }
          case "reload": {
            await ctx.reload();
            send({
              v: BRIDGE_PROTOCOL_VERSION,
              type: "command_result",
              id: action.id,
              ok: true,
            });
            break;
          }
          case "refresh_models": {
            await ctx.modelRegistry.refresh();
            send({
              v: BRIDGE_PROTOCOL_VERSION,
              type: "command_result",
              id: action.id,
              ok: true,
            });
            break;
          }
          default: {
            send({
              v: BRIDGE_PROTOCOL_VERSION,
              type: "command_result",
              id: (action as { id: string }).id,
              ok: false,
              error: `Unknown action: ${(action as { action: string }).action}`,
            });
          }
        }
      } catch (err) {
        send({
          v: BRIDGE_PROTOCOL_VERSION,
          type: "command_result",
          id: action.id,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  });

  pi.on("session_shutdown", async () => {
    socket?.end();
    socket = null;
  });
}
