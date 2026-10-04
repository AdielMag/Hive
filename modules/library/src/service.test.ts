import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  applyFrontmatterEdit,
  deleteLibraryEntry,
  isEditableLibraryPath,
  listLibrary,
  parseFrontmatter,
  setFrontmatterField,
  splitSections,
} from "./service.ts";

let tmp: string;
let agentDir: string;
let homeDir: string;
let project: string;
const opts = () => ({ agentDir, homeDir });

function put(path: string, content: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "pi-library-test-"));
  agentDir = join(tmp, "home", ".pi", "agent");
  homeDir = join(tmp, "home");
  project = join(tmp, "work", "proj");
  mkdirSync(join(project, ".git"), { recursive: true });
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

describe("listLibrary", () => {
  it("discovers global + project skills and agents, with overrides and builtins", async () => {
    put(join(agentDir, "skills", "alpha", "SKILL.md"), "---\nname: alpha\ndescription: Global alpha\n---\n# Alpha\nbody");
    put(join(agentDir, "skills", "alpha", "scripts", "run.sh"), "echo hi");
    put(join(agentDir, "skills", "alpha", "node_modules", "x.js"), "");
    put(join(agentDir, "skills", "alpha", ".hidden", "y"), "");
    put(join(agentDir, "skills", "nested", "deep", "beta", "SKILL.md"), "---\ndescription: Beta\n---\nhi");
    put(join(agentDir, "skills", "flat.md"), "---\ndescription: Flat skill\n---\nflat");
    put(join(homeDir, ".agents", "skills", "gamma", "SKILL.md"), "---\ndescription: Gamma\n---\n");
    put(join(project, ".pi", "skills", "alpha", "SKILL.md"), "---\nname: alpha\ndescription: Project alpha\n---\n");
    put(join(agentDir, "agents", "scout.md"), "---\nname: scout\nmodel: anthropic/claude\nthinking: low\n---\nGlobal scout");
    put(join(agentDir, "agents", "Explore.md"), "---\nname: Explore\nenabled: false\n---\n");
    put(join(project, ".pi", "agents", "renamed-file.md"), "---\nname: scout\n---\nProject scout");
    put(join(project, ".agents", "agents", "helper.md"), "---\ndescription: Helper\n---\n");
    put(join(agentDir, "agents", "broken.md"), "---\nname: [unclosed\n---\nbody");

    const snap = await listLibrary(project, opts());
    const find = (kind: string, name: string, scope: string) => snap.entries.find((e) => e.kind === kind && e.name === name && e.scope === scope);

    const projAlpha = find("skill", "alpha", "project")!;
    const globAlpha = find("skill", "alpha", "global")!;
    expect(projAlpha.shadowed).toBe(false);
    expect(globAlpha.shadowed).toBe(true);
    expect(globAlpha.overriddenBy).toBe(projAlpha.path);
    expect(globAlpha.supportingFiles).toEqual(["scripts/run.sh"]);
    expect(find("skill", "beta", "global")).toBeTruthy();
    expect(find("skill", "flat", "global")?.description).toBe("Flat skill");
    expect(find("skill", "gamma", "global")).toBeTruthy();

    const projScout = find("agent", "scout", "project")!;
    const globScout = find("agent", "scout", "global")!;
    expect(projScout.path).toContain("renamed-file.md");
    expect(globScout.shadowed).toBe(true);
    expect(globScout.overriddenBy).toBe(projScout.path);
    expect(globScout.frontmatter.model).toBe("anthropic/claude");
    expect(find("agent", "helper", "project")).toBeTruthy();

    const builtinExplore = snap.entries.find((e) => e.id === "builtin:Explore")!;
    expect(builtinExplore.shadowed).toBe(true);
    expect(builtinExplore.readOnly).toBe(true);
    expect(find("agent", "Explore", "global")?.overridesBuiltin).toBe(true);
    expect(snap.entries.find((e) => e.id === "builtin:Plan")?.shadowed).toBe(false);

    const broken = find("agent", "broken", "global")!;
    expect(broken.parseError).toMatch(/Invalid YAML/);
  });

  it("works without a project and flags skills lacking a description", async () => {
    put(join(agentDir, "skills", "nodesc", "SKILL.md"), "# No frontmatter\n");
    const snap = await listLibrary(undefined, opts());
    const e = snap.entries.find((x) => x.name === "nodesc")!;
    expect(e.scope).toBe("global");
    expect(e.warnings.join(" ")).toMatch(/description/);
    expect(snap.entries.filter((x) => x.scope === "builtin")).toHaveLength(3);
  });
});

