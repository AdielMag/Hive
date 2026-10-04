import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { listContextFiles } from "./context-files.ts";

let tmp: string;
const put = (path: string, content: string) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
};

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "ctx-files-test-"));
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

describe("listContextFiles", () => {
  it("measures global + ancestor + project instruction files, one per directory", () => {
    const agentDir = join(tmp, "agent");
    const parent = join(tmp, "work");
    const project = join(parent, "proj");
    put(join(agentDir, "AGENTS.md"), "a".repeat(100));
    put(join(parent, "CLAUDE.md"), "b".repeat(50));
    put(join(project, "AGENTS.md"), "c".repeat(30));
    put(join(project, "CLAUDE.md"), "ignored (AGENTS.md wins)");
    put(join(project, ".pi", "APPEND_SYSTEM.md"), "d".repeat(10));

    const files = listContextFiles(project, { agentDir });
    const byLabel = Object.fromEntries(files.map((f) => [f.label, f]));
    expect(byLabel["Global AGENTS.md"]).toMatchObject({ chars: 100, scope: "global" });
    expect(byLabel["Parent CLAUDE.md"]).toMatchObject({ chars: 50, scope: "project" });
    expect(byLabel["Project AGENTS.md"]).toMatchObject({ chars: 30, scope: "project" });
    expect(byLabel["Project APPEND_SYSTEM.md"]).toMatchObject({ chars: 10 });
    expect(files.filter((f) => f.path.endsWith("CLAUDE.md") && f.label.startsWith("Project"))).toHaveLength(0);
  });

  it("returns only global files without a cwd and never throws on missing dirs", () => {
    expect(listContextFiles(undefined, { agentDir: join(tmp, "nope") })).toEqual([]);
  });
});
