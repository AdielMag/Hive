import { describe, expect, it } from "vitest";
import { TRIAGE_THRESHOLDS, triageRuleHit } from "./engine/triage.ts";

describe("triageRuleHit", () => {
  it("skips only when risk AND approval are both clearly low", () => {
    expect(triageRuleHit("high", { risk: 0.5, approval: 0.1 }).action).toBe("skip");
    expect(triageRuleHit("moderate", { risk: 0.99, approval: 0.39 }).action).toBe("skip");
  });

  it("prompts at and above either threshold", () => {
    expect(triageRuleHit("high", { risk: TRIAGE_THRESHOLDS.riskBelow, approval: 0.1 }).action).toBe("prompt");
    expect(triageRuleHit("high", { risk: 0.2, approval: TRIAGE_THRESHOLDS.approvalBelow }).action).toBe("prompt");
    expect(triageRuleHit("high", { risk: 2.5, approval: 0.95 }).action).toBe("prompt");
  });

  it("never skips a critical rule hit, whatever Jev says", () => {
    expect(triageRuleHit("critical", { risk: 0, approval: 0 }).action).toBe("prompt");
  });

  it.each([
    ["no answers", null],
    ["undefined answers", undefined],
    ["risk only", { risk: 0.1 }],
    ["approval only", { approval: 0.1 }],
    ["NaN risk", { risk: Number.NaN, approval: 0.1 }],
    ["Infinity approval", { risk: 0.1, approval: Number.POSITIVE_INFINITY }],
  ])("prompts on %s", (_name, answers) => {
    expect(triageRuleHit("high", answers as never).action).toBe("prompt");
  });

  it("explains the decision", () => {
    expect(triageRuleHit("high", { risk: 0.5, approval: 0.1 }).reason).toMatch(/routine/);
    expect(triageRuleHit("critical", null).reason).toMatch(/critical/);
  });
});
