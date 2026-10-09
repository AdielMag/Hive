import { describe, expect, it } from "vitest";
import { isActiveState, pollInterval } from "./actions-store.ts";
import { durationLabel } from "./timing.ts";

describe("pollInterval", () => {
  it("polls fast only when a run is active and the panel is open", () => {
    expect(pollInterval({ hasActive: true, panelOpen: true, hasToken: true, error: false })).toBe(5_000);
    expect(pollInterval({ hasActive: true, panelOpen: false, hasToken: true, error: false })).toBe(30_000);
    expect(pollInterval({ hasActive: false, panelOpen: true, hasToken: true, error: false })).toBe(30_000);
  });
  it("backs off without a token and on errors", () => {
    expect(pollInterval({ hasActive: true, panelOpen: true, hasToken: false, error: false })).toBe(60_000);
    expect(pollInterval({ hasActive: true, panelOpen: true, hasToken: true, error: true })).toBe(60_000);
  });
});

describe("isActiveState", () => {
  it("treats queued and running as active", () => {
    expect(isActiveState("queued")).toBe(true);
    expect(isActiveState("running")).toBe(true);
    expect(isActiveState("success")).toBe(false);
  });
});

describe("durationLabel", () => {
  const start = "2026-01-01T00:00:00Z";
  it("is null while queued", () => {
    expect(durationLabel("queued", start, undefined)).toBeNull();
  });
  it("ticks while running", () => {
    expect(durationLabel("running", start, undefined, Date.parse(start) + 65_000)).toBe("1m 05s");
  });
  it("uses end time when finished", () => {
    expect(durationLabel("success", start, "2026-01-01T00:00:42Z")).toBe("42s");
    expect(durationLabel("success", start, undefined)).toBeNull();
  });
});
