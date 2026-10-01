import { describe, expect, it } from "vitest";
import { mergePathLists } from "./shell-env.ts";

describe("mergePathLists", () => {
  it("puts fresh entries first and keeps process-only extras", () => {
    expect(mergePathLists("/opt/homebrew/bin:/usr/bin", "/usr/bin:/bin", ":")).toBe("/opt/homebrew/bin:/usr/bin:/bin");
  });

  it("dedupes Windows entries case-insensitively and ignores trailing slashes", () => {
    expect(mergePathLists("C:\\Users\\A\\AppData\\Local\\pi-node\\current;C:\\Windows", "c:\\windows\\;C:\\Tools", ";")).toBe(
      "C:\\Users\\A\\AppData\\Local\\pi-node\\current;C:\\Windows;C:\\Tools",
    );
  });
});
