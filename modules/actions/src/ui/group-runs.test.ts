import { describe, expect, it } from "vitest";
import type { ActionsRun } from "../shared.ts";
import { countStates, dayLabel, groupRuns, hueOf, lastRunByWorkflow } from "./group-runs.ts";

const NOW = new Date(2025, 5, 15, 12, 0, 0).getTime();

function run(id: number, createdAt: number, state: ActionsRun["state"] = "success"): ActionsRun {
  return {
    id, runNumber: id, attempt: 1, title: `run ${id}`, workflowId: 1, workflowName: "CI", event: "push", branch: "main", sha: "abc1234",
    actor: "octo", state, createdAt: new Date(createdAt).toISOString(), startedAt: "", updatedAt: "", url: "",
  };
}

describe("groupRuns", () => {
  it("labels today and yesterday", () => {
    expect(dayLabel(NOW - 3600_000, NOW)).toBe("Today");
    expect(dayLabel(NOW - 86_400_000, NOW)).toBe("Yesterday");
  });

  it("groups consecutive runs by day, preserving order", () => {
    const groups = groupRuns([run(3, NOW - 1000), run(2, NOW - 2000), run(1, NOW - 3 * 86_400_000)], NOW);
    expect(groups.map((g) => [g.label === "Today" ? "Today" : "older", g.runs.map((r) => r.id)])).toEqual([
      ["Today", [3, 2]],
      ["older", [1]],
    ]);
  });

  it("handles bad dates and empty input", () => {
    expect(groupRuns([], NOW)).toEqual([]);
    expect(groupRuns([{ ...run(1, NOW), createdAt: "nope" }], NOW)[0]?.label).toBe("Earlier");
  });

  it("counts states and gives a stable hue", () => {
    const c = countStates([run(1, NOW, "failure"), run(2, NOW, "failure"), run(3, NOW, "running")]);
    expect(c.failure).toBe(2);
    expect(c.running).toBe(1);
    expect(hueOf("octo")).toBe(hueOf("octo"));
    expect(hueOf("octo")).toBeLessThan(360);
  });
});

describe("lastRunByWorkflow", () => {
  it("keeps the newest run per workflow", () => {
    const a = { ...run(5, NOW), workflowId: 1 };
    const b = { ...run(4, NOW), workflowId: 2 };
    const c = { ...run(3, NOW), workflowId: 1 };
    const map = lastRunByWorkflow([a, b, c]);
    expect(map.get(1)?.id).toBe(5);
    expect(map.get(2)?.id).toBe(4);
    expect(map.size).toBe(2);
  });
});
