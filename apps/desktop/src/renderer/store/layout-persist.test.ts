import { describe, expect, it } from "vitest";
import { sanitizeLayout, type PersistedLayout } from "./layout-persist.ts";

describe("layout-persist", () => {
  const fallback: PersistedLayout = {
    left: "projects",
    right: null,
    leftWidth: 268,
    rightWidth: 360,
    composerHeight: 150,
  };

  it("returns fallback on null or empty object", () => {
    expect(sanitizeLayout(null, fallback)).toEqual(fallback);
    expect(sanitizeLayout({}, fallback)).toEqual(fallback);
  });

  it("sanitizes deprecated 'limits' right panel to null", () => {
    const raw = {
      left: "files",
      right: "limits",
      leftWidth: 300,
      rightWidth: 400,
    };
    const res = sanitizeLayout(raw, fallback);
    expect(res.right).toBeNull();
    expect(res.left).toBe("files");
    expect(res.leftWidth).toBe(300);
    expect(res.rightWidth).toBe(400);
  });

  it("accepts valid right panels including 'context'", () => {
    const raw = {
      right: "context",
      left: "branches",
    };
    const res = sanitizeLayout(raw, fallback);
    expect(res.right).toBe("context");
    expect(res.left).toBe("branches");
  });

  it("keeps module panel ids declared by a manifest, drops undeclared ones", () => {
    const extra = { left: new Set(["git-lens"]), right: new Set(["notes"]) };
    expect(sanitizeLayout({ left: "git-lens", right: "notes" }, fallback, extra)).toMatchObject({ left: "git-lens", right: "notes" });
    expect(sanitizeLayout({ left: "ghost", right: "ghost" }, fallback, extra)).toMatchObject({ left: null, right: null });
    expect(sanitizeLayout({ left: "git-lens" }, fallback).left).toBeNull();
  });

  it("clamps invalid dimensions to bounds", () => {
    const raw = {
      leftWidth: 10,
      rightWidth: 2000,
      composerHeight: 50,
    };
    const res = sanitizeLayout(raw, fallback);
    expect(res.leftWidth).toBe(200); // min left
    expect(res.rightWidth).toBe(760); // max right
    expect(res.composerHeight).toBe(96); // min composer
  });
});
