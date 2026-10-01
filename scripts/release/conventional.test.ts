import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM script without types
import { bumpVersion, decideBump, isReleaseCommit, parseCommit, prependChangelog, renderChangelogSection } from "./conventional.mjs";

const c = (subject: string, body = "", hash = "abcdef1234567") => parseCommit({ hash, subject, body });

describe("conventional commits", () => {
  it("parses type, scope, breaking markers", () => {
    expect(c("feat(ui): arc theme")).toMatchObject({ type: "feat", scope: "ui", breaking: false, description: "arc theme" });
    expect(c("fix!: drop node 20")).toMatchObject({ type: "fix", breaking: true });
    expect(c("refactor: x", "BREAKING CHANGE: api moved")).toMatchObject({ breaking: true });
    expect(c("Merge pull request #4 from x")).toMatchObject({ type: "other" });
  });

  it("decides bumps (pre-1.0 breaking => minor)", () => {
    expect(decideBump([], "0.1.0")).toBeNull();
    expect(decideBump([c("docs: readme")], "0.1.0")).toBe("patch");
    expect(decideBump([c("fix: a"), c("feat: b")], "0.1.0")).toBe("minor");
    expect(decideBump([c("feat!: b")], "0.4.2")).toBe("minor");
    expect(decideBump([c("feat!: b")], "1.4.2")).toBe("major");
  });

  it("bumps versions", () => {
    expect(bumpVersion("0.1.0", "patch")).toBe("0.1.1");
    expect(bumpVersion("v0.1.9", "minor")).toBe("0.2.0");
    expect(bumpVersion("1.2.3", "major")).toBe("2.0.0");
  });

  it("recognizes release commits", () => {
    expect(isReleaseCommit({ subject: "chore(release): v0.2.0 [skip ci]" })).toBe(true);
    expect(isReleaseCommit({ subject: "feat: x" })).toBe(false);
  });

  it("renders grouped changelog sections and prepends them", () => {
    const section = renderChangelogSection({
      version: "0.2.0",
      date: "2026-10-01",
      commits: [c("feat(insights): usage window"), c("fix: crash on open"), c("chore: tidy")],
      repoUrl: "https://github.com/o/r",
      previousTag: "v0.1.0",
    });
    expect(section).toContain("## v0.2.0 — 2026-10-01 · [diff](https://github.com/o/r/compare/v0.1.0...v0.2.0)");
    expect(section).toContain("### ✨ Features");
    expect(section).toContain("- **insights:** usage window ([`abcdef1`](https://github.com/o/r/commit/abcdef1234567))");
    expect(section.indexOf("Features")).toBeLessThan(section.indexOf("Fixes"));
    const doc = prependChangelog("", section);
    expect(doc.startsWith("# Changelog")).toBe(true);
    const doc2 = prependChangelog(doc, "## v0.3.0 — x\n");
    expect(doc2.indexOf("v0.3.0")).toBeLessThan(doc2.indexOf("v0.2.0"));
  });
});
