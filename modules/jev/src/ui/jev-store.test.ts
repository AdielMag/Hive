import { beforeEach, describe, expect, it } from "vitest";
import type { JevAdvice } from "../shared.ts";
import { jevStore } from "./jev-store.ts";

const advice = (entryId: string): JevAdvice => ({
  kind: "jev_advice",
  entryId,
  at: 1,
  usagePct: 60,
  tokens: 60_000,
  contextWindow: 100_000,
  signals: { switchedGears: 0, atBoundary: 1, midOperation: 0, needsHistory: 0 },
});

beforeEach(() => jevStore.reset());

describe("jevStore", () => {
  it("keeps advice per session and notifies subscribers", () => {
    let calls = 0;
    const off = jevStore.subscribe(() => calls++);
    jevStore.setAdvice("s1", advice("e1"));
    jevStore.setAdvice("s2", advice("e2"));
    expect(Object.keys(jevStore.get().advice)).toEqual(["s1", "s2"]);
    expect(calls).toBe(2);
    off();
    jevStore.setAdvice("s1", advice("e3"));
    expect(calls).toBe(2);
  });

  it("dismisses by entry id so newer advice shows again", () => {
    jevStore.setAdvice("s1", advice("e1"));
    jevStore.dismiss("s1");
    expect(jevStore.get().dismissed.s1).toBe("e1");
    jevStore.setAdvice("s1", advice("e2"));
    expect(jevStore.get().advice.s1!.entryId).not.toBe(jevStore.get().dismissed.s1);
  });

  it("clears advice and in-flight compaction together, for one session only", () => {
    jevStore.setAdvice("s1", advice("e1"));
    jevStore.setAdvice("s2", advice("e2"));
    jevStore.startCompacting("s1", 5);
    expect(jevStore.get().compacting.s1).toBe(5);
    jevStore.clearAdvice("s1");
    expect(jevStore.get().advice.s1).toBeUndefined();
    expect(jevStore.get().compacting.s1).toBeUndefined();
    expect(jevStore.get().advice.s2).toBeDefined();
  });

  it("stops compacting and resets everything", () => {
    jevStore.startCompacting("s1");
    jevStore.stopCompacting("s1");
    expect(jevStore.get().compacting).toEqual({});
    jevStore.setAdvice("s1", advice("e1"));
    jevStore.reset();
    expect(jevStore.get()).toEqual({ advice: {}, dismissed: {}, compacting: {} });
  });
});
