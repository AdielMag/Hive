import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  applyCompactionResult,
  handleCompactionEvent,
  hasDraft,
  readCompactionOutcome,
  setCompactionState,
  useSessionStore,
  withCompactionEstimate,
  __resetCompactionEstimates,
  __resetCompactionStates,
  __test,
} from "./session-store.ts";

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

describe("subagent activity tracking across tabs", () => {
  const tabId = "tab_subagent_test";
  const sessionKey = "key_subagent_test";

  beforeEach(() => {
    __test.clearActivity(tabId);
    useSessionStore.setState({
      activeTabId: tabId,
      tabs: [
        {
          id: tabId,
          title: "Session with subagent",
          kind: "session",
          activeKey: sessionKey,
          projectId: "p1",
        } as any,
      ],
      sessionActivity: {},
    });
  });

  it("keeps tab running when main thread settles but subagent is still executing in background", () => {
    // 1. Main agent turn starts
    __test.trackActivity(sessionKey, [{ type: "agent_start" }]);
    expect(useSessionStore.getState().sessionActivity[tabId]).toBe("running");

    // 2. Subagent is spawned in background
    __test.trackActivity(sessionKey, [
      {
        type: "tool_execution_end",
        toolName: "Agent",
        result: {
          text: "Agent started in background.\nAgent ID: sub_123",
          details: { status: "background", agentId: "sub_123" },
        },
      },
    ]);
    expect(__test.hasRunningWork(tabId)).toBe(true);
    expect(useSessionStore.getState().sessionActivity[tabId]).toBe("running");

    // 3. Main thread finishes and settles
    __test.trackActivity(sessionKey, [{ type: "agent_settled" }]);

    // CRITICAL: Tab must still be marked as "running" because subagent sub_123 is alive!
    expect(__test.hasRunningWork(tabId)).toBe(true);
    expect(useSessionStore.getState().sessionActivity[tabId]).toBe("running");

    // 4. Subagent completes in background via subagent-notification
    __test.trackActivity(sessionKey, [
      {
        type: "message_end",
        message: {
          role: "custom",
          customType: "subagent-notification",
          details: { id: "sub_123", status: "completed" },
        },
      },
    ]);

    // Subagent done and main thread settled: tab in view transitions to null (idle)
    expect(__test.hasRunningWork(tabId)).toBe(false);
    expect(useSessionStore.getState().sessionActivity[tabId]).toBeUndefined();
  });

  it("marks parked tab as done when subagent finishes while user is on another tab", () => {
    // 1. Subagent running, main thread settled
    __test.trackActivity(sessionKey, [
      { type: "agent_start" },
      {
        type: "tool_execution_end",
        toolName: "Agent",
        result: {
          text: "Agent started in background.\nAgent ID: sub_456",
          details: { status: "background", agentId: "sub_456" },
        },
      },
      { type: "agent_settled" },
    ]);
    expect(useSessionStore.getState().sessionActivity[tabId]).toBe("running");

    // 2. User switches to a different tab
    useSessionStore.setState({ activeTabId: "other_tab" });

    // 3. Subagent finishes while tab is parked
    __test.trackActivity(sessionKey, [
      {
        type: "message_end",
        message: {
          role: "custom",
          customType: "subagent-notification",
          details: { id: "sub_456", status: "completed" },
        },
      },
    ]);

    // Parked tab must now have "done" activity badge!
    expect(__test.hasRunningWork(tabId)).toBe(false);
    expect(useSessionStore.getState().sessionActivity[tabId]).toBe("done");
  });

  it("tracks SubagentWorkflow background tasks and marks error on failure", () => {
    // User is on another tab
    useSessionStore.setState({ activeTabId: "other_tab" });

    // Workflow started in background
    __test.trackActivity(sessionKey, [
      { type: "agent_start" },
      {
        type: "tool_execution_end",
        toolName: "SubagentWorkflow",
        result: {
          text: 'Workflow "audit" started in the background.\nTask ID: wf_789',
          details: { taskId: "wf_789" },
        },
      },
      { type: "agent_settled" },
    ]);

    // Main thread is settled, but workflow is running
    expect(useSessionStore.getState().sessionActivity[tabId]).toBe("running");

    // Workflow fails
    __test.trackActivity(sessionKey, [
      {
        type: "entry_appended",
        entry: {
          type: "custom_message",
          customType: "subagent-notification",
          details: { id: "wf_789", status: "error", error: "Failed to run workflow" },
        },
      },
    ]);

    // Parked tab must reflect "error"
    expect(useSessionStore.getState().sessionActivity[tabId]).toBe("error");
  });

  it("opens and closes subagent popup modal", () => {
    const subView = {
      toolCallId: "call_sub_1",
      agentId: "agent_sub_1",
      type: "scout",
      description: "Search for files",
      prompt: "Find all tsx files",
      tags: [],
      background: true,
      status: "running" as const,
    };

    useSessionStore.getState().openSubagentModal({
      view: subView,
      parentSessionPath: "/path/to/session.jsonl",
      parentActiveKey: sessionKey,
      projectId: "p1",
    });

    expect(useSessionStore.getState().subagentModal).toEqual({
      view: subView,
      parentSessionPath: "/path/to/session.jsonl",
      parentActiveKey: sessionKey,
      projectId: "p1",
    });

    useSessionStore.getState().closeSubagentModal();
    expect(useSessionStore.getState().subagentModal).toBeNull();
  });

  it("opens subagent tab, updates it, and switches to it", async () => {
    const subView = {
      toolCallId: "call_sub_2",
      agentId: "agent_sub_2",
      type: "worker",
      description: "Implement feature",
      prompt: "Write unit tests",
      tags: [],
      background: false,
      status: "running" as const,
    };

    useSessionStore.getState().openSubagentTab(subView, {
      parentSessionPath: "/path/to/session.jsonl",
      parentActiveKey: sessionKey,
      projectId: "p1",
    });

    const tabs = useSessionStore.getState().tabs;
    const subTab = tabs.find((t) => t.id === "subagent:call_sub_2");
    expect(subTab).toBeDefined();
    expect(subTab?.kind).toBe("subagent");
    expect(subTab?.title).toBe("worker: Implement feature");
    expect(useSessionStore.getState().activeTabId).toBe("subagent:call_sub_2");

    // Calling again reuses the tab and updates it
    const updatedView = { ...subView, status: "completed" as const, durationMs: 1200 };
    useSessionStore.getState().openSubagentTab(updatedView);
    expect(useSessionStore.getState().tabs.filter((t) => t.id === "subagent:call_sub_2").length).toBe(1);
    const refreshedTab = useSessionStore.getState().tabs.find((t) => t.id === "subagent:call_sub_2");
    expect(refreshedTab?.subagentView?.status).toBe("completed");

    // Switching tab to subagent doesn't reset live session
    await useSessionStore.getState().switchTab("subagent:call_sub_2");
    expect(useSessionStore.getState().activeTabId).toBe("subagent:call_sub_2");
  });
});

