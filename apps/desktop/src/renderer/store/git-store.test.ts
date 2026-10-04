import { describe, it, expect, vi, beforeEach } from "vitest";
import { useGitStore, startGitStatusWatcher } from "./git-store.ts";
import { useSessionStore } from "./session-store.ts";

describe("git-store", () => {
  let listeners: Record<string, Function[]> = {};

  beforeEach(() => {
    listeners = {};
    useGitStore.setState({ status: null, loading: false, lastCheckedAt: 0 });
    // Reset session store activeProject
    useSessionStore.setState({ activeProject: null });
    (globalThis as any).window = {
      studio: {
        getGitStatus: vi.fn(),
      },
      addEventListener: vi.fn((event: string, fn: Function) => {
        listeners[event] = listeners[event] || [];
        listeners[event].push(fn);
      }),
      removeEventListener: vi.fn((event: string, fn: Function) => {
        if (listeners[event]) {
          listeners[event] = listeners[event].filter((f) => f !== fn);
        }
      }),
    };
  });

  it("initializes with empty status", () => {
    const s = useGitStore.getState();
    expect(s.status).toBeNull();
    expect(s.loading).toBe(false);
  });

  it("updates status via setStatus directly", () => {
    useGitStore.getState().setStatus({
      ahead: 2,
      behind: 1,
      branch: "main",
      isRepo: true,
    });
    const s = useGitStore.getState();
    expect(s.status?.ahead).toBe(2);
    expect(s.status?.behind).toBe(1);
    expect(s.status?.branch).toBe("main");
    expect(s.lastCheckedAt).toBeGreaterThan(0);
  });

  it("refreshes git status for active project", async () => {
    useSessionStore.setState({
      activeProject: { id: "p1", name: "test", path: "/test/repo", color: "#fff" } as any,
    });

    (globalThis as any).window.studio.getGitStatus.mockResolvedValueOnce({
      isRepo: true,
      branch: "feature/sync",
      ahead: 3,
      behind: 0,
      staged: [],
      unstaged: [],
      untracked: [],
    });

    await useGitStore.getState().refreshGit();

    expect((globalThis as any).window.studio.getGitStatus).toHaveBeenCalledWith("/test/repo");
    const s = useGitStore.getState();
    expect(s.status?.ahead).toBe(3);
    expect(s.status?.behind).toBe(0);
    expect(s.status?.branch).toBe("feature/sync");
    expect(s.loading).toBe(false);
  });

  it("handles non-repo or errors gracefully", async () => {
    useSessionStore.setState({
      activeProject: { id: "p1", name: "test", path: "/test/non-repo", color: "#fff" } as any,
    });

    (globalThis as any).window.studio.getGitStatus.mockRejectedValueOnce(new Error("Not a git repository"));

    await useGitStore.getState().refreshGit();

    const s = useGitStore.getState();
    expect(s.status).toBeNull();
    expect(s.loading).toBe(false);
  });

  it("watcher registers focus and unregisters cleanly", () => {
    const stop = startGitStatusWatcher();
    expect((globalThis as any).window.addEventListener).toHaveBeenCalledWith("focus", expect.any(Function));
    stop();
    expect((globalThis as any).window.removeEventListener).toHaveBeenCalledWith("focus", expect.any(Function));
  });
});
