import { describe, expect, it } from "vitest";
import { groupSessions, isSubagentSession, normPath, subagentId, subagentType } from "./subagent-sessions.ts";

const s = (path: string, name?: string, parentSessionPath?: string, modified = "2026-10-17T00:00:00Z") => ({
  path,
  name,
  parentSessionPath,
  modified,
});

describe("subagent sessions", () => {
  it("detects subagent runs by parent + name pattern", () => {
    expect(isSubagentSession(s("a", "reviewer#54da68dd", "p"))).toBe(true);
    expect(isSubagentSession(s("a", "general-purpose#0c17db8f", "p"))).toBe(true);
    // forks have a parent but a normal name
    expect(isSubagentSession(s("a", "Fix the login bug", "p"))).toBe(false);
    // named like a subagent but no parent
    expect(isSubagentSession(s("a", "reviewer#54da68dd"))).toBe(false);
    expect(subagentType(s("a", "scout#0e120e6e", "p"))).toBe("scout");
    expect(subagentId(s("a", "scout#0e120e6e", "p"))).toBe("0e120e6e");
  });

  it("normalises Windows paths", () => {
    expect(normPath("C:\\Users\\X\\s.jsonl")).toBe(normPath("c:/Users/X/s.jsonl"));
  });

  it("nests children under their parent, newest first, and keeps forks and orphans apart", () => {
    const parent = s("C:\\sessions\\parent.jsonl", "Parent");
    const fork = s("C:/sessions/fork.jsonl", "Forked work", "C:/sessions/parent.jsonl");
    const older = s("C:/sessions/r1.jsonl", "reviewer#11111111", "c:/sessions/parent.jsonl", "2026-10-17T01:00:00Z");
    const newer = s("C:/sessions/r2.jsonl", "verifier#22222222", "C:\\sessions\\parent.jsonl", "2026-10-17T02:00:00Z");
    const orphan = s("C:/sessions/o.jsonl", "scout#33333333", "C:/sessions/gone.jsonl");
    const g = groupSessions([parent, older, fork, newer, orphan]);
    expect(g.roots).toEqual([parent, fork]);
    expect(g.childrenByParent.get(normPath(parent.path))).toEqual([newer, older]);
    expect(g.orphans).toEqual([orphan]);
  });
});
