/**
 * Pane Layout Store: Tree-based split pane management.
 * Supports horizontal (columns) and vertical (rows) splits, tab reordering,
 * cross-pane tab movement, dynamic resizing, and automatic empty pane pruning.
 */
import { create } from "zustand";
import { getStoredItem, setStoredItem } from "../lib/storage.ts";

export type SplitDirection = "horizontal" | "vertical";

export interface PaneLeaf {
  type: "leaf";
  id: string;
  tabIds: string[];
  activeTabId: string | null;
}

export interface PaneSplit {
  type: "split";
  id: string;
  direction: SplitDirection;
  children: PaneNode[];
  sizes: number[]; // Percentage weights summing to 100
}

export type PaneNode = PaneLeaf | PaneSplit;

export interface DraggingTabState {
  tabId: string;
  sourcePaneId: string;
}

export interface PaneLayoutState {
  root: PaneNode;
  activePaneId: string;
  draggingTab: DraggingTabState | null;

  setDraggingTab: (dragging: DraggingTabState | null) => void;
  setActivePaneId: (paneId: string) => void;
  setActiveTabInPane: (paneId: string, tabId: string) => void;
  reorderTab: (paneId: string, fromIndex: number, toIndex: number) => void;
  moveTab: (tabId: string, targetPaneId: string, targetIndex?: number) => void;
  splitPane: (
    sourceTabId: string,
    targetPaneId: string,
    direction: "left" | "right" | "top" | "bottom",
  ) => void;
  closeTab: (tabId: string) => void;
  resizeSplit: (splitId: string, sizes: number[]) => void;
  syncWithTabs: (validTabIds: string[], activeTabId: string | null) => void;
  resetLayout: (validTabIds: string[], activeTabId: string | null) => void;
}

const STORAGE_KEY = "hive.pane-layout.v2";

