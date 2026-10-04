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
  type StudioSubagentActivity,
  type StudioSubagentStopResult,
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

  let unsubFromGui: (() => void) | undefined;
  let unsubTracking: Array<() => void> = [];

  /** Top-level subagents the runner has started/created and not yet finished, learned from its lifecycle events. */
  const liveSubagents = new Map<string, { type: string; description: string; seq: number }>();
  let subagentSeq = 0;

  const broadcastSubagentActivity = () => {
    const list = Array.from(liveSubagents.entries()).map(([id, a]) => ({
      id,
      type: a.type,
      description: a.description,
    }));
    const payload: StudioSubagentActivity = {
      kind: "subagent_activity",
      runningCount: list.length,
      hasRunning: list.length > 0,
      agents: list,
    };
    pi.events.emit(BRIDGE_TOPICS.toGui, payload);
  };

  const trackSubagents = () => {
    for (const u of unsubTracking) u();
    liveSubagents.clear();
    const remember = (data: unknown) => {
      const d = data as { id?: unknown; type?: unknown; description?: unknown } | null;
      if (!d || typeof d.id !== "string") return;
      if (!liveSubagents.has(d.id)) {
        liveSubagents.set(d.id, {
          type: typeof d.type === "string" ? d.type : "",
          description: typeof d.description === "string" ? d.description : "",
          seq: subagentSeq++,
        });
        broadcastSubagentActivity();
      }
    };
    const forget = (data: unknown) => {
      const d = data as { id?: unknown } | null;
      if (d && typeof d.id === "string") {
        if (liveSubagents.delete(d.id)) {
          broadcastSubagentActivity();
        }
      }
    };
    unsubTracking = [
      pi.events.on("subagents:created", remember),
      pi.events.on("subagents:started", remember),
      pi.events.on("subagents:completed", forget),
      pi.events.on("subagents:failed", forget),
    ];
  };

  /** Resolve which agent a stop request targets: the explicit id, else the oldest live agent matching type + description. */
  const resolveSubagentId = (req: { agentId?: string; type?: string; description?: string }): string | undefined => {
    if (req.agentId) return req.agentId;
    if (!req.description) return undefined;
    let best: { id: string; seq: number } | undefined;
    for (const [id, a] of liveSubagents) {
      if (a.description !== req.description) continue;
      if (req.type && a.type && a.type !== req.type) continue;
      if (!best || a.seq < best.seq) best = { id, seq: a.seq };
    }
    return best?.id;
  };

  const stopSubagent = (id: string, req: { agentId?: string; type?: string; description?: string }) => {
    const agentId = resolveSubagentId(req);
    if (!agentId) {
      const payload: StudioSubagentStopResult = {
        kind: "subagent_stop_result",
        id,
        agentId: "",
        ok: false,
        error: "No running subagent matches (it may have already finished)",
      };
      pi.events.emit(BRIDGE_TOPICS.toGui, payload);
      return;
    }
    const channel = "subagents:rpc:stop";
    const requestId = `studio-stop-${id}`;
    let settled = false;
    let unsubReply: (() => void) | undefined;
    const finish = (result: Pick<StudioSubagentStopResult, "ok" | "error">) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // A stopped queued agent never gets a completion event; don't keep matching it.
      if (result.ok || /not running|not found/i.test(result.error ?? "")) {
        if (liveSubagents.delete(agentId)) {
          broadcastSubagentActivity();
        }
      }
      unsubReply?.();
      const payload: StudioSubagentStopResult = { kind: "subagent_stop_result", id, agentId, ...result };
      pi.events.emit(BRIDGE_TOPICS.toGui, payload);
    };
    // No reply means the pi-subagents extension is not loaded (or is too old to expose the stop RPC).
    const timer = setTimeout(() => finish({ ok: false, error: "Subagent extension did not respond" }), 5000);
    unsubReply = pi.events.on(`${channel}:reply:${requestId}`, (raw) => {
      const reply = raw as { success?: boolean; error?: string } | null;
      finish(reply?.success ? { ok: true } : { ok: false, error: reply?.error ?? "Failed to stop subagent" });
    });
    pi.events.emit(channel, { requestId, agentId });
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
      broadcastSubagentActivity();
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

    // Subagent termination: relay to the pi-subagents extension's cross-extension RPC and report back.
    unsubFromGui?.();
    unsubFromGui = pi.events.on(BRIDGE_TOPICS.fromGui, (data) => {
      const req = data as { kind?: unknown; id?: unknown; agentId?: unknown; type?: unknown; description?: unknown } | null;
      if (!req || req.kind !== "subagent_stop" || typeof req.id !== "string") return;
      const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
      stopSubagent(req.id, { agentId: str(req.agentId), type: str(req.type), description: str(req.description) });
    });
    trackSubagents();
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

  pi.on("tool_execution_end", async (event) => {
    if (event.toolName === "SubagentWorkflow") {
      const res = event.result as { details?: { taskId?: string }; text?: string; content?: Array<{ text?: string }> } | undefined;
      const details = res?.details;
      const text = res?.text ?? (Array.isArray(res?.content) ? res.content.map((c) => c.text ?? "").join("\n") : "");
      const taskId = (typeof details?.taskId === "string" ? details.taskId : undefined) ||
        text.match(/Task ID:\s*(\S+)/i)?.[1]?.trim();
      if (taskId && !liveSubagents.has(taskId)) {
        liveSubagents.set(taskId, {
          type: "SubagentWorkflow",
          description: "Workflow",
          seq: subagentSeq++,
        });
        broadcastSubagentActivity();
      }
    }
  });

  pi.on("message_end", async (event) => {
    const msg = event.message as { customType?: string; details?: { id?: string; others?: Array<{ id?: string }> } } | undefined;
    if (msg?.customType === "subagent-notification") {
      let changed = false;
      if (msg.details?.id && liveSubagents.delete(msg.details.id)) changed = true;
      if (Array.isArray(msg.details?.others)) {
        for (const o of msg.details.others) {
          if (o.id && liveSubagents.delete(o.id)) changed = true;
        }
      }
      if (changed) broadcastSubagentActivity();
    }
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
    broadcastSubagentActivity();
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
    unsubFromGui?.();
    unsubFromGui = undefined;
    for (const u of unsubTracking) u();
    unsubTracking = [];
    liveSubagents.clear();
    broadcastSubagentActivity();
    socket?.end();
    socket = null;
  });
}
