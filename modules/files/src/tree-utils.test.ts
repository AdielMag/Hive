import { describe, expect, it } from "vitest";
import type { FileTreeNode as TreeNode } from "@hive/module-sdk/renderer";
import { countNodes, filterTree, getFileParentPath, normalizeRelPath } from "./ui/tree-utils.ts";

describe("Files UI tree utilities", () => {
  const sampleTree: TreeNode[] = [
    {
      name: "src",
      path: "/proj/src",
      relativePath: "src",
      isDirectory: true,
      children: [
        {
          name: "index.ts",
          path: "/proj/src/index.ts",
          relativePath: "src/index.ts",
          isDirectory: false,
        },
        {
          name: "ui",
          path: "/proj/src/ui",
          relativePath: "src/ui",
          isDirectory: true,
          children: [
            {
              name: "Button.tsx",
              path: "/proj/src/ui/Button.tsx",
              relativePath: "src/ui/Button.tsx",
              isDirectory: false,
            },
            {
              name: "styles.css",
              path: "/proj/src/ui/styles.css",
              relativePath: "src/ui/styles.css",
              isDirectory: false,
            },
          ],
        },
      ],
    },
    {
      name: "package.json",
      path: "/proj/package.json",
      relativePath: "package.json",
      isDirectory: false,
    },
    {
      name: "README.md",
      path: "/proj/README.md",
      relativePath: "README.md",
      isDirectory: false,
    },
  ];

  it("normalizeRelPath converts backslashes and strips leading slashes", () => {
    expect(normalizeRelPath("src\\ui\\Button.tsx")).toBe("src/ui/Button.tsx");
    expect(normalizeRelPath("/src/index.ts")).toBe("src/index.ts");
  });

  it("getFileParentPath returns parent directory path", () => {
    expect(getFileParentPath("/proj/src/index.ts")).toBe("/proj/src");
    expect(getFileParentPath("C:\\proj\\src\\index.ts")).toBe("C:\\proj\\src");
  });

  it("countNodes counts all nodes recursively", () => {
    expect(countNodes(sampleTree)).toBe(7);
  });

  it("filterTree returns all nodes when query is empty", () => {
    const res = filterTree(sampleTree, "");
    expect(res.nodes.length).toBe(sampleTree.length);
    expect(res.matchCount).toBe(0);
  });

  it("filterTree finds matching file and expands ancestor directories", () => {
    const res = filterTree(sampleTree, "Button");
    expect(res.matchCount).toBe(1);
    expect(res.nodes.length).toBe(1);
    expect(res.nodes[0]!.name).toBe("src");
    expect(res.matchedFolderPaths.has("/proj/src")).toBe(true);
    expect(res.matchedFolderPaths.has("/proj/src/ui")).toBe(true);
    expect(res.nodes[0]!.children![0]!.name).toBe("ui");
    expect(res.nodes[0]!.children![0]!.children![0]!.name).toBe("Button.tsx");
  });

  it("filterTree matches directory names and includes all children", () => {
    const res = filterTree(sampleTree, "ui");
    expect(res.matchCount).toBe(1);
    expect(res.matchedFolderPaths.has("/proj/src")).toBe(true);
    expect(res.matchedFolderPaths.has("/proj/src/ui")).toBe(true);
  });

  it("filterTree returns empty array when no node matches", () => {
    const res = filterTree(sampleTree, "nonexistent");
    expect(res.nodes.length).toBe(0);
    expect(res.matchCount).toBe(0);
  });
});
