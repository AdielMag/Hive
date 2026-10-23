import { describe, expect, it, vi } from "vitest";
import { isActiveState, pollInterval, startActionsPolling, useActionsStore } from "./actions-store.ts";
import { setActionsHost } from "./actions-host.ts";
import type { ActionsRun } from "../shared.ts";
import { durationLabel } from "./timing.ts";

describe("pollInterval", () => {
  it("polls fast only when a run is active and the panel is open", () => {
    expect(pollInterval({ hasActive: true, panelOpen: true, hasToken: true, error: false })).toBe(10_000);
    expect(pollInterval({ hasActive: true, panelOpen: false, hasToken: true, error: false })).toBe(30_000);
    expect(pollInterval({ hasActive: false, panelOpen: true, hasToken: true, error: false })).toBe(30_000);
  });
  it("backs off without a token and on errors", () => {
    expect(pollInterval({ hasActive: true, panelOpen: true, hasToken: false, error: false })).toBe(60_000);
    expect(pollInterval({ hasActive: true, panelOpen: true, hasToken: true, error: true })).toBe(60_000);
  });
});

describe("isActiveState", () => {
  it("treats queued and running as active", () => {
    expect(isActiveState("queued")).toBe(true);
    expect(isActiveState("running")).toBe(true);
    expect(isActiveState("success")).toBe(false);
  });
});

describe("durationLabel", () => {
  const start = "2026-01-01T00:00:00Z";
  it("is null while queued", () => {
    expect(durationLabel("queued", start, undefined)).toBeNull();
  });
  it("ticks while running", () => {
    expect(durationLabel("running", start, undefined, Date.parse(start) + 65_000)).toBe("1m 05s");
  });
  it("uses end time when finished", () => {
    expect(durationLabel("success", start, "2026-01-01T00:00:42Z")).toBe("42s");
    expect(durationLabel("success", start, undefined)).toBeNull();
  });
});

describe("fixRun", () => {
  const dummyRun: ActionsRun = {
    id: 12345,
    runNumber: 42,
    attempt: 1,
    workflowId: 1,
    workflowName: "CI",
    title: "Test run",
    event: "push",
    state: "failure",
    branch: "main",
    sha: "abcdef123456",
    actor: "alice",
    url: "https://github.com/org/repo/actions/runs/12345",
    createdAt: "2026-01-01T00:00:00Z",
    startedAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:01:00Z",
  };

  it("sets fixingRunId during execution and prevents duplicate concurrent runs", async () => {
    let resolveFailureContext: (val: any) => void;
    const failureContextPromise = new Promise((resolve) => {
      resolveFailureContext = resolve;
    });

    const mockHost: any = {
      moduleId: "actions",
      sessions: {
        activeProject: () => ({ id: "p1", name: "p1", path: "/test" }),
        newSession: vi.fn().mockResolvedValue(undefined),
        setPrompt: vi.fn(),
        sendPrompt: vi.fn().mockResolvedValue(undefined),
      },
      ipc: {
        invoke: vi.fn().mockImplementation((method: string) => {
          if (method === "failureContext") return failureContextPromise;
          return Promise.resolve({ ok: true, data: {} });
        }),
      },
    };

    setActionsHost(mockHost);
    const stop = startActionsPolling(mockHost);
    useActionsStore.setState({
      repo: { owner: "org", repo: "repo", branch: "main", tokenSource: "gh" },
      fixingRunId: null,
    });

    const fixPromise = useActionsStore.getState().fixRun(dummyRun);

    // Immediately after calling, fixingRunId is set to the run's id
    expect(useActionsStore.getState().fixingRunId).toBe(12345);

    // Concurrent call for same or another run is rejected
    const secondCall = await useActionsStore.getState().fixRun(dummyRun);
    expect(secondCall).toBe(false);

    // Resolve failure context
    resolveFailureContext!({ ok: true, data: { jobs: [] } });
    const result = await fixPromise;

    expect(result).toBe(true);
    expect(mockHost.sessions.newSession).toHaveBeenCalled();
    expect(mockHost.sessions.setPrompt).toHaveBeenCalled();
    expect(mockHost.sessions.sendPrompt).toHaveBeenCalled();
    // After settling, fixingRunId is reset to null
    expect(useActionsStore.getState().fixingRunId).toBeNull();

    stop();
    setActionsHost(null);
  });

  it("resets fixingRunId and reports error when failureContext fails", async () => {
    const mockHost: any = {
      moduleId: "actions",
      sessions: {
        activeProject: () => ({ id: "p1", name: "p1", path: "/test" }),
        newSession: vi.fn(),
        setPrompt: vi.fn(),
        sendPrompt: vi.fn(),
      },
      ipc: {
        invoke: vi.fn().mockResolvedValue({ ok: false, message: "Could not fetch logs" }),
      },
    };

    setActionsHost(mockHost);
    const stop = startActionsPolling(mockHost);
    useActionsStore.setState({
      repo: { owner: "org", repo: "repo", branch: "main", tokenSource: "gh" },
      fixingRunId: null,
    });

    const result = await useActionsStore.getState().fixRun(dummyRun);
    expect(result).toBe(false);
    expect(useActionsStore.getState().fixingRunId).toBeNull();
    expect(useActionsStore.getState().notice).toEqual({ kind: "error", message: "Could not fetch logs" });

    stop();
    setActionsHost(null);
  });
});
