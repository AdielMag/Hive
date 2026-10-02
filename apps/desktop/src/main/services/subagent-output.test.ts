import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  encodeCwd,
  isAllowedOutputPath,
  locateSubagentOutput,
  readChunk,
  subagentRoot,
} from "./subagent-output.ts";

describe("subagent-output service", () => {
  const root = subagentRoot();
  const testSessionId = "test-session-1234";
  const tasksDir = join(root, "test-encoded-cwd", testSessionId, "tasks");

  beforeAll(() => {
    mkdirSync(tasksDir, { recursive: true });
  });

  afterAll(() => {
    try {
      rmSync(join(root, "test-encoded-cwd"), { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("encodes cwds correctly", () => {
    expect(encodeCwd("C:\\Users\\foo\\project")).toBe("Users-foo-project");
    expect(encodeCwd("/home/user/project")).toBe("home-user-project");
  });

  it("does not stall on a line longer than the read window", async () => {
    const file = join(tasksDir, "agent_long.output");
    const big = JSON.stringify({ text: "x".repeat(5000) });
    writeFileSync(file, `${big}
{"b":2}
`);
    const chunk = await readChunk(file, 0, 1000);
    expect(chunk.lines).toHaveLength(2);
    expect(chunk.nextOffset).toBe(chunk.size);
  });

  it("validates safe output paths", () => {
    const valid = join(tasksDir, "agent_1.output");
    writeFileSync(valid, '{"test":1}\n');

    expect(isAllowedOutputPath(valid)).toBe(true);
    expect(isAllowedOutputPath(join(tasksDir, "agent_1.txt"))).toBe(false);
    expect(isAllowedOutputPath("/etc/passwd.output")).toBe(false);
  });

  it("reads complete lines and advances nextOffset properly", async () => {
    const file = join(tasksDir, "chunk_test.output");
    writeFileSync(file, '{"line":1}\n{"line":2}\n{"partially_written":');

    const chunk = await readChunk(file, 0);
    expect(chunk.lines).toHaveLength(2);
    expect((chunk.lines[0] as { line: number }).line).toBe(1);
    expect((chunk.lines[1] as { line: number }).line).toBe(2);
    expect(chunk.nextOffset).toBe(22); // up to the second \n
  });

  it("locates subagent transcript by prompt match", async () => {
    const agentFile = join(tasksDir, "agent_match.output");
    const firstLine = JSON.stringify({
      isSidechain: true,
      agentId: "agent_match",
      type: "user",
      message: { role: "user", content: "Target prompt to find" },
    });
    writeFileSync(agentFile, `${firstLine}\n{"type":"assistant"}\n`);

    const located = await locateSubagentOutput(
      { prompt: "Target prompt to find" },
      testSessionId,
    );

    expect(located).not.toBeNull();
    expect(located?.agentId).toBe("agent_match");
    expect(located?.path).toBe(agentFile);

    // If excluded, should return null
    const excluded = await locateSubagentOutput(
      { prompt: "Target prompt to find", excludeAgentIds: ["agent_match"] },
      testSessionId,
    );
    expect(excluded).toBeNull();
  });
});
