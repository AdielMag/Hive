import { describe, expect, it } from "vitest";
import { MODES } from "./ModePicker.tsx";

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
});
