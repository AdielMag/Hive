import { connect, type Socket } from "node:net";
import os from "node:os";
import path from "node:path";
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
  type RegistrySkill,
  type RegistryTool,
  type StudioToBridge,
  renderLinkedProjectsSection,
} from "@hive/protocol";

export default function studioBridge(pi: ExtensionAPI): void {
  const address = process.env[BRIDGE_ENV.address];
  const token = process.env[BRIDGE_ENV.token] ?? "";
  if (!address) return; // not running under Studio; behave as no-op

  let socket: Socket | null = null;
  let linkedProjects: LinkedProject[] = [];
  let readBuffer = "";
  let lastRegistryHash = "";
  let lastSessionCtx: any = null;

  const send = (message: BridgeToStudio) => {
    if (!socket || socket.destroyed) return;
    try {
      socket.write(`${JSON.stringify(message)}\n`);
    } catch {
      // ignore write errors; socket error handler handles disconnect
    }
  };

  const buildAndSendRegistry = (
    ctx?: any,
    promptSkills?: Array<{ name: string; description?: string; filePath?: string; baseDir?: string }>,
  ) => {
    const effectiveCtx = ctx ?? lastSessionCtx;
    if (!effectiveCtx) return;

    const allTools = (typeof (pi as any).getAllTools === "function" ? (pi as any).getAllTools() : []) as any[];
    const activeToolsList = (typeof (pi as any).getActiveTools === "function" ? (pi as any).getActiveTools() : allTools) as any[];
    const activeSet = new Set(activeToolsList.map((t) => t.name));

    const tools: RegistryTool[] = allTools.map((t) => {
      const srcInfo = t.sourceInfo;
      const sourcePath = String(srcInfo?.path ?? "");
      let source: "builtin" | "sdk" | "extension" = "extension";
      if (srcInfo?.source === "builtin" || srcInfo?.source === "sdk") {
        source = srcInfo.source;
      } else if (["read", "bash", "edit", "write", "grep", "find", "ls"].includes(t.name)) {
        source = "builtin";
      }

      let packageName: string | undefined;
      const pkgMatch = sourcePath.replace(/\\/g, "/").match(/node_modules\/((?:@[^/]+\/)?[^/]+)/);
      if (pkgMatch) {
        packageName = pkgMatch[1];
      }

      const desc = typeof t.description === "string" ? t.description.slice(0, 400) : "";

      return {
        name: t.name,
        description: desc,
        active: activeSet.has(t.name),
        source,
        sourcePath,
        packageName,
      };
    });

    const skillsMap = new Map<string, RegistrySkill>();
    const commands = (typeof (pi as any).getCommands === "function" ? (pi as any).getCommands() : []) as any[];
    for (const cmd of commands) {
      if (cmd.source === "skill" || cmd.sourceInfo?.source === "skill") {
        const cleanName = cmd.name.replace(/^skill:/, "");
        const filePath = String(cmd.sourceInfo?.path ?? "");
        const baseDir = filePath ? path.dirname(filePath) : "";
        skillsMap.set(cleanName, {
          name: cleanName,
          description: typeof cmd.description === "string" ? cmd.description.slice(0, 400) : "",
          filePath,
          baseDir,
        });
      }
    }

    if (Array.isArray(promptSkills)) {
      for (const ps of promptSkills) {
        if (!skillsMap.has(ps.name)) {
          const filePath = ps.filePath ?? "";
          const baseDir = ps.baseDir ?? (filePath ? path.dirname(filePath) : "");
          skillsMap.set(ps.name, {
            name: ps.name,
            description: ps.description ?? "",
            filePath,
            baseDir,
          });
        }
      }
    }

    const skills = Array.from(skillsMap.values());
    const sessionId = (typeof effectiveCtx.sessionManager?.getSessionId === "function"
      ? effectiveCtx.sessionManager.getSessionId()
      : null) as string | null;

    const cwd = effectiveCtx.cwd ?? process.cwd();
    const homeDir = os.homedir();

    const payload = {
      tools,
      skills,
      sessionId,
      cwd,
      homeDir,
    };

    const hash = JSON.stringify(payload);
    if (hash === lastRegistryHash) return;
    lastRegistryHash = hash;

    send({
      v: BRIDGE_PROTOCOL_VERSION,
      type: "registry",
      sessionId,
      cwd,
      homeDir,
      tools,
      skills,
    });
  };

  const handleStudioMessage = (msg: StudioToBridge) => {
    if (msg.type === "config") {
      linkedProjects = msg.linkedProjects ?? [];
    } else if (msg.type === "emit") {
      pi.events.emit(msg.topic, msg.data);
    }
  };

  pi.on("session_start", async (_event, ctx) => {
    lastSessionCtx = ctx;
    if (socket) {
      buildAndSendRegistry(ctx);
      return;
    }

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
      buildAndSendRegistry(ctx);
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
    buildAndSendRegistry(undefined, (opts as any).skills);
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
    lastSessionCtx = ctx;
    send({
      v: BRIDGE_PROTOCOL_VERSION,
      type: "boundary",
      phase: "agent_settled",
      leafEntryId: ctx.sessionManager.getLeafId?.() ?? null,
    });
    buildAndSendRegistry(ctx);
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
