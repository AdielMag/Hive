import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { locatePi } from "../src/node/locator.ts";
import { PiRpcConnection } from "../src/node/rpc-connection.ts";
import type { PiStreamEvent } from "@hive/protocol";
import type { RpcExtensionUIRequest } from "@earendil-works/pi-coding-agent";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const testProviderPath = resolve(__dirname, "../../test-provider/index.ts");

describe("Pi RPC contract (vs real installed Pi)", () => {
  it("executes the full RPC and extension-UI contract with the offline scripted provider", async () => {
    const locate = locatePi();
    expect(locate.ok).toBe(true);
    if (!locate.ok) return;

    const { nodePath, cliPath } = locate.info;
    const rpc = new PiRpcConnection({
      nodePath,
      cliPath,
      cwd: resolve(__dirname, "../../.."),
      args: ["--no-session", "-e", testProviderPath, "--model", "studio-test/scripted-1"],
    });

    const events: PiStreamEvent[] = [];
    const uiRequests: RpcExtensionUIRequest[] = [];
    let settledResolve: () => void;
    let settledPromise = new Promise<void>((r) => (settledResolve = r));

    rpc.onEvent((event) => {
      events.push(event);
      if (event.type === "agent_settled") settledResolve();
    });

    rpc.onUiRequest((req) => {
      uiRequests.push(req);
      if (req.method === "select") {
        void rpc.respondUi({ type: "extension_ui_response", id: req.id, value: "green" });
      }
    });

    await rpc.start();
    expect(rpc.pid).toBeTypeOf("number");

    // 1. get_state
    const state = await rpc.request<{ model?: { id: string; provider: string } }>({ type: "get_state" });
    expect(state.model?.provider).toBe("studio-test");
    expect(state.model?.id).toBe("scripted-1");

    // 2. get_available_models
    const models = await rpc.request<{ models: Array<{ id: string; provider: string }> }>({
      type: "get_available_models",
    });
    const hasScripted = models.models.some((m) => m.provider === "studio-test" && m.id === "scripted-1");
    expect(hasScripted).toBe(true);

    // 3. get_available_thinking_levels
    const levels = await rpc.request<{ levels: string[] }>({ type: "get_available_thinking_levels" });
    expect(levels.levels).toContain("high");

    // 4. Prompt and stream completion
    const promptRes = await rpc.send({
      type: "prompt",
      message: "Hello contract test with image",
      images: [
        {
          type: "image",
          data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
          mimeType: "image/png",
        },
      ],
    });
    expect(promptRes.success).toBe(true);

    await Promise.race([
      settledPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout waiting for agent_settled")), 15_000)),
    ]);

    const eventTypes = events.map((e) => e.type);
    expect(eventTypes).toContain("agent_start");
    expect(eventTypes).toContain("message_start");
    expect(eventTypes).toContain("message_update");
    expect(eventTypes).toContain("message_end");
    expect(eventTypes).toContain("agent_settled");

    // 5. Extension command with status and widget
    await rpc.send({ type: "prompt", message: "/test-status running-fine" });
    await new Promise((r) => setTimeout(r, 600));

    const statusReq = uiRequests.find((r) => r.method === "setStatus" && r.statusKey === "studio-test");
    expect(statusReq).toBeDefined();
    if (statusReq && statusReq.method === "setStatus") {
      expect(statusReq.statusText).toContain("running-fine");
    }

    const widgetReq = uiRequests.find((r) => r.method === "setWidget" && r.widgetKey === "studio-test");
    expect(widgetReq).toBeDefined();

    // 6. Extension command with dialog
    await rpc.send({ type: "prompt", message: "/test-dialog" });
    await new Promise((r) => setTimeout(r, 800));

    const notifyReq = uiRequests.find(
      (r) => r.method === "notify" && typeof r.message === "string" && r.message.includes("You picked green"),
    );
    expect(notifyReq).toBeDefined();

    // 7. Orderly shutdown
    const exit = await rpc.stop();
    expect(exit.code).toBe(0);
  }, 45_000);
});
