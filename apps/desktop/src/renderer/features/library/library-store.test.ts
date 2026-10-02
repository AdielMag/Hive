import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LibraryEntry, LibrarySnapshot } from "@pi-studio/protocol";
import { useLibraryStore } from "./library-store.ts";

const mockEntry: LibraryEntry = {
  id: "/path/to/alpha.md",
  kind: "agent",
  scope: "project",
  path: "/path/to/alpha.md",
  sourceDir: "/path/to",
  name: "alpha",
  displayName: "Alpha Agent",
  description: "An agent for testing",
  frontmatter: { name: "alpha", model: "anthropic/claude-sonnet-5-5", thinking: "low" },
  raw: "---\nname: alpha\nmodel: anthropic/claude-sonnet-5-5\nthinking: low\n---\n# Overview\nBody text",
  body: "# Overview\nBody text",
  sections: [
    { level: 1, title: "Overview", slug: "overview", content: "Body text" },
  ],
  mtimeMs: 123456,
  readOnly: false,
  shadowed: false,
  warnings: [],
};

const mockSnapshot: LibrarySnapshot = {
  cwd: "/workspace",
  roots: [],
  entries: [mockEntry],
  scannedAt: 123456,
  scanMs: 10,
};

describe("useLibraryStore", () => {
  beforeEach(() => {
    (globalThis as any).window = globalThis;
    useLibraryStore.setState({
      snapshot: null,
      loading: false,
      error: null,
      selectedId: null,
      searchQuery: "",
      filterKind: "all",
      filterScope: "all",
      viewMode: "sections",
      savingField: null,
      feedback: null,
    });

    // Mock window.studio
    (window as any).studio = {
      listLibrary: vi.fn().mockResolvedValue(mockSnapshot),
      setLibraryField: vi.fn().mockImplementation((req) => {
        return Promise.resolve({
          ok: true,
          entry: {
            ...mockEntry,
            frontmatter: { ...mockEntry.frontmatter, [req.key]: req.value },
          },
        });
      }),
      revealLibraryPath: vi.fn().mockResolvedValue(undefined),
      openLibraryPath: vi.fn().mockResolvedValue({ ok: true }),
    };
  });

  it("loads library snapshot and automatically selects the first non-shadowed entry", async () => {
    await useLibraryStore.getState().load("/workspace");
    const state = useLibraryStore.getState();
    expect(state.loading).toBe(false);
    expect(state.snapshot).toEqual(mockSnapshot);
    expect(state.selectedId).toBe(mockEntry.id);
  });

  it("updates search query, kind filter, and scope filter", () => {
    const store = useLibraryStore.getState();
    store.setSearchQuery("test-query");
    expect(useLibraryStore.getState().searchQuery).toBe("test-query");

    store.setFilterKind("agent");
    expect(useLibraryStore.getState().filterKind).toBe("agent");

    store.setFilterScope("global");
    expect(useLibraryStore.getState().filterScope).toBe("global");

    store.setViewMode("raw");
    expect(useLibraryStore.getState().viewMode).toBe("raw");
  });

  it("updates frontmatter field and handles feedback", async () => {
    await useLibraryStore.getState().load("/workspace");

    const success = await useLibraryStore
      .getState()
      .updateField(mockEntry, "model", "antigravity/gemini-3.8-flash", "/workspace");

    expect(success).toBe(true);
    expect((window as any).studio.setLibraryField).toHaveBeenCalledWith({
      cwd: "/workspace",
      path: mockEntry.path,
      key: "model",
      value: "antigravity/gemini-3.8-flash",
      expectedMtimeMs: mockEntry.mtimeMs,
    });

    const updated = useLibraryStore.getState().snapshot?.entries.find((e) => e.id === mockEntry.id);
    expect(updated?.frontmatter.model).toBe("antigravity/gemini-3.8-flash");
    expect(useLibraryStore.getState().feedback?.type).toBe("success");
  });

  it("handles field update conflict by reloading snapshot", async () => {
    await useLibraryStore.getState().load("/workspace");

    (window as any).studio.setLibraryField = vi.fn().mockResolvedValue({
      ok: false,
      code: "conflict",
      error: "Changed on disk",
    });

    const success = await useLibraryStore
      .getState()
      .updateField(mockEntry, "thinking", "high", "/workspace");

    expect(success).toBe(false);
    expect(useLibraryStore.getState().feedback?.type).toBe("error");
    expect((window as any).studio.listLibrary).toHaveBeenCalledTimes(2);
  });
});