describe("splitSections", () => {
  it("splits on headings, keeps intro as Overview and ignores # inside fences", () => {
    const body = [
      "Intro text.",
      "",
      "## First",
      "a",
      "```bash",
      "# not a heading",
      "## also not",
      "```",
      "### Sub stays inside",
      "b",
      "## Second",
      "~~~",
      "# nope",
      "~~~",
      "c",
      "## First",
    ].join("\n");
    const s = splitSections(body);
    expect(s.map((x) => x.title)).toEqual(["Overview", "First", "Second", "First"]);
    expect(s[0]!.level).toBe(0);
    expect(s[1]!.content).toContain("# not a heading");
    expect(s[1]!.content).toContain("### Sub stays inside");
    expect(s[3]!.slug).toBe("first-1");
  });

  it("splits a single-title document at the next level", () => {
    const s = splitSections("# Title\nlead\n## A\nx\n## B\ny");
    expect(s.map((x) => `${x.level}:${x.title}`)).toEqual(["1:Title", "2:A", "2:B"]);
    expect(s[0]!.content).toBe("lead");
  });
});

describe("applyFrontmatterEdit", () => {
  const src = "---\nname: a # keep comment line below\n# a comment\nmodel: old/model\ntools: read, bash\n---\n# Body\n";

  it("replaces only the target line", () => {
    const out = applyFrontmatterEdit(src, "model", "anthropic/claude-opus-4-6");
    expect(out).toBe(src.replace("model: old/model", "model: anthropic/claude-opus-4-6"));
  });

  it("inserts before the closing fence", () => {
    const out = applyFrontmatterEdit(src, "thinking", "high");
    expect(out).toBe(src.replace("tools: read, bash\n---", "tools: read, bash\nthinking: high\n---"));
  });

  it("removes the key", () => {
    const out = applyFrontmatterEdit(src, "model", null);
    expect(out).toBe(src.replace("model: old/model\n", ""));
  });

  it("creates frontmatter when missing", () => {
    expect(applyFrontmatterEdit("# Hello\n", "enabled", false)).toBe("---\nenabled: false\n---\n# Hello\n");
    expect(applyFrontmatterEdit("# Hello\n", "enabled", null)).toBe("# Hello\n");
  });

  it("preserves CRLF line endings", () => {
    const crlf = src.replace(/\n/g, "\r\n");
    const out = applyFrontmatterEdit(crlf, "thinking", "low");
    expect(out).toBe(crlf.replace("tools: read, bash\r\n---", "tools: read, bash\r\nthinking: low\r\n---"));
    expect(out.replace(/\r\n/g, "")).not.toContain("\n");
  });

  it("quotes values that need it and writes numbers/booleans", () => {
    const out = applyFrontmatterEdit(src, "color", "#8B5CF6");
    expect(out).toContain('color: "#8B5CF6"');
    expect(parseFrontmatter(out).frontmatter.color).toBe("#8B5CF6");
    const colon = applyFrontmatterEdit(src, "description", "Use when: x");
    expect(parseFrontmatter(colon).frontmatter.description).toBe("Use when: x");
    const numeric = applyFrontmatterEdit(src, "model", "123");
    expect(parseFrontmatter(numeric).frontmatter.model).toBe("123");
    expect(applyFrontmatterEdit(src, "max_turns", 30)).toContain("max_turns: 30\n");
    expect(applyFrontmatterEdit(src, "enabled", true)).toContain("enabled: true\n");
  });

  it("falls back to YAML round-trip for multi-line values", () => {
    const multi = "---\nname: a\nskills:\n  - one\n  - two\nmodel: x\n---\nbody\n";
    const out = applyFrontmatterEdit(multi, "skills", "one, two");
    const fm = parseFrontmatter(out).frontmatter;
    expect(fm.skills).toBe("one, two");
    expect(fm.model).toBe("x");
    expect(out.endsWith("---\nbody\n")).toBe(true);
    const removed = parseFrontmatter(applyFrontmatterEdit(multi, "skills", null)).frontmatter;
    expect(removed).toEqual({ name: "a", model: "x" });
  });
});

