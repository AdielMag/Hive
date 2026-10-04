import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getMcpCatalog } from "./mcp-catalog.ts";

describe("mcp-catalog service", () => {
  it("parses server names and tool definitions from cache file", () => {
    const tempFile = join(tmpdir(), `test-mcp-cache-${Date.now()}.json`);
    const mockCache = {
      version: 1,
      servers: {
        github: {
          configHash: "secret_hash",
          env: { GITHUB_TOKEN: "ghp_secret123" },
          tools: [
            { name: "list_issues", description: "List repo issues" },
            { name: "create_pull_request", description: "Create PR" },
          ],
        },
      },
    };
    writeFileSync(tempFile, JSON.stringify(mockCache), "utf8");

    const catalog = getMcpCatalog(tempFile);
    expect(catalog).toHaveLength(1);
    expect(catalog[0]?.name).toBe("github");
    expect(catalog[0]?.tools).toEqual([
      { name: "list_issues", description: "List repo issues" },
      { name: "create_pull_request", description: "Create PR" },
    ]);

    // Ensure secrets like token or env are NEVER returned
    expect((catalog[0] as unknown as Record<string, unknown>).env).toBeUndefined();
    expect((catalog[0] as unknown as Record<string, unknown>).configHash).toBeUndefined();
  });

  it("handles missing or invalid files gracefully", () => {
    const catalog = getMcpCatalog("/non/existent/path.json");
    expect(catalog).toEqual([]);
  });
});
