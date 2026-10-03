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

  it("promotes a followUp message to steering on 'Next step'", async () => {
    await useSessionStore.getState().steerQueuedNext("followUp", 0);
    const q = useSessionStore.getState().transcript.queue;
    expect(q.steering).toEqual(["follow 1", "steer 1"]);
    expect(q.followUp).toEqual(["follow 2"]);
    expect(rpcCalls.some((c) => c.type === "steer" && c.message === "follow 1")).toBe(true);
  });

  it("aborts active step and immediately prompts LLM on 'Do now' (runQueuedNow)", async () => {
    await useSessionStore.getState().runQueuedNow("followUp", 0);
    const q = useSessionStore.getState().transcript.queue;
    expect(q.followUp).toEqual(["follow 2"]);
    expect(q.steering).toEqual(["steer 1"]);
    expect(rpcCalls.some((c) => c.type === "abort")).toBe(true);
    expect(rpcCalls.some((c) => c.type === "prompt" && c.message === "follow 1")).toBe(true);
    expect(rpcCalls.some((c) => c.type === "steer" && c.message === "steer 1")).toBe(true);
    expect(rpcCalls.some((c) => c.type === "follow_up" && c.message === "follow 2")).toBe(true);
  });

  it("aborts active step and immediately prompts LLM on 'Do now' for a steering message", async () => {
    await useSessionStore.getState().runQueuedNow("steering", 0);
    const q = useSessionStore.getState().transcript.queue;
    expect(q.steering).toEqual([]);
    expect(q.followUp).toEqual(["follow 1", "follow 2"]);
    expect(rpcCalls.some((c) => c.type === "abort")).toBe(true);
    expect(rpcCalls.some((c) => c.type === "prompt" && c.message === "steer 1")).toBe(true);
    expect(rpcCalls.some((c) => c.type === "follow_up" && c.message === "follow 1")).toBe(true);
    expect(rpcCalls.some((c) => c.type === "follow_up" && c.message === "follow 2")).toBe(true);
  });

  it("prompts immediately without aborting if agent is not running", async () => {
    useSessionStore.setState({
      transcript: {
        ...useSessionStore.getState().transcript,
        running: false,
      },
    });
    await useSessionStore.getState().runQueuedNow("followUp", 0);
    expect(rpcCalls.some((c) => c.type === "abort")).toBe(false);
    expect(rpcCalls.some((c) => c.type === "prompt" && c.message === "follow 1")).toBe(true);
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

describe("agent execution modes store actions", () => {
  const rpcCalls: any[] = [];

  beforeEach(() => {
    rpcCalls.length = 0;
    (globalThis as any).window = {
      studio: {
        rpc: async (_key: string, cmd: any) => {
          rpcCalls.push(cmd);
          return { ok: true };
        },
      },
    };

    useSessionStore.setState({
      activeKey: "session_mode_test",
      activeTabId: "tab_1",
      tabs: [
        {
          id: "tab_1",
          projectId: "p1",
          title: "Session 1",
          pinned: false,
          mode: "auto-edit",
        },
        {
          id: "tab_2",
          projectId: "p1",
          title: "Session 2",
          pinned: false,
          mode: "ask",
        },
      ],
      selectedMode: "auto-edit",
      promptText: "",
      attachments: [],
      transcript: {
        ...useSessionStore.getState().transcript,
        running: false,
      },
    });
  });

  it("updates selectedMode and active tab mode on setMode", () => {
    useSessionStore.getState().setMode("ask");
    expect(useSessionStore.getState().selectedMode).toBe("ask");
    expect(useSessionStore.getState().tabs[0]?.mode).toBe("ask");
  });

  it("prefixes prompt with Ask mode steering message when sending prompt in ask mode", async () => {
    useSessionStore.getState().setMode("ask");
    useSessionStore.setState({ promptText: "How does the cache work?" });
    await useSessionStore.getState().sendPrompt();

    expect(rpcCalls.length).toBe(1);
    expect(rpcCalls[0].type).toBe("prompt");
    expect(rpcCalls[0].message).toBe(
      "[Mode: Ask - Answer questions, explain concepts, and analyze code. Do not edit files or execute destructive actions.]\n\nHow does the cache work?",
    );
  });

  it("does not prefix prompt when in default auto-edit mode", async () => {
    useSessionStore.getState().setMode("auto-edit");
    useSessionStore.setState({ promptText: "Fix the bug" });
    await useSessionStore.getState().sendPrompt();

    expect(rpcCalls.length).toBe(1);
    expect(rpcCalls[0].type).toBe("prompt");
    expect(rpcCalls[0].message).toBe("Fix the bug");
  });

  it("prefixes prompt with Plan, Manual, or Debug mode when appropriate", async () => {
    useSessionStore.getState().setMode("plan");
    useSessionStore.setState({ promptText: "Architect new system" });
    await useSessionStore.getState().sendPrompt();
    expect(rpcCalls[0].message).toContain("[Mode: Plan");

    rpcCalls.length = 0;
    useSessionStore.getState().setMode("manual");
    useSessionStore.setState({ promptText: "Change the file" });
    await useSessionStore.getState().sendPrompt();
    expect(rpcCalls[0].message).toContain("[Mode: Manual");

    rpcCalls.length = 0;
    useSessionStore.getState().setMode("debug");
    useSessionStore.setState({ promptText: "Why did it crash" });
    await useSessionStore.getState().sendPrompt();
    expect(rpcCalls[0].message).toContain("[Mode: Debug");
  });
});