describe("compaction result", () => {
  const stats = (tokens: number | null) =>
    ({
      contextUsage: { tokens, contextWindow: 200_000, percent: tokens === null ? null : (tokens / 200_000) * 100 },
    }) as never;

  beforeEach(() => __resetCompactionEstimates());

  it("reads tokensBefore / estimatedTokensAfter from Pi's result", () => {
    expect(readCompactionOutcome({ tokensBefore: 150_000, estimatedTokensAfter: 30_000 })).toEqual({
      tokensBefore: 150_000,
      tokensAfter: 30_000,
    });
    expect(readCompactionOutcome({ tokensBefore: 1 })).toEqual({ tokensBefore: 1, tokensAfter: null });
    expect(readCompactionOutcome(undefined)).toBeNull();
    expect(readCompactionOutcome({ summary: "x" })).toBeNull();
  });

  it("applyCompactionResult fills the null context size Pi reports until the next response", async () => {
    const getStats = vi.fn(async () => ({ ok: true, data: stats(null) }));
    vi.stubGlobal("window", {
      studio: { rpc: getStats, readSessionFile: vi.fn(async () => ({ entries: [], leafId: null })) },
    });
    useSessionStore.setState({ activeKey: "k1", tabs: [], stats: stats(150_000) } as never);

    const outcome = await applyCompactionResult("k1", { tokensBefore: 150_000, estimatedTokensAfter: 30_000 });

    expect(outcome).toEqual({ tokensBefore: 150_000, tokensAfter: 30_000 });
    const usage = useSessionStore.getState().stats?.contextUsage;
    expect(usage?.tokens).toBe(30_000);
    expect(usage?.percent).toBeCloseTo(15);
    // Pi's own stats say "unknown" -> the estimate stays; a real number takes over and clears it.
    expect(withCompactionEstimate("k1", stats(null)).contextUsage?.tokens).toBe(30_000);
    expect(withCompactionEstimate("k1", stats(42_000)).contextUsage?.tokens).toBe(42_000);
    expect(withCompactionEstimate("k1", stats(null)).contextUsage?.tokens).toBeNull();
    vi.unstubAllGlobals();
  });
});

