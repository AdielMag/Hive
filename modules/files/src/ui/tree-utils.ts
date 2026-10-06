import type { FileTreeNode as TreeNode } from "@hive/module-sdk/renderer";

export interface FilterResult {
  nodes: TreeNode[];
  matchCount: number;
  matchedFolderPaths: Set<string>;
}

export function filterTree(nodes: TreeNode[], query: string): FilterResult {
  const q = query.trim().toLowerCase();
  if (!q) {
    return { nodes, matchCount: 0, matchedFolderPaths: new Set() };
  }

  const matchedFolderPaths = new Set<string>();
  let matchCount = 0;

  function filterNode(node: TreeNode): TreeNode | null {
    const nameMatches = node.name.toLowerCase().includes(q);

    if (node.isDirectory) {
      const filteredChildren: TreeNode[] = [];
      if (node.children) {
        for (const child of node.children) {
          const res = filterNode(child);
          if (res) filteredChildren.push(res);
        }
      }

      if (nameMatches || filteredChildren.length > 0) {
        matchedFolderPaths.add(node.path);
        if (nameMatches) matchCount++;
        return {
          ...node,
          children: filteredChildren,
        };
      }
      return null;
    }

    if (nameMatches) {
      matchCount++;
      return node;
    }

    return null;
  }

  const filtered: TreeNode[] = [];
  for (const node of nodes) {
    const res = filterNode(node);
    if (res) filtered.push(res);
  }

  return { nodes: filtered, matchCount, matchedFolderPaths };
}

export function normalizeRelPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+/, "");
}

export function getFileParentPath(path: string): string {
  return path.replace(/[/\\][^/\\]*$/, "");
}

export function countNodes(nodes: TreeNode[]): number {
  let count = 0;
  function walk(items: TreeNode[]) {
    for (const item of items) {
      count++;
      if (item.children) walk(item.children);
    }
  }
  walk(nodes);
  return count;
}
