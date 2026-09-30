import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { connect } from "node:net";

// Spike: GUI bridge extension. Side channel over a named pipe given by env.
export default function (pi: ExtensionAPI) {
  const pipePath = process.env.PI_STUDIO_BRIDGE;
  let sock: ReturnType<typeof connect> | undefined;
  const send = (msg: unknown) => sock?.write(JSON.stringify(msg) + "\n");

  pi.on("session_start", async (_event, ctx) => {
    if (!pipePath || sock) return;
    sock = connect(pipePath);
    sock.on("error", () => {});
    send({ type: "hello", cwd: ctx.cwd, mode: ctx.mode, hasUI: ctx.hasUI, trusted: ctx.isProjectTrusted() });
    // Forward anything other extensions emit on studio:* topics
    pi.events.on("studio:panel-data", (data) => send({ type: "event", topic: "studio:panel-data", data }));
  });

  pi.on("before_agent_start", async (event) => {
    event.systemPromptOptions.sections = {
      ...(event.systemPromptOptions.sections ?? {}),
      linked_projects: "<project path=\"C:/Users/Adiel/usage-view\" access=\"read-only\"/>",
    };
  });

  pi.registerCommand("studio-ping", {
    description: "GUI bridge ping (internal)",
    handler: async (args, ctx) => {
      pi.events.emit("studio:panel-data", { from: "studio-ping", args });
      send({ type: "ping-result", args, idle: ctx.isIdle(), usage: ctx.getContextUsage() ?? null, sysPromptChars: ctx.getSystemPrompt().length });
    },
  });

  pi.on("session_shutdown", async () => { sock?.end(); sock = undefined; });
}
