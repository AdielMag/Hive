import { describe, expect, it } from "vitest";
import {
  detectSkillRead,
  indexSkills,
  parseFrontmatter,
  parseSkillBlock,
  skillForToolCall,
} from "./skills.ts";
import type { Timeline } from "@hive/pi-adapter";

describe("skills helpers", () => {
  const ctx = {
    cwd: "C:/Users/talel/project",
    homeDir: "C:/Users/talel",
  };

  it("parses YAML frontmatter with quoted and folded descriptions", () => {
    const raw = `---
name: "frontend-design"
description: >
  Guidance for distinctive visual design when
  building new UI or reshaping an existing one.
---
# Frontend Design Guide
Content here`;

    const res = parseFrontmatter(raw);
    expect(res.name).toBe("frontend-design");
    expect(res.description).toBe(
      "Guidance for distinctive visual design when building new UI or reshaping an existing one.",
    );
    expect(res.body).toContain("# Frontend Design Guide");
  });

  it("detects skill reads on SKILL.md", () => {
    const fileContent = `---
name: plan-previewer
description: Mandatory plan previewer
---
Instructions here`;

    const detected = detectSkillRead(
      "read",
      { path: "C:\\Users\\talel\\.pi\\agent\\skills\\plan-previewer\\SKILL.md" },
      fileContent,
      null,
      ctx,
    );

    expect(detected).not.toBeNull();
    expect(detected?.name).toBe("plan-previewer");
    expect(detected?.description).toBe("Mandatory plan previewer");
    expect(detected?.source).toBe("read");
    expect(detected?.baseDir).toBe("c:/users/talel/.pi/agent/skills/plan-previewer");
  });

  it("parses interactive /skill:name user message block", () => {
    const userBlock = `<skill name="ui-typography" location="C:/Users/talel/.pi/agent/skills/ui-typography/SKILL.md">
Rule 1: quotes
Rule 2: dashes
</skill>

Please check this component`;

    const parsed = parseSkillBlock(userBlock);
    expect(parsed).not.toBeNull();
    expect(parsed?.name).toBe("ui-typography");
    expect(parsed?.location).toBe("C:/Users/talel/.pi/agent/skills/ui-typography/SKILL.md");
    expect(parsed?.body).toContain("Rule 1: quotes");
    expect(parsed?.rest).toBe("Please check this component");
  });

  it("associates tool calls with loaded skill directories", () => {
    const skillDirs = new Map([
      ["c:/users/talel/.pi/agent/skills/plan-previewer", "plan-previewer"],
    ]);

    expect(
      skillForToolCall(
        "read",
        { path: "C:\\Users\\talel\\.pi\\agent\\skills\\plan-previewer\\references\\flow.md" },
        skillDirs,
        ctx,
      ),
    ).toBe("plan-previewer");

    expect(
      skillForToolCall(
        "bash",
        { command: "node C:\\Users\\talel\\.pi\\agent\\skills\\plan-previewer\\cli.mjs run" },
        skillDirs,
        ctx,
      ),
    ).toBe("plan-previewer");

    expect(
      skillForToolCall(
        "read",
        { path: "C:\\Users\\talel\\project\\src\\index.ts" },
        skillDirs,
        ctx,
      ),
    ).toBeNull();
  });

  it("indexes skill loads and tool usage in timeline", () => {
    const timeline: Timeline = {
      items: [
        {
          kind: "assistant",
          key: "a1",
          streaming: false,
          blocks: [
            {
              type: "toolCall",
              id: "tc_read_skill",
              name: "read",
              arguments: { path: "skills/test/SKILL.md" },
              complete: true,
            },
          ],
        },
        {
          kind: "assistant",
          key: "a2",
          streaming: false,
          blocks: [
            {
              type: "toolCall",
              id: "tc_read_ref",
              name: "read",
              arguments: { path: "skills/test/references/doc.md" },
              complete: true,
            },
            {
              type: "toolCall",
              id: "tc_read_other",
              name: "read",
              arguments: { path: "src/main.ts" },
              complete: true,
            },
          ],
        },
      ],
      toolResults: {
        tc_read_skill: {
          toolCallId: "tc_read_skill",
          toolName: "read",
          isError: false,
          text: "---\nname: my-skill\ndescription: A test skill\n---\nBody",
          images: [],
        },
      },
    };

    const index = indexSkills(timeline, null, ctx);
    expect(index.loads.has("tc_read_skill")).toBe(true);
    expect(index.loads.get("tc_read_skill")?.name).toBe("my-skill");
    expect(index.usedBy.get("tc_read_ref")).toBe("my-skill");
    expect(index.usedBy.has("tc_read_other")).toBe(false);
  });
});
