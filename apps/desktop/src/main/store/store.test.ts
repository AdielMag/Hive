import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GuiStore } from "./index.ts";

describe("GuiStore", () => {
  let tmpBase: string;

  beforeEach(() => {
    tmpBase = mkdtempSync(join(tmpdir(), "pi-studio-store-test-"));
  });

  afterEach(() => {
    try {
      rmSync(tmpBase, { recursive: true, force: true });
    } catch {}
  });

  it("initializes empty files and adds projects with auto-assigned colors", () => {
    const store = new GuiStore(tmpBase);
    expect(store.getProjects()).toHaveLength(0);

    const p1 = store.addProject("C:/Users/Test/RepoA");
    expect(p1.id).toMatch(/^prj_/);
    expect(p1.name).toBe("RepoA");
    expect(p1.path).toBe("C:/Users/Test/RepoA");
    expect(p1.color).toBeDefined();

    const p2 = store.addProject("C:/Users/Test/RepoB");
    expect(p2.color).not.toBe(p1.color); // different hue
    expect(store.getProjects()).toHaveLength(2);

    // Idempotent add returns existing
    const p1Again = store.addProject("C:\\Users\\Test\\RepoA\\");
    expect(p1Again.id).toBe(p1.id);
    expect(store.getProjects()).toHaveLength(2);
  });

  it("matches projects using longest prefix match", () => {
    const store = new GuiStore(tmpBase);
    store.addProject("C:/Users/Test");
    const sub = store.addProject("C:/Users/Test/SpecificSubproject");

    const matchSub = store.getProjectByPath("C:/Users/Test/SpecificSubproject/src/index.ts");
    expect(matchSub?.id).toBe(sub.id);

    const matchRoot = store.getProjectByPath("C:/Users/Test/other/file.ts");
    expect(matchRoot?.name).toBe("Test");

    const matchNone = store.getProjectByPath("D:/OtherDrive/foo");
    expect(matchNone).toBeUndefined();
  });

  it("updates and removes projects", () => {
    const store = new GuiStore(tmpBase);
    const p = store.addProject("C:/Users/Test/RepoA");

    const updated = store.updateProject(p.id, {
      name: "Custom Name",
      color: "#ff0000",
      links: [{ path: "C:/Users/Test/Lib", access: "read-only" }],
    });
    expect(updated.name).toBe("Custom Name");
    expect(updated.color).toBe("#ff0000");
    expect(updated.links).toHaveLength(1);

    expect(store.removeProject(p.id)).toBe(true);
    expect(store.getProjects()).toHaveLength(0);
  });

  it("recovers from backup file if primary file is corrupted", () => {
    const store1 = new GuiStore(tmpBase);
    store1.addProject("C:/Users/Test/RepoA");

    const projectsFile = join(tmpBase, "pi-studio", "projects.json");
    expect(existsSync(projectsFile)).toBe(true);

    // Update to generate a .bak file
    store1.addProject("C:/Users/Test/RepoB");
    const bakFile = `${projectsFile}.bak`;
    expect(existsSync(bakFile)).toBe(true);

    // Corrupt the primary JSON file
    writeFileSync(projectsFile, "{ MALFORMED JSON !!!", "utf8");

    // Fresh store should recover from .bak
    const store2 = new GuiStore(tmpBase);
    expect(store2.getProjects().length).toBeGreaterThan(0);
    expect(store2.getProjects()[0]?.name).toBe("RepoA");
  });
});
