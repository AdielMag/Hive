import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { locatePi } from "../src/node/locator.ts";
import { PiRpcConnection } from "../src/node/rpc-connection.ts";
import { createBridgeServer } from "../../../apps/desktop/src/main/bridge-server/index.ts";
import type { BridgeToStudio, PiStreamEvent } from "@pi-studio/protocol";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const testProviderPath = resolve(__dirname, "../../test-provider/index.ts");
const bridgePath = resolve(__dirname, "../../../apps/desktop/resources/bridge/studio-bridge.ts");

describe("Studio Bridge contract (Pi <-> Bridge socket)", () => {
  it("connects, exchanges handshake, injects linked projects, and runs actions", async () => {
    const locate = locatePi();
    expect(locate.ok).toBe(true);
    if (!locate.ok) return;

    const bridge = await createBridgeServer();
    const { nodePath, cliPath } = locate.info;

    const rpc = new PiRpcConnection({
      nodePath,
      cliPath,
      cwd: resolve(__dirname, "../../.."),
      env: { ...process.env, ...bridge.env },
      args: ["--no-session", "-e", testProviderPath, "-e", bridgePath, "--model", "studio-test/scripted-1"],
    });

    let helloMessage: Extract<BridgeToStudio, { type: "hello" }> | null = null;
    let promptSectionsMessage: Extract<BridgeToStudio, { type: "prompt_sections" }> | null = null;
    const boundaries: string[] = [];

    bridge.onMessage((msg) => {
      if (msg.type === "hello") helloMessage = msg;
      if (msg.type === "prompt_sections") promptSectionsMessage = msg;
      if (msg.type === "boundary") boundaries.push(msg.phase);
    });

    let settledResolve: () => void;
    let settledPromise = new Promise<void>((r) => (settledResolve = r));
    rpc.onEvent((ev: PiStreamEvent) => {
      if (ev.type === "agent_settled") settledResolve();
    });

    await rpc.start();

    // 1. Initial handshake
    const state = await rpc.request<{ sessionId: string }>({ type: "get_state" });
    expect(state.sessionId).toBeDefined();

    // Give the bridge a moment to connect and send hello
    await new Promise((r) => setTimeout(r, 600));
    expect(helloMessage).not.toBeNull();
    const hello = helloMessage as Extract<BridgeToStudio, { type: "hello" }> | null;
    expect(hello?.capabilities).toContain("linked_projects");
    expect(hello?.capabilities).toContain("actions:ping");

    // 2. Configure linked projects
    await bridge.setLinkedProjects([
      { path: "C:/Users/Adiel/test-linked-repo", alias: "test-lib", access: "read-only" },
    ]);

    // 3. Prompt the agent asking if linked_projects section exists
    await rpc.send({ type: "prompt", message: "Check system prompt [linked]" });
    await Promise.race([
      settledPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 15_000)),
    ]);
    // Give the socket a tick to flush the agent_settled boundary
    await new Promise((r) => setTimeout(r, 200));

    // 4. Verify boundary events and prompt sections were received
    expect(boundaries).toContain("agent_start");
    expect(boundaries).toContain("turn_end");
    expect(boundaries).toContain("agent_settled");
    expect(promptSectionsMessage).not.toBeNull();
    const promptSections = promptSectionsMessage as Extract<BridgeToStudio, { type: "prompt_sections" }> | null;
    expect(promptSections?.sections).toHaveProperty("linked_projects");

    // 5. Verify the assistant saw the linked projects in its system prompt
    const messages = await rpc.request<{ messages: Array<{ role: string; content?: Array<{ text?: string }> }> }>({
      type: "get_messages",
    });
    const lastAssistant = messages.messages.filter((m) => m.role === "assistant").pop();
    const assistantText = lastAssistant?.content?.[0]?.text ?? "";
    expect(assistantText).toContain("linked_projects present: true");

    // 6. Execute action via hidden slash command over RPC
    const pingResult = await bridge.executeAction<{ pong: boolean; idle: boolean }>("ping", {}, rpc);
    expect(pingResult.pong).toBe(true);
    expect(pingResult.idle).toBe(true);

    // 7. Clean shutdown
    await rpc.stop();
    await bridge.close();
  }, 45_000);
});
