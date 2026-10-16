import { beforeEach, describe, expect, it } from "vitest";
import type { ModuleHost } from "@hive/module-sdk/renderer";
import type { PlanPreviewData } from "../shared.ts";
import { setPlanHost } from "./plan-host.ts";
import { defaultPlanSession, normalizePlanKey, usePlanStore } from "./plan-store.ts";

const A = "C:/proj/a/plan.md";
const B = "C:/proj/b/plan.md";

function data(filePath: string): PlanPreviewData {
  return {
    filePath,
    filename: "plan.md",
    content: "# Plan\n",
    updatedAt: "",
    fileVersion: 1,
    planApproved: false,
    agentResponses: [],
    agentQuestions: [],
  } as unknown as PlanPreviewData;
}

function seed(filePath: string) {
  usePlanStore.setState((s) => ({
    plans: { ...s.plans, [normalizePlanKey(filePath)]: { ...defaultPlanSession(filePath), planData: data(filePath) } },
  }));
}

const plan = (p: string) => usePlanStore.getState().plans[normalizePlanKey(p)]!;

describe("plan store isolation", () => {
  beforeEach(() => {
    usePlanStore.setState({ plans: {}, activePlanPath: null, modalFilePath: null });
    setPlanHost({ ipc: { invoke: async () => ({ success: true }) } } as unknown as ModuleHost);
    seed(A);
    seed(B);
  });

  it("approving one plan leaves the other reviewing", async () => {
    const res = await usePlanStore.getState().submitFeedback(A, "approved");
    expect(res.success).toBe(true);
    expect(plan(A).phase).toBe("approved");
    expect(plan(B).phase).toBe("reviewing");
    expect(plan(B).planData?.planApproved).toBe(false);
  });

  it("drafts and comments stay per plan", () => {
    const st = usePlanStore.getState();
    st.setFooterComment(A, "only for A");
    st.addAnnotation(A, "text", "note");
    expect(plan(A).footerComment).toBe("only for A");
    expect(plan(B).footerComment).toBe("");
    expect(plan(B).annotations).toHaveLength(0);
  });

  it("the popup opens for one plan only", () => {
    usePlanStore.getState().openModal(A);
    expect(usePlanStore.getState().modalFilePath).toBe(A);
  });
});
