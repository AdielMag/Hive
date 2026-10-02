import { describe, expect, it, beforeEach } from "vitest";
import { hasDraft } from "./session-store.ts";

describe("hasDraft", () => {
  it("returns false for undefined or empty tab UI", () => {
    expect(hasDraft(undefined)).toBe(false);
    expect(
      hasDraft({
        promptText: "",
        attachments: [],
        pendingUiDialog: null,
        pendingForm: null,
        extensionWidgets: {},
        extensionStatus: {},
      }),
    ).toBe(false);
    expect(
      hasDraft({
        promptText: "   ",
        attachments: [],
        pendingUiDialog: null,
        pendingForm: null,
        extensionWidgets: {},
        extensionStatus: {},
      }),
    ).toBe(false);
  });

  it("returns true when prompt text is non-empty", () => {
    expect(
      hasDraft({
        promptText: "hello world",
        attachments: [],
        pendingUiDialog: null,
        pendingForm: null,
        extensionWidgets: {},
        extensionStatus: {},
      }),
    ).toBe(true);
  });

  it("returns true when attachments are present even with empty text", () => {
    const item = { id: "a1", name: "test.txt", kind: "file" } as any;
    expect(
      hasDraft({
        promptText: "",
        attachments: [item],
        pendingUiDialog: null,
        pendingForm: null,
        extensionWidgets: {},
        extensionStatus: {},
      }),
    ).toBe(true);
  });
});

import { useSessionStore } from "./session-store.ts";

describe("queued messages store actions", () => {
  const rpcCalls: any[] = [];

  beforeEach(() => {
    rpcCalls.length = 0;
    (globalThis as any).window = {
      studio: {
        rpc: async (_key: string, cmd: any) => {
          rpcCalls.push(cmd);
          if (cmd.type === "clear_queue") {
            return {
              ok: true,
              data: {
                steering: [...useSessionStore.getState().transcript.queue.steering],
                followUp: [...useSessionStore.getState().transcript.queue.followUp],
              },
            };
          }
          return { ok: true };
        },
      },
    };

    useSessionStore.setState({
      activeKey: "session_test",
      promptText: "",
      transcript: {
        ...useSessionStore.getState().transcript,
        running: true,
        queue: {
          steering: ["steer 1"],
          followUp: ["follow 1", "follow 2"],
        },
      },
    });
  });

  it("deletes a queued message from followUp and preserves remaining order", async () => {
    await useSessionStore.getState().deleteQueuedMessage("followUp", 0);
    const q = useSessionStore.getState().transcript.queue;
    expect(q.followUp).toEqual(["follow 2"]);
    expect(q.steering).toEqual(["steer 1"]);
  });

  it("edits a queued message in place", async () => {
    await useSessionStore.getState().editQueuedMessage("followUp", 1, "follow 2 updated");
    const q = useSessionStore.getState().transcript.queue;
    expect(q.followUp).toEqual(["follow 1", "follow 2 updated"]);
  });

  it("promotes a followUp message to steering on 'Do now'", async () => {
    await useSessionStore.getState().steerQueuedNow("followUp", 0);
    const q = useSessionStore.getState().transcript.queue;
    expect(q.steering).toEqual(["follow 1", "steer 1"]);
    expect(q.followUp).toEqual(["follow 2"]);
    expect(rpcCalls.some((c) => c.type === "steer" && c.message === "follow 1")).toBe(true);
  });

  it("pops a queued message into the composer editor", async () => {
    await useSessionStore.getState().popQueuedToEditor("followUp", 1);
    expect(useSessionStore.getState().promptText).toBe("follow 2");
    expect(useSessionStore.getState().transcript.queue.followUp).toEqual(["follow 1"]);
  });

  it("clears all queued messages", async () => {
    await useSessionStore.getState().clearAllQueued();
    const q = useSessionStore.getState().transcript.queue;
    expect(q.steering).toEqual([]);
    expect(q.followUp).toEqual([]);
  });
});
