import { describe, expect, it } from "vitest";
import { MODES, shouldShowAutoEditHint } from "./ModePicker.tsx";

describe("ModePicker MODES", () => {
  it("includes ask mode with appropriate metadata", () => {
    const askMode = MODES.find((m) => m.id === "ask");
    expect(askMode).toBeDefined();
    expect(askMode?.label).toBe("Ask");
    expect(askMode?.desc).toContain("without modifying files");
    expect(askMode?.color).toBe("#38bdf8");
  });

  it("contains all 5 expected agent modes", () => {
    const ids = MODES.map((m) => m.id);
    expect(ids).toEqual(["auto-edit", "ask", "plan", "manual", "debug"]);
  });

  it("marks file-writing modes correctly", () => {
    const writesMap = Object.fromEntries(MODES.map((m) => [m.id, m.writes]));
    expect(writesMap).toEqual({
      "auto-edit": true,
      ask: false,
      plan: false,
      manual: true,
      debug: true,
    });
  });
});

describe("shouldShowAutoEditHint", () => {
  it("shows only for auto-edit until stored as seen", () => {
    expect(shouldShowAutoEditHint("auto-edit", null)).toBe(true);
    expect(shouldShowAutoEditHint(undefined, null)).toBe(true);
    expect(shouldShowAutoEditHint("auto-edit", "seen")).toBe(false);
    expect(shouldShowAutoEditHint("manual", null)).toBe(false);
  });
});
