import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ModuleHost } from "@hive/module-sdk/renderer";
import { useGitStore, startGitStatusWatcher } from "./git-store.ts";
import { setGitHost } from "./git-host.ts";

describe("git-store", () => {
  let listeners: Record<string, Function[]> = {};
  let project: { id: string; name: string; path: string } | null = null;
  let invoke: ReturnType<typeof vi.fn>;
  let tabListener: (() => void) | null = null;
  let host: ModuleHost;

  beforeEach(() => {
    listeners = {};
    project = null;
    tabListener = null;
    invoke = vi.fn();
    useGitStore.setState({ status: null, loading: false, lastCheckedAt: 0 });
    host = {
      ipc: { invoke, on: vi.fn() },
      sessions: { activeProject: () => project },
      tabs: {
        onChange: (l: () => void) => {
          tabListener = l;
          return () => {
            tabListener = null;
          };
        },
      },
    } as unknown as ModuleHost;
    setGitHost(host);
    (globalThis as any).window = {
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
    useGitStore.getState().setStatus({ ahead: 2, behind: 1, branch: "main", isRepo: true });
    const s = useGitStore.getState();
    expect(s.status?.ahead).toBe(2);
    expect(s.status?.behind).toBe(1);
    expect(s.status?.branch).toBe("main");
    expect(s.lastCheckedAt).toBeGreaterThan(0);
  });

  it("refreshes git status for active project", async () => {
    project = { id: "p1", name: "test", path: "/test/repo" };
    invoke.mockResolvedValueOnce({
      isRepo: true,
      branch: "feature/sync",
      ahead: 3,
      behind: 0,
      staged: [],
      unstaged: [],
      untracked: [],
    });

    await useGitStore.getState().refreshGit();

    expect(invoke).toHaveBeenCalledWith("status", "/test/repo");
    const s = useGitStore.getState();
    expect(s.status?.ahead).toBe(3);
    expect(s.status?.behind).toBe(0);
    expect(s.status?.branch).toBe("feature/sync");
    expect(s.loading).toBe(false);
  });

  it("handles non-repo or errors gracefully", async () => {
    project = { id: "p1", name: "test", path: "/test/non-repo" };
    invoke.mockRejectedValueOnce(new Error("Not a git repository"));

    await useGitStore.getState().refreshGit();

    const s = useGitStore.getState();
    expect(s.status).toBeNull();
    expect(s.loading).toBe(false);
  });

  it("watcher registers focus and unregisters cleanly", () => {
    const stop = startGitStatusWatcher(host);
    expect((globalThis as any).window.addEventListener).toHaveBeenCalledWith("focus", expect.any(Function));
    expect(tabListener).not.toBeNull();
    stop();
    expect((globalThis as any).window.removeEventListener).toHaveBeenCalledWith("focus", expect.any(Function));
    expect(tabListener).toBeNull();
  });
});
