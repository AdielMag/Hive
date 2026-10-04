import { describe, it, expect } from "vitest";
import {
  createDefaultLayout,
  findLeaf,
  findLeafForTab,
  getAllLeaves,
  reorderTabInPane,
  moveTabToPane,
  splitPane,
  closeTabInTree,
  syncTreeWithTabs,
  resizeSplit,
  type PaneLeaf,
  type PaneSplit,
} from "./pane-layout-store.ts";

describe("pane-layout-store tree operations", () => {
  it("creates a default single leaf layout with given tabs", () => {
    const root = createDefaultLayout(["tab1", "tab2"], "tab1");
    expect(root.type).toBe("leaf");
    if (root.type === "leaf") {
      expect(root.tabIds).toEqual(["tab1", "tab2"]);
      expect(root.activeTabId).toBe("tab1");
    }
  });

  it("finds leaf by pane ID", () => {
    const root = createDefaultLayout(["tab1"], "tab1");
    const leaf = findLeaf(root, root.id);
    expect(leaf).not.toBeNull();
    expect(leaf?.id).toBe(root.id);
  });

  it("finds leaf by tab ID", () => {
    const root = createDefaultLayout(["tab1", "tab2"], "tab1");
    const leaf = findLeafForTab(root, "tab2");
    expect(leaf).not.toBeNull();
    expect(leaf?.id).toBe(root.id);
  });

  it("reorders tabs within a pane", () => {
    const root = createDefaultLayout(["tab1", "tab2", "tab3"], "tab1") as PaneLeaf;
    const updated = reorderTabInPane(root, root.id, 2, 0); // move tab3 to front
    expect(updated.type).toBe("leaf");
    if (updated.type === "leaf") {
      expect(updated.tabIds).toEqual(["tab3", "tab1", "tab2"]);
    }
  });

  it("splits a pane horizontally (right)", () => {
    const root = createDefaultLayout(["tab1", "tab2"], "tab1") as PaneLeaf;
    const splitTree = splitPane(root, "tab2", root.id, "right");
    expect(splitTree.type).toBe("split");
    if (splitTree.type === "split") {
      expect(splitTree.direction).toBe("horizontal");
      expect(splitTree.children.length).toBe(2);
      const [left, right] = splitTree.children as [PaneLeaf, PaneLeaf];
      expect(left.tabIds).toEqual(["tab1"]);
      expect(right.tabIds).toEqual(["tab2"]);
      expect(right.activeTabId).toBe("tab2");
    }
  });

  it("splits a pane vertically (bottom)", () => {
    const root = createDefaultLayout(["tab1", "tab2"], "tab1") as PaneLeaf;
    const splitTree = splitPane(root, "tab2", root.id, "bottom");
    expect(splitTree.type).toBe("split");
    if (splitTree.type === "split") {
      expect(splitTree.direction).toBe("vertical");
      expect(splitTree.children.length).toBe(2);
      const [top, bottom] = splitTree.children as [PaneLeaf, PaneLeaf];
      expect(top.tabIds).toEqual(["tab1"]);
      expect(bottom.tabIds).toEqual(["tab2"]);
    }
  });

  it("splits a pane on the left or top placing new pane first", () => {
    const root = createDefaultLayout(["tab1", "tab2"], "tab1") as PaneLeaf;
    const splitTree = splitPane(root, "tab2", root.id, "left");
    expect(splitTree.type).toBe("split");
    if (splitTree.type === "split") {
      expect(splitTree.direction).toBe("horizontal");
      const [left, right] = splitTree.children as [PaneLeaf, PaneLeaf];
      expect(left.tabIds).toEqual(["tab2"]);
      expect(right.tabIds).toEqual(["tab1"]);
    }
  });

  it("moves a tab from one pane to another", () => {
    const root = createDefaultLayout(["tab1", "tab2"], "tab1") as PaneLeaf;
    const splitTree = splitPane(root, "tab2", root.id, "right") as PaneSplit;
    const [, rightPane] = splitTree.children as [PaneLeaf, PaneLeaf];

    // Move tab1 into rightPane at index 0
    const moved = moveTabToPane(splitTree, "tab1", rightPane.id, 0);
    // leftPane is now empty, so it should be pruned and rightPane becomes the root!
    expect(moved.type).toBe("leaf");
    if (moved.type === "leaf") {
      expect(moved.tabIds).toEqual(["tab1", "tab2"]);
      expect(moved.activeTabId).toBe("tab1");
    }
  });

  it("closes a tab and selects adjacent tab", () => {
    const root = createDefaultLayout(["tab1", "tab2", "tab3"], "tab2") as PaneLeaf;
    const updated = closeTabInTree(root, "tab2");
    expect(updated.type).toBe("leaf");
    if (updated.type === "leaf") {
      expect(updated.tabIds).toEqual(["tab1", "tab3"]);
      expect(updated.activeTabId).toBe("tab3");
    }
  });

  it("prunes empty pane when its last tab is closed in a split", () => {
    const root = createDefaultLayout(["tab1", "tab2"], "tab1") as PaneLeaf;
    const splitTree = splitPane(root, "tab2", root.id, "right") as PaneSplit;
    const updated = closeTabInTree(splitTree, "tab2");
    // Empty pane pruned; single remaining child collapsed to root leaf
    expect(updated.type).toBe("leaf");
    if (updated.type === "leaf") {
      expect(updated.tabIds).toEqual(["tab1"]);
    }
  });

  it("synchronizes tree with valid tabs from outside", () => {
    const root = createDefaultLayout(["tab1", "tab2"], "tab1") as PaneLeaf;
    // Outside removed tab2 and added tab3
    const synced = syncTreeWithTabs(root, ["tab1", "tab3"], "tab3", root.id);
    expect(synced.type).toBe("leaf");
    if (synced.type === "leaf") {
      expect(synced.tabIds).toEqual(["tab1", "tab3"]);
      expect(synced.activeTabId).toBe("tab3");
    }
  });

  it("resizes split container sizes", () => {
    const root = createDefaultLayout(["tab1", "tab2"], "tab1") as PaneLeaf;
    const splitTree = splitPane(root, "tab2", root.id, "right") as PaneSplit;
    const resized = resizeSplit(splitTree, splitTree.id, [30, 70]);
    if (resized.type === "split") {
      expect(resized.sizes).toEqual([30, 70]);
    }
  });

  it("does not split a pane off its own only tab", () => {
    const root = createDefaultLayout(["tab1"], "tab1") as PaneLeaf;
    expect(splitPane(root, "tab1", root.id, "right")).toBe(root);
  });

  it("keeps order of remaining tabs when moving a tab between panes", () => {
    const root = createDefaultLayout(["a", "b", "c"], "a") as PaneLeaf;
    const split = splitPane(root, "c", root.id, "right") as PaneSplit;
    const [left, right] = split.children as [PaneLeaf, PaneLeaf];
    const moved = moveTabToPane(split, "a", right.id, 0) as PaneSplit;
    const leaves = getAllLeaves(moved);
    expect(leaves.map((l) => l.tabIds)).toEqual([["b"], ["a", "c"]]);
    expect(left.id).toBe(leaves[0]!.id);
  });
});
