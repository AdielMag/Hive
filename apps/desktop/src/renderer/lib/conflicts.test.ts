import { describe, expect, it } from "vitest";
import { buildResolved, choiceText, conflictCount, hunkContext, normalizeHunkText, parseConflicts } from "./conflicts.ts";

const file = [
  "line1",
  "<<<<<<< HEAD",
  "ours a",
  "ours b",
  "=======",
  "theirs a",
  ">>>>>>> hive/fix",
  "line2",
  "",
].join("\n");

describe("parseConflicts", () => {
  it("splits text and conflict segments", () => {
    const segs = parseConflicts(file);
    expect(conflictCount(segs)).toBe(1);
    const c = segs[1]!;
    expect(c).toMatchObject({ type: "conflict", index: 0, ours: "ours a\nours b\n", theirs: "theirs a\n", oursLabel: "HEAD", theirsLabel: "hive/fix" });
  });

  it("round-trips unresolved content", () => {
    expect(buildResolved(parseConflicts(file), {})).toBe(file);
  });

  it("applies resolutions", () => {
    const segs = parseConflicts(file);
    const c = segs[1]! as Extract<(typeof segs)[number], { type: "conflict" }>;
    expect(buildResolved(segs, { 0: { choice: "theirs", text: choiceText(c, "theirs") } })).toBe("line1\ntheirs a\nline2\n");
    expect(buildResolved(segs, { 0: { choice: "both", text: choiceText(c, "both") } })).toBe("line1\nours a\nours b\ntheirs a\nline2\n");
  });

  it("handles diff3 markers and CRLF", () => {
    const text = "a\r\n<<<<<<< HEAD\r\nx\r\n||||||| base\r\nb\r\n=======\r\ny\r\n>>>>>>> br\r\nz\r\n";
    const segs = parseConflicts(text);
    expect(segs[1]).toMatchObject({ base: "b\r\n", ours: "x\r\n", theirs: "y\r\n" });
    expect(buildResolved(segs, { 0: { choice: "ours", text: "x\r\n" } })).toBe("a\r\nx\r\nz\r\n");
  });

  it("keeps an unterminated marker as text and handles multiple hunks", () => {
    expect(conflictCount(parseConflicts("<<<<<<< HEAD\nonly\n"))).toBe(0);
    const two = `${file}${file}`;
    const segs = parseConflicts(two);
    expect(conflictCount(segs)).toBe(2);
    expect(buildResolved(segs, {})).toBe(two);
  });

  it("supports deleting both sides with an empty resolution", () => {
    expect(buildResolved(parseConflicts(file), { 0: { choice: "custom", text: "" } })).toBe("line1\nline2\n");
  });
});

describe("helpers", () => {
  it("normalizeHunkText adds a trailing newline", () => {
    expect(normalizeHunkText("a\nb")).toBe("a\nb\n");
    expect(normalizeHunkText("")).toBe("");
    expect(normalizeHunkText("a\n", "\r\n")).toBe("a\r\n");
  });

  it("hunkContext returns neighbouring lines", () => {
    const ctx = hunkContext(parseConflicts(file), 0, 5);
    expect(ctx.before).toBe("line1\n");
    expect(ctx.after).toBe("line2\n");
  });
});
