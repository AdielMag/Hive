import { describe, expect, it } from "vitest";
import { isUnder, normPath } from "./paths.ts";

describe("paths helpers", () => {
  const ctx = {
    cwd: "C:/Users/talel/project",
    homeDir: "C:/Users/talel",
  };

  it("normalizes Windows paths and lowercases them", () => {
    expect(normPath("C:\\Users\\talel\\project\\SKILL.md", ctx)).toBe(
      "c:/users/talel/project/skill.md",
    );
  });

  it("expands ~ home directory", () => {
    expect(normPath("~/.pi/agent/skills/foo", ctx)).toBe(
      "c:/users/talel/.pi/agent/skills/foo",
    );
  });

  it("resolves relative paths against cwd", () => {
    expect(normPath("skills/my-skill/SKILL.md", ctx)).toBe(
      "c:/users/talel/project/skills/my-skill/skill.md",
    );
    expect(normPath("./skills/my-skill/SKILL.md", ctx)).toBe(
      "c:/users/talel/project/skills/my-skill/skill.md",
    );
    expect(normPath("../other/SKILL.md", ctx)).toBe(
      "c:/users/talel/other/skill.md",
    );
  });

  it("resolves POSIX paths", () => {
    const posixCtx = {
      cwd: "/home/user/app",
      homeDir: "/home/user",
    };
    expect(normPath("~/skills/foo", posixCtx)).toBe("/home/user/skills/foo");
    expect(normPath("sub/dir/file.txt", posixCtx)).toBe("/home/user/app/sub/dir/file.txt");
  });

  it("detects whether a path is under a directory", () => {
    const dir = "c:/users/talel/skills/test-skill";
    expect(isUnder("c:/users/talel/skills/test-skill/SKILL.md", dir)).toBe(true);
    expect(isUnder("c:/users/talel/skills/test-skill/references/guide.md", dir)).toBe(true);
    expect(isUnder("c:/users/talel/skills/test-skill", dir)).toBe(true);
    expect(isUnder("c:/users/talel/skills/other-skill/SKILL.md", dir)).toBe(false);
    expect(isUnder("c:/users/talel/skills/test-skill-2", dir)).toBe(false);
  });
});