describe("reloadPi", () => {
  const registry = (tools: string[]) => ({
    tools: tools.map((name) => ({ name, description: "", active: true, source: "extension", sourcePath: "" })),
    skills: [],
  });

  const setup = (bridgeAction: ReturnType<typeof vi.fn>, registries: unknown[] = [null, null]) => {
    const rpc = vi.fn(async (_key: string, cmd: { type: string }) =>
      cmd.type === "get_available_models"
        ? { ok: true, data: { models: [{ provider: "p", id: "m" }] } }
        : { ok: true, data: { contextUsage: null } },
    );
    const getSessionRegistry = vi.fn(async () => registries.shift() ?? null);
    vi.stubGlobal("window", { studio: { rpc, bridgeAction, getSessionRegistry } });
    useSessionStore.setState({
      activeKey: "k1",
      tabs: [{ id: "t1", activeKey: "k1" }],
      transcript: { running: false },
      // Not the displayed tab in tests, so its UI is parked in tabUi.
      tabUi: { t1: { extensionStatus: { mcp: "old" }, extensionWidgets: { w: {} } } },
      reloadStates: {},
      reloadEpoch: 0,
    } as never);
    return rpc;
  };

  it("shows reloading, then success with what changed, and refreshes dependent state", async () => {
    let seenPhase: string | undefined;
    const bridgeAction = vi.fn(async () => {
      seenPhase = useSessionStore.getState().reloadStates.k1?.phase;
      return { ok: true };
    });
    const rpc = setup(bridgeAction, [registry(["a"]), registry(["a", "b"])]);

    await useSessionStore.getState().reloadPi();

    expect(seenPhase).toBe("reloading");
    expect(bridgeAction).toHaveBeenCalledWith("k1", { action: "reload" });
    expect(rpc).toHaveBeenCalledWith("k1", { type: "get_session_stats" });
    expect(rpc).toHaveBeenCalledWith("k1", { type: "get_available_models" });
    const s = useSessionStore.getState();
    expect(s.tabUi.t1?.extensionStatus).toEqual({});
    expect(s.tabUi.t1?.extensionWidgets).toEqual({});
    expect(s.models).toEqual([{ provider: "p", id: "m" }]);
    expect(s.reloadEpoch).toBe(1);
    expect(s.reloadStates.k1).toMatchObject({ phase: "success", message: "+1 tool" });
    s.dismissReload("k1");
    expect(useSessionStore.getState().reloadStates.k1).toBeUndefined();
    vi.unstubAllGlobals();
  });

  it("reports a failure on the session without bumping the epoch", async () => {
    setup(vi.fn(async () => ({ ok: false, error: "boom" })));
    await useSessionStore.getState().reloadPi();
    const s = useSessionStore.getState();
    expect(s.reloadStates.k1).toEqual({ phase: "error", message: "boom" });
    expect(s.reloadEpoch).toBe(0);
    vi.unstubAllGlobals();
  });

  it("refuses while the agent is running", async () => {
    const bridgeAction = vi.fn(async () => ({ ok: true }));
    setup(bridgeAction);
    useSessionStore.setState({ transcript: { running: true } } as never);
    await useSessionStore.getState().reloadPi();
    expect(bridgeAction).not.toHaveBeenCalled();
    expect(useSessionStore.getState().reloadStates.k1).toBeUndefined();
    vi.unstubAllGlobals();
  });

  it("blocks sending prompts while that session reloads", async () => {
    const rpc = setup(vi.fn(async () => ({ ok: true })));
    useSessionStore.setState({
      promptText: "hi",
      reloadStates: { k1: { phase: "reloading", message: "" } },
    } as never);
    await useSessionStore.getState().sendPrompt();
    expect(rpc).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("compactionStates and compactSession", () => {
  beforeEach(() => {
    __resetCompactionStates();
    __resetCompactionEstimates();
  });

  it("sets and dismisses compaction state", () => {
    setCompactionState("k1", { phase: "compacting", saved: 15_000, toName: "Claude 3.5 Sonnet" });
    expect(useSessionStore.getState().compactionStates.k1).toEqual({
      phase: "compacting",
      saved: 15_000,
      toName: "Claude 3.5 Sonnet",
    });

    useSessionStore.getState().dismissCompaction("k1");
    expect(useSessionStore.getState().compactionStates.k1).toBeUndefined();
  });

  it("compactSession sets compacting, then done with before and tokens count", async () => {
    let seenPhaseDuringRpc: string | undefined;
    const rpc = vi.fn(async (_key: string, cmd: { type: string }) => {
      if (cmd.type === "compact") {
        seenPhaseDuringRpc = useSessionStore.getState().compactionStates.k1?.phase;
        return { ok: true, data: { tokensBefore: 120_000, estimatedTokensAfter: 25_000 } };
      }
      return { ok: true, data: {} };
    });
    vi.stubGlobal("window", { studio: { rpc } });

    useSessionStore.setState({
      activeKey: "k1",
      tabs: [{ id: "t1", activeKey: "k1", model: { id: "claude-3-5-sonnet", name: "Sonnet" } }],
      transcript: { running: false, lastUsage: { totalTokens: 120_000 } },
      stats: { contextUsage: { tokens: 120_000, contextWindow: 200_000, percent: 60 } },
      compactionStates: {},
    } as never);

    const outcome = await useSessionStore.getState().compactSession("k1", {
      saved: 95_000,
      fallbackTokensAfter: 25_000,
      toName: "Sonnet",
    });

    expect(seenPhaseDuringRpc).toBe("compacting");
    expect(rpc).toHaveBeenCalledWith("k1", { type: "compact" });
    expect(outcome).toEqual({ tokensBefore: 120_000, tokensAfter: 25_000 });

    const state = useSessionStore.getState().compactionStates.k1;
    expect(state).toEqual({
      phase: "done",
      before: 120_000,
      tokens: 25_000,
      toName: "Sonnet",
    });
    vi.unstubAllGlobals();
  });

  it("compactSession handles rpc errors and transitions to error phase", async () => {
    const rpc = vi.fn(async () => ({ ok: false, error: "Out of context memory" }));
    vi.stubGlobal("window", { studio: { rpc } });

    useSessionStore.setState({
      activeKey: "k1",
      tabs: [{ id: "t1", activeKey: "k1" }],
      transcript: { running: false },
      compactionStates: {},
    } as never);

    await expect(useSessionStore.getState().compactSession("k1")).rejects.toThrow("Out of context memory");

    const state = useSessionStore.getState().compactionStates.k1;
    expect(state).toEqual({
      phase: "error",
      message: "Out of context memory",
    });
    vi.unstubAllGlobals();
  });

  it("compactSession does not start when session is already running or compacting", async () => {
    const rpc = vi.fn(async () => ({ ok: true, data: {} }));
    vi.stubGlobal("window", { studio: { rpc } });

    useSessionStore.setState({
      activeKey: "k1",
      transcript: { running: true },
      compactionStates: {},
    } as never);

    const res1 = await useSessionStore.getState().compactSession("k1");
    expect(res1).toBeNull();
    expect(rpc).not.toHaveBeenCalled();

    useSessionStore.setState({
      activeKey: "k1",
      transcript: { running: false },
      compactionStates: { k1: { phase: "compacting" } },
    } as never);

    const res2 = await useSessionStore.getState().compactSession("k1");
    expect(res2).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("handleCompactionEvent responds to compaction_start and compaction_end", async () => {
    useSessionStore.setState({
      activeKey: "k1",
      tabs: [{ id: "t1", activeKey: "k1", model: { id: "m1", name: "Claude 3.7 Sonnet" } }],
      compactionStates: {},
    } as never);

    handleCompactionEvent("k1", { type: "compaction_start" });
    expect(useSessionStore.getState().compactionStates.k1).toEqual({
      phase: "compacting",
      toName: "Claude 3.7 Sonnet",
    });

    // Test error
    handleCompactionEvent("k1", { type: "compaction_end", errorMessage: "Failed to summarize" });
    expect(useSessionStore.getState().compactionStates.k1).toEqual({
      phase: "error",
      message: "Failed to summarize",
    });

    // Test aborted
    await handleCompactionEvent("k1", { type: "compaction_end", aborted: true });
    expect(useSessionStore.getState().compactionStates.k1).toBeUndefined();

    // Test success with result
    const rpc = vi.fn(async () => ({ ok: true, data: {} }));
    vi.stubGlobal("window", { studio: { rpc } });

    await handleCompactionEvent("k1", {
      type: "compaction_end",
      result: { tokensBefore: 80_000, estimatedTokensAfter: 15_000 },
    });

    expect(useSessionStore.getState().compactionStates.k1).toEqual({
      phase: "done",
      before: 80_000,
      tokens: 15_000,
      toName: "Claude 3.7 Sonnet",
    });

    vi.unstubAllGlobals();
  });
});