export function createPaneId(): string {
  return `pane_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

export function createSplitId(): string {
  return `split_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

export function createDefaultLayout(tabIds: string[] = [], activeTabId: string | null = null): PaneLeaf {
  return {
    type: "leaf",
    id: createPaneId(),
    tabIds: [...tabIds],
    activeTabId: activeTabId ?? (tabIds.length > 0 ? tabIds[0]! : null),
  };
}

export function findLeaf(node: PaneNode, paneId: string): PaneLeaf | null {
  if (node.type === "leaf") {
    return node.id === paneId ? node : null;
  }
  for (const child of node.children) {
    const found = findLeaf(child, paneId);
    if (found) return found;
  }
  return null;
}

export function findLeafForTab(node: PaneNode, tabId: string): PaneLeaf | null {
  if (node.type === "leaf") {
    return node.tabIds.includes(tabId) ? node : null;
  }
  for (const child of node.children) {
    const found = findLeafForTab(child, tabId);
    if (found) return found;
  }
  return null;
}

export function getAllLeaves(node: PaneNode): PaneLeaf[] {
  if (node.type === "leaf") return [node];
  const leaves: PaneLeaf[] = [];
  for (const child of node.children) {
    leaves.push(...getAllLeaves(child));
  }
  return leaves;
}

export function reorderTabInPane(
  node: PaneNode,
  paneId: string,
  fromIndex: number,
  toIndex: number,
): PaneNode {
  if (node.type === "leaf") {
    if (node.id !== paneId) return node;
    const tabIds = [...node.tabIds];
    if (fromIndex < 0 || fromIndex >= tabIds.length) return node;
    const [moved] = tabIds.splice(fromIndex, 1);
    if (!moved) return node;
    const dest = Math.max(0, Math.min(toIndex, tabIds.length));
    tabIds.splice(dest, 0, moved);
    return { ...node, tabIds };
  }
  return {
    ...node,
    children: node.children.map((c) => reorderTabInPane(c, paneId, fromIndex, toIndex)),
  };
}

function removeTabFromNode(node: PaneNode, tabId: string): PaneNode {
  if (node.type === "leaf") {
    if (!node.tabIds.includes(tabId)) return node;
    const idx = node.tabIds.indexOf(tabId);
    const tabIds = node.tabIds.filter((id) => id !== tabId);
    let activeTabId = node.activeTabId;
    if (activeTabId === tabId) {
      if (tabIds.length === 0) {
        activeTabId = null;
      } else {
        const nextIdx = Math.min(idx, tabIds.length - 1);
        activeTabId = tabIds[nextIdx] ?? null;
      }
    }
    return { ...node, tabIds, activeTabId };
  }
  return {
    ...node,
    children: node.children.map((c) => removeTabFromNode(c, tabId)),
  };
}

function pruneEmpty(node: PaneNode): PaneNode | null {
  if (node.type === "leaf") {
    return node.tabIds.length === 0 ? null : node;
  }
  const children: PaneNode[] = [];
  const sizes: number[] = [];
  for (let i = 0; i < node.children.length; i++) {
    const child = pruneEmpty(node.children[i]!);
    if (child) {
      children.push(child);
      sizes.push(node.sizes[i] ?? 100 / node.children.length);
    }
  }
  if (children.length === 0) return null;
  if (children.length === 1) return children[0]!;

  // Normalize sizes
  const total = sizes.reduce((a, b) => a + b, 0);
  const normalized = total > 0 ? sizes.map((s) => (s / total) * 100) : children.map(() => 100 / children.length);

  return {
    ...node,
    children,
    sizes: normalized,
  };
}

export function pruneTree(node: PaneNode): PaneNode {
  const result = pruneEmpty(node);
  if (!result) {
    return createDefaultLayout();
  }
  return result;
}

export function moveTabToPane(
  root: PaneNode,
  tabId: string,
  targetPaneId: string,
  targetIndex?: number,
): PaneNode {
  // First remove tab from wherever it was
  const stripped = removeTabFromNode(root, tabId);
  // Next, insert tab into target pane
  function insert(node: PaneNode): PaneNode {
    if (node.type === "leaf") {
      if (node.id !== targetPaneId) return node;
      const tabIds = [...node.tabIds];
      const idx = targetIndex === undefined ? tabIds.length : Math.max(0, Math.min(targetIndex, tabIds.length));
      tabIds.splice(idx, 0, tabId);
      return { ...node, tabIds, activeTabId: tabId };
    }
    return {
      ...node,
      children: node.children.map(insert),
    };
  }

  const inserted = insert(stripped);
  return pruneTree(inserted);
}

export function splitPane(
  root: PaneNode,
  sourceTabId: string,
  targetPaneId: string,
  direction: "left" | "right" | "top" | "bottom",
): PaneNode {
  // Splitting a pane off its own only tab would just recreate the same layout.
  const target = findLeaf(root, targetPaneId);
  if (target && target.tabIds.length === 1 && target.tabIds[0] === sourceTabId) return root;
  // Remove sourceTabId from its current pane first
  const stripped = removeTabFromNode(root, sourceTabId);

  const newPane: PaneLeaf = {
    type: "leaf",
    id: createPaneId(),
    tabIds: [sourceTabId],
    activeTabId: sourceTabId,
  };

  const splitDirection: SplitDirection = direction === "left" || direction === "right" ? "horizontal" : "vertical";
  const newFirst = direction === "left" || direction === "top";

  function splitTarget(node: PaneNode): PaneNode {
    if (node.type === "leaf") {
      if (node.id !== targetPaneId) return node;
      const children = newFirst ? [newPane, node] : [node, newPane];
      return {
        type: "split",
        id: createSplitId(),
        direction: splitDirection,
        children,
        sizes: [50, 50],
      };
    }
    return {
      ...node,
      children: node.children.map(splitTarget),
    };
  }

  const result = splitTarget(stripped);
  return pruneTree(result);
}

export function closeTabInTree(root: PaneNode, tabId: string): PaneNode {
  const stripped = removeTabFromNode(root, tabId);
  return pruneTree(stripped);
}

export function setActiveTabInPane(root: PaneNode, paneId: string, tabId: string): PaneNode {
  if (root.type === "leaf") {
    if (root.id !== paneId) return root;
    return { ...root, activeTabId: tabId };
  }
  return {
    ...root,
    children: root.children.map((c) => setActiveTabInPane(c, paneId, tabId)),
  };
}

export function resizeSplit(root: PaneNode, splitId: string, sizes: number[]): PaneNode {
  if (root.type === "leaf") return root;
  if (root.id === splitId) {
    return { ...root, sizes: [...sizes] };
  }
  return {
    ...root,
    children: root.children.map((c) => resizeSplit(c, splitId, sizes)),
  };
}

export function syncTreeWithTabs(
  root: PaneNode,
  validTabIds: string[],
  activeTabId: string | null,
  activePaneId?: string | null,
): PaneNode {
  if (validTabIds.length === 0) {
    return root.type === "leaf" && root.tabIds.length === 0 ? root : createDefaultLayout([], null);
  }

  const validSet = new Set(validTabIds);

  // Filter out removed tabs from all leaves
  function filterTabs(node: PaneNode): PaneNode {
    if (node.type === "leaf") {
      const tabIds = node.tabIds.filter((id) => validSet.has(id));
      let curActive = node.activeTabId;
      if (curActive && !tabIds.includes(curActive)) {
        curActive = tabIds.length > 0 ? tabIds[0]! : null;
      }
      return { ...node, tabIds, activeTabId: curActive };
    }
    return {
      ...node,
      children: node.children.map(filterTabs),
    };
  }

  const filtered = pruneTree(filterTabs(root));
  const leaves = getAllLeaves(filtered);
  const presentTabs = new Set<string>();
  for (const leaf of leaves) {
    for (const id of leaf.tabIds) {
      presentTabs.add(id);
    }
  }

  // Find any new tabs not yet in the tree
  const missingTabs = validTabIds.filter((id) => !presentTabs.has(id));
  if (missingTabs.length === 0) {
    // Check if activeTabId is set in active pane
    if (activeTabId && activePaneId) {
      const target = leaves.find((l) => l.id === activePaneId);
      if (target && target.tabIds.includes(activeTabId)) {
        return setActiveTabInPane(filtered, target.id, activeTabId);
      }
    }
    return filtered;
  }

  // Add missing tabs to active pane (or first leaf)
  const targetPane = (activePaneId && leaves.find((l) => l.id === activePaneId)) || leaves[0];
  if (!targetPane) return createDefaultLayout(validTabIds, activeTabId);
  const targetId = targetPane.id;

  function appendToPane(node: PaneNode): PaneNode {
    if (node.type === "leaf") {
      if (node.id !== targetId) return node;
      const tabIds = [...node.tabIds, ...missingTabs];
      return {
        ...node,
        tabIds,
        activeTabId: activeTabId && tabIds.includes(activeTabId) ? activeTabId : node.activeTabId ?? tabIds[0] ?? null,
      };
    }
    return {
      ...node,
      children: node.children.map(appendToPane),
    };
  }

  return appendToPane(filtered);
}

function loadPersistedLayout(): { root: PaneNode; activePaneId: string } | null {
  try {
    const raw = getStoredItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as { root: PaneNode; activePaneId: string };
    if (!data.root || !data.activePaneId) return null;
    return data;
  } catch {
    return null;
  }
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
function persistLayout(root: PaneNode, activePaneId: string) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      setStoredItem(STORAGE_KEY, JSON.stringify({ root, activePaneId }));
    } catch {}
  }, 200);
}