describe("setFrontmatterField", () => {
  it("writes allowed files, detects conflicts and refuses paths outside the roots", async () => {
    const file = join(agentDir, "agents", "w.md");
    put(file, "---\nname: w\n---\nhello\n");
    const mtime = statSync(file).mtimeMs;

    const ok = await setFrontmatterField({ path: file, key: "model", value: "openai/gpt-5", expectedMtimeMs: mtime }, opts());
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.entry.frontmatter.model).toBe("openai/gpt-5");
    expect(readFileSync(file, "utf8")).toBe("---\nname: w\nmodel: openai/gpt-5\n---\nhello\n");

    utimesSync(file, new Date(), new Date(Date.now() + 60_000));
    const conflict = await setFrontmatterField({ path: file, key: "thinking", value: "low", expectedMtimeMs: mtime }, opts());
    expect(conflict).toMatchObject({ ok: false, code: "conflict" });

    const outside = join(tmp, "elsewhere.md");
    put(outside, "---\nname: x\n---\n");
    expect(await setFrontmatterField({ path: outside, key: "model", value: "a/b" }, opts())).toMatchObject({ ok: false, code: "not-allowed" });
    expect(readFileSync(outside, "utf8")).toBe("---\nname: x\n---\n");

    const txt = join(agentDir, "agents", "notes.txt");
    put(txt, "x");
    expect(await setFrontmatterField({ path: txt, key: "model", value: "a/b" }, opts())).toMatchObject({ ok: false, code: "not-allowed" });
    expect(await setFrontmatterField({ path: file, key: "bad key", value: "a" }, opts())).toMatchObject({ ok: false, code: "not-allowed" });

    const projFile = join(project, ".pi", "agents", "p.md");
    put(projFile, "---\nname: p\n---\n");
    expect(isEditableLibraryPath(projFile, undefined, opts())).toBe(false);
    expect(isEditableLibraryPath(projFile, project, opts())).toBe(true);
    const res = await setFrontmatterField({ cwd: project, path: projFile, key: "enabled", value: false }, opts());
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.entry.scope).toBe("project");
  });
});

describe("deleteLibraryEntry", () => {
  it("deletes an agent markdown file", async () => {
    const file = join(agentDir, "agents", "custom.md");
    put(file, "---\nname: custom\n---\nHello agent");
    expect(existsSync(file)).toBe(true);

    const res = await deleteLibraryEntry({ path: file }, opts());
    expect(res).toEqual({ ok: true });
    expect(existsSync(file)).toBe(false);
  });

  it("deletes a flat skill markdown file", async () => {
    const file = join(project, ".pi", "skills", "flat-skill.md");
    put(file, "---\ndescription: Flat\n---\nBody");
    expect(existsSync(file)).toBe(true);

    const res = await deleteLibraryEntry({ cwd: project, path: file }, opts());
    expect(res).toEqual({ ok: true });
    expect(existsSync(file)).toBe(false);
  });

  it("deletes a folder skill including SKILL.md and supporting files", async () => {
    const skillDir = join(project, ".pi", "skills", "bundle-skill");
    const skillFile = join(skillDir, "SKILL.md");
    put(skillFile, "---\ndescription: Bundle\n---\nBody");
    put(join(skillDir, "helper.js"), "console.log('hi');");
    put(join(skillDir, "sub", "doc.txt"), "some doc");

    expect(existsSync(skillFile)).toBe(true);
    expect(existsSync(skillDir)).toBe(true);

    const res = await deleteLibraryEntry({ cwd: project, path: skillFile }, opts());
    expect(res).toEqual({ ok: true });
    expect(existsSync(skillDir)).toBe(false);
  });

  it("uses trashItem when provided and falls back to rm on failure", async () => {
    const file = join(agentDir, "agents", "trash-me.md");
    put(file, "---\nname: trash\n---\nTrash me");

    let trashed = false;
    const res = await deleteLibraryEntry(
      { path: file },
      {
        ...opts(),
        trashItem: async (target) => {
          expect(target).toBe(file);
          trashed = true;
          rmSync(target);
        },
      },
    );
    expect(res).toEqual({ ok: true });
    expect(trashed).toBe(true);
    expect(existsSync(file)).toBe(false);
  });

  it("refuses paths outside discovery roots", async () => {
    const outside = join(tmp, "evil.md");
    put(outside, "---\nname: evil\n---\n");

    const res = await deleteLibraryEntry({ path: outside }, opts());
    expect(res).toEqual({ ok: false, error: "Path is not a skill or agent file in a known location." });
    expect(existsSync(outside)).toBe(true);
  });

  it("fails gracefully when the file does not exist", async () => {
    const missing = join(agentDir, "agents", "missing.md");
    const res = await deleteLibraryEntry({ path: missing }, opts());
    expect(res).toEqual({ ok: false, error: "File does not exist." });
  });
});
