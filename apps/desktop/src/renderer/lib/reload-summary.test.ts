import { describe, expect, it } from "vitest";
import { summarizeReload } from "./reload-summary.ts";

const reg = (tools: string[], skills: string[]) => ({
  tools: tools.map((name) => ({ name, description: "", active: true, source: "extension" as const, sourcePath: "" })),
  skills: skills.map((name) => ({ name, description: "", filePath: "", baseDir: "" })),
});

describe("summarizeReload", () => {
  it("reports additions and removals with names", () => {
    const s = summarizeReload(reg(["a", "b"], ["x"]), reg(["a", "c", "d"], ["x", "y"]));
    expect(s.text).toBe("+2 tools, -1 tool, +1 skill");
    expect(s.changed).toBe(true);
    expect(s.detail).toContain("Added tools: c, d");
    expect(s.detail).toContain("Removed tools: b");
    expect(s.detail).toContain("Added skills: y");
  });

  it("says no changes when the sets match", () => {
    expect(summarizeReload(reg(["a"], ["x"]), reg(["a"], ["x"])).text).toBe("no changes");
  });

  it("falls back to totals without a before-snapshot", () => {
    expect(summarizeReload(null, reg(["a"], ["x", "y"])).text).toBe("1 tool, 2 skills");
    expect(summarizeReload(null, null).text).toBe("done");
  });
});