const initialSaved = typeof window !== "undefined" ? loadPersistedLayout() : null;
const defaultInitialRoot = initialSaved?.root ?? createDefaultLayout();
const initialActivePaneId = initialSaved?.activePaneId ?? (defaultInitialRoot.type === "leaf" ? defaultInitialRoot.id : getAllLeaves(defaultInitialRoot)[0]?.id ?? "");

export const usePaneLayoutStore = create<PaneLayoutState>((set, get) => ({
  root: defaultInitialRoot,
  activePaneId: initialActivePaneId,
  draggingTab: null,

  setDraggingTab: (dragging) => set({ draggingTab: dragging }),

  setActivePaneId: (paneId) => {
    set({ activePaneId: paneId });
    persistLayout(get().root, paneId);
  },

  setActiveTabInPane: (paneId, tabId) => {
    const updated = setActiveTabInPane(get().root, paneId, tabId);
    set({ root: updated, activePaneId: paneId });
    persistLayout(updated, paneId);
  },

  reorderTab: (paneId, fromIndex, toIndex) => {
    const updated = reorderTabInPane(get().root, paneId, fromIndex, toIndex);
    set({ root: updated, activePaneId: paneId });
    persistLayout(updated, paneId);
  },

  moveTab: (tabId, targetPaneId, targetIndex) => {
    const updated = moveTabToPane(get().root, tabId, targetPaneId, targetIndex);
    const leaves = getAllLeaves(updated);
    const nextActivePane = leaves.some((l) => l.id === targetPaneId) ? targetPaneId : leaves[0]?.id ?? "";
    set({ root: updated, activePaneId: nextActivePane });
    persistLayout(updated, nextActivePane);
  },

  splitPane: (sourceTabId, targetPaneId, direction) => {
    const updated = splitPane(get().root, sourceTabId, targetPaneId, direction);
    const newLeaf = findLeafForTab(updated, sourceTabId);
    const nextActivePane = newLeaf?.id ?? targetPaneId;
    set({ root: updated, activePaneId: nextActivePane });
    persistLayout(updated, nextActivePane);
  },

  closeTab: (tabId) => {
    const updated = closeTabInTree(get().root, tabId);
    const leaves = getAllLeaves(updated);
    let nextActivePane = get().activePaneId;
    if (!leaves.some((l) => l.id === nextActivePane)) {
      nextActivePane = leaves[0]?.id ?? "";
    }
    set({ root: updated, activePaneId: nextActivePane });
    persistLayout(updated, nextActivePane);
  },

  resizeSplit: (splitId, sizes) => {
    const updated = resizeSplit(get().root, splitId, sizes);
    set({ root: updated });
    persistLayout(updated, get().activePaneId);
  },

  syncWithTabs: (validTabIds, activeTabId) => {
    const updated = syncTreeWithTabs(get().root, validTabIds, activeTabId, get().activePaneId);
    const leaves = getAllLeaves(updated);
    let activePaneId = get().activePaneId;
    if (!leaves.some((l) => l.id === activePaneId)) {
      activePaneId = leaves[0]?.id ?? "";
    }
    // Follow the globally active tab: focus the pane that holds it and make it that pane's visible tab.
    let root = updated;
    const owner = activeTabId ? leaves.find((l) => l.tabIds.includes(activeTabId)) : undefined;
    if (owner) {
      activePaneId = owner.id;
      if (owner.activeTabId !== activeTabId) root = setActiveTabInPane(updated, owner.id, activeTabId!);
    }
    // Skip no-op syncs (tabs array churn from unrelated tab updates) to avoid re-rendering the whole tree.
    if (activePaneId === get().activePaneId && JSON.stringify(root) === JSON.stringify(get().root)) return;
    set({ root, activePaneId });
    persistLayout(root, activePaneId);
  },

  resetLayout: (validTabIds, activeTabId) => {
    const root = createDefaultLayout(validTabIds, activeTabId);
    set({ root, activePaneId: root.id });
    persistLayout(root, root.id);
  },
}));
