import { describe, expect, it, vi } from "vitest";
import { MarketplaceService } from "./service.ts";

describe("MarketplaceService", () => {
  it("searches npm for pi packages and parses capabilities", async () => {
    const service = new MarketplaceService();
    const fakeResponse = {
      objects: [
        {
          package: {
            name: "@example/pi-tool",
            version: "1.2.3",
            description: "A cool tool for coding agents",
            author: { name: "Alice" },
            links: { homepage: "https://example.com" },
          },
        },
      ],
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => fakeResponse,
    } as Response);

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
    });

    fetchSpy.mockRestore();
  });

  it("handles network failure gracefully", async () => {
    const service = new MarketplaceService();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("network error"));
    const results = await service.search("", "pi-npm");
    expect(results).toEqual([]);
    fetchSpy.mockRestore();
  });
});
