import { describe, expect, it } from "vitest";
import { contextTone } from "./context-tone.ts";

describe("contextTone", () => {
  it("handles boundaries", () => {
    expect(contextTone(0)).toBe("neutral");
    expect(contextTone(59.9)).toBe("neutral");
    expect(contextTone(60)).toBe("warning");
    expect(contextTone(85)).toBe("warning");
    expect(contextTone(85.1)).toBe("danger");
    expect(contextTone(100)).toBe("danger");
  });
  it("unknown for undefined/NaN", () => {
    expect(contextTone(undefined)).toBe("unknown");
    expect(contextTone(Number.NaN)).toBe("unknown");
  });
});
