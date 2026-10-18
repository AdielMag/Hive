import { describe, expect, it } from "vitest";
import { findTrigger, segmentMentions, splitPath } from "./MentionTextarea.tsx";

describe("findTrigger", () => {
  it("detects @ and / at start or after whitespace", () => {
    expect(findTrigger("@src/a", 6)).toEqual({ char: "@", start: 0, query: "src/a" });
    expect(findTrigger("look at @ab", 11)).toEqual({ char: "@", start: 8, query: "ab" });
    expect(findTrigger("hi\n/sk", 6)).toEqual({ char: "/", start: 3, query: "sk" });
    expect(findTrigger("@", 1)).toEqual({ char: "@", start: 0, query: "" });
  });
  it("ignores mid-word triggers and closed tokens", () => {
    expect(findTrigger("a/b", 3)).toBeNull();
    expect(findTrigger("me@example.com", 14)).toBeNull();
    expect(findTrigger("@a.ts done", 10)).toBeNull();
  });
  it("uses the caret, not the end of text", () => {
    expect(findTrigger("@ab cd", 3)).toEqual({ char: "@", start: 0, query: "ab" });
  });
});

describe("segmentMentions", () => {
  const files = new Set(["src/a.ts"]);
  const cmds = new Set(["skill:x"]);
  it("wraps only known tokens", () => {
    expect(segmentMentions("see @src/a.ts and @nope /skill:x /bad", files, cmds)).toEqual([
      "see ",
      { char: "@", token: "src/a.ts" },
      " and @nope ",
      { char: "/", token: "skill:x" },
      " /bad",
    ]);
  });
  it("handles token at start and plain text", () => {
    expect(segmentMentions("@src/a.ts", files, cmds)).toEqual(["", { char: "@", token: "src/a.ts" }, ""]);
    expect(segmentMentions("hello", files, cmds)).toEqual(["hello"]);
  });
});

describe("splitPath", () => {
  it("splits name and dir", () => {
    expect(splitPath("a/b/c.ts")).toEqual({ name: "c.ts", dir: "a/b" });
    expect(splitPath("c.ts")).toEqual({ name: "c.ts", dir: "" });
  });
});
