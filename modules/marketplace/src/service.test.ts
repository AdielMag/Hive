import { afterEach, describe, expect, it, vi } from "vitest";
import { MarketplaceService } from "./service.ts";

const jsonResponse = (body: unknown, ok = true, status = 200) =>
  ({ ok, status, json: async () => body }) as Response;

const npmBody = {
  objects: [
    {
      package: {
        name: "@example/pi-tool",
        version: "1.2.3",
        description: "A cool tool for coding agents",
        keywords: ["pi-package", "agent", "tools"],
        date: "2025-01-01T00:00:00.000Z",
        license: "MIT",
        author: { name: "Alice" },
        maintainers: [{ name: "alice" }, { name: "bob" }],
        links: { homepage: "https://example.com", repository: "https://github.com/example/pi-tool" },
      },
      score: { final: 0.82 },
    },
  ],
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("MarketplaceService", () => {
  it("searches npm for pi packages and maps metadata", async () => {
    const service = new MarketplaceService();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(jsonResponse(npmBody));

    const results = await service.search("coding", "pi-npm");
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      id: "@example/pi-tool",
      name: "@example/pi-tool",
      description: "A cool tool for coding agents",
      version: "1.2.3",
      sourceKind: "pi-npm",
      source: "npm:@example/pi-tool",
      author: "Alice",
      homepage: "https://example.com",
      capabilities: ["tool"],
      keywords: ["agent", "tools"],
      updatedAt: "2025-01-01T00:00:00.000Z",
      score: 0.82,
      maintainers: 2,
      repository: "https://github.com/example/pi-tool",
      license: "MIT",
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("throws on network failure", async () => {
    const service = new MarketplaceService();
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("network error"));
    await expect(service.search("", "pi-npm")).rejects.toThrow("Couldn't reach marketplace");
  });

  it("serves repeat searches from cache", async () => {
    const service = new MarketplaceService();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(npmBody));

    await service.search("coding", "pi-npm");
    await service.search("coding", "pi-npm");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("shares one in-flight request between concurrent identical searches", async () => {
    const service = new MarketplaceService();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(npmBody));

    const [a, b] = await Promise.all([service.search("x", "pi-npm"), service.search("x", "pi-npm")]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
  });

  it("bypasses the cache when forced", async () => {
    const service = new MarketplaceService();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(npmBody));

    await service.search("coding", "pi-npm");
    await service.search("coding", "pi-npm", { force: true });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("does not cache failures", async () => {
    const service = new MarketplaceService();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(jsonResponse(npmBody));

    await expect(service.search("", "pi-npm")).rejects.toThrow("Couldn't reach marketplace");
    const results = await service.search("", "pi-npm");
    expect(results).toHaveLength(1);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("fetches the Claude catalog once and filters locally per query", async () => {
    const service = new MarketplaceService();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        plugins: [
          { name: "frontend", description: "UI helpers", category: "design", keywords: ["css"] },
          { name: "linter", description: "Lint on save", category: "quality", tags: ["eslint"] },
        ],
      }),
    );

    const css = await service.search("css", "claude");
    const eslint = await service.search("eslint", "claude");
    const all = await service.search("", "claude");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(css.map((p) => p.name)).toEqual(["frontend"]);
    expect(eslint.map((p) => p.name)).toEqual(["linter"]);
    expect(all).toHaveLength(2);
    expect(css[0]?.category).toBe("design");
    expect(css[0]?.keywords).toEqual(["css"]);
  });

  it("maps MCP registry metadata: update time, status and transports", async () => {
    const service = new MarketplaceService();
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse({
        servers: [
          {
            server: {
              name: "io.example/files",
              description: "File tools",
              version: "2.0.0",
              repository: { url: "https://github.com/example/files" },
              remotes: [{ type: "streamable-http", url: "https://example.com/mcp" }],
              packages: [{ registryType: "npm", identifier: "@example/files" }],
            },
            _meta: {
              "io.modelcontextprotocol.registry/official": {
                status: "active",
                updatedAt: "2025-03-01T00:00:00.000Z",
              },
            },
          },
        ],
      }),
    );

    const entry = (await service.search("", "mcp"))[0]!;
    expect(entry.updatedAt).toBe("2025-03-01T00:00:00.000Z");
    expect(entry.status).toBe("active");
    expect(entry.transports).toEqual(["streamable-http", "npm"]);
    expect(entry.repository).toBe("https://github.com/example/files");
  });
});
