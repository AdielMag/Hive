import { describe, expect, it, vi, beforeEach } from "vitest";
import { isFilePath, parseFilePath, openFileInTab, renderTextWithFileLinks } from "./file-links.tsx";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useSessionStore } from "../store/session-store.ts";
import { COMMANDS_BY_ID } from "../features/commands/registry.ts";

describe("isFilePath", () => {
  it("identifies valid relative and absolute file paths", () => {
    expect(isFilePath("apps/desktop/src/renderer/App.tsx")).toBe(true);
    expect(isFilePath("./package.json")).toBe(true);
    expect(isFilePath("../modules/git/src/service.ts")).toBe(true);
    expect(isFilePath("/usr/local/bin/hive.sh")).toBe(true);
    expect(isFilePath("C:\\Users\\test\\Documents\\file.txt")).toBe(true);
    expect(isFilePath("C:/Users/test/Documents/file.txt")).toBe(true);
  });

  it("handles paths with line and column numbers", () => {
    expect(isFilePath("src/renderer/App.tsx:42")).toBe(true);
    expect(isFilePath("src/renderer/App.tsx:42:15")).toBe(true);
    expect(isFilePath("src/renderer/App.tsx#L42")).toBe(true);
  });

  it("identifies known filenames and dotfiles", () => {
    expect(isFilePath("package.json")).toBe(true);
    expect(isFilePath("tsconfig.json")).toBe(true);
    expect(isFilePath("Dockerfile")).toBe(true);
    expect(isFilePath("Makefile")).toBe(true);
    expect(isFilePath(".gitignore")).toBe(true);
    expect(isFilePath(".env")).toBe(true);
    expect(isFilePath(".env.example")).toBe(true);
    expect(isFilePath("README.md")).toBe(true);
  });

  it("rejects non-file-path strings", () => {
    expect(isFilePath("https://github.com/AdielMag/Hive")).toBe(false);
    expect(isFilePath("http://localhost:3000")).toBe(false);
    expect(isFilePath("mailto:test@example.com")).toBe(false);
    expect(isFilePath("v1.2.3")).toBe(false);
    expect(isFilePath("3.14")).toBe(false);
    expect(isFilePath("model.name")).toBe(false);
    expect(isFilePath("hello world")).toBe(false);
    expect(isFilePath("Node.js")).toBe(false);
    expect(isFilePath("Next.js")).toBe(false);
    expect(isFilePath("")).toBe(false);
    expect(isFilePath(null)).toBe(false);
  });
});

describe("parseFilePath", () => {
  it("strips quotes and whitespace", () => {
    expect(parseFilePath('  "src/index.ts"  ')).toEqual({ path: "src/index.ts", line: undefined, column: undefined });
    expect(parseFilePath("`src/index.ts`")).toEqual({ path: "src/index.ts", line: undefined, column: undefined });
    expect(parseFilePath("'src/index.ts'")).toEqual({ path: "src/index.ts", line: undefined, column: undefined });
  });

  it("extracts line and column numbers", () => {
    expect(parseFilePath("src/renderer/App.tsx:42")).toEqual({ path: "src/renderer/App.tsx", line: 42, column: undefined });
    expect(parseFilePath("src/renderer/App.tsx:42:15")).toEqual({ path: "src/renderer/App.tsx", line: 42, column: 15 });
    expect(parseFilePath("src/renderer/App.tsx#L99")).toEqual({ path: "src/renderer/App.tsx", line: 99, column: undefined });
  });

  it("strips file:// protocol", () => {
    expect(parseFilePath("file:///Users/test/file.ts")).toEqual({ path: "/Users/test/file.ts", line: undefined, column: undefined });
    expect(parseFilePath("file://C:/Users/test/file.ts")).toEqual({ path: "C:/Users/test/file.ts", line: undefined, column: undefined });
  });
});

describe("openFileInTab", () => {
  beforeEach(() => {
    useSessionStore.setState({
      activeProject: {
        id: "proj_1",
        name: "TestProject",
        path: "C:/Projects/TestApp",
        color: "blue",
        pinned: false,
        hidden: false,
        links: [],
        defaults: {},
        createdAt: "2024-01-01",
        updatedAt: "2024-01-01",
      },
    });
  });

  it("resolves relative path against active project and calls file.open command", async () => {
    const runMock = vi.fn();
    (COMMANDS_BY_ID as Map<string, any>).set("file.open", { id: "file.open", run: runMock });

    await openFileInTab("src/renderer/App.tsx:42");

    expect(runMock).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "C:/Projects/TestApp/src/renderer/App.tsx",
        projectId: "proj_1",
        name: "App.tsx",
        line: 42,
      }),
    );
  });

  it("leaves absolute paths as-is", async () => {
    const runMock = vi.fn();
    (COMMANDS_BY_ID as Map<string, any>).set("file.open", { id: "file.open", run: runMock });

    await openFileInTab("D:/OtherProject/file.ts");

    expect(runMock).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "D:/OtherProject/file.ts",
        name: "file.ts",
      }),
    );
  });
});

describe("renderTextWithFileLinks", () => {
  it("leaves text without file paths unchanged", () => {
    expect(renderTextWithFileLinks("Hello world")).toBe("Hello world");
  });

  it("wraps file paths with clickable elements", () => {
    const res = renderTextWithFileLinks("Check src/renderer/App.tsx for details");
    expect(React.isValidElement(res)).toBe(true);
    const html = renderToStaticMarkup(res as React.ReactElement);
    expect(html).toContain("md-code-file");
    expect(html).toContain("src/renderer/App.tsx");
  });

  it("does not wrap URLs or tech names", () => {
    const res = renderTextWithFileLinks("Visit https://example.com/file.ts and use Node.js");
    const html = renderToStaticMarkup(React.createElement("span", null, res));
    expect(html).not.toContain("md-code-file");
  });

  it("handles long tokens quickly", () => {
    const long = "a".repeat(30000);
    const start = performance.now();
    renderTextWithFileLinks(long);
    expect(performance.now() - start).toBeLessThan(50);
  });
});
