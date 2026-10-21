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

export interface ProjectLayout {
  root: PaneNode;
  activePaneId: string;
}

export interface PaneLayoutState {
  root: PaneNode;
  activePaneId: string;
  currentProjectId: string | null;
  layoutsByProject: Record<string, ProjectLayout>;
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
  syncWithTabs: (validTabIds: string[], activeTabId: string | null, projectId?: string | null) => void;
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

function loadPersistedLayout(): {
  root: PaneNode;
  activePaneId: string;
  currentProjectId: string | null;
  layoutsByProject: Record<string, ProjectLayout>;
} | null {
  try {
    const raw = getStoredItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as any;
    if (data.layoutsByProject && typeof data.layoutsByProject === "object") {
      return {
        root: data.root,
        activePaneId: data.activePaneId,
        currentProjectId: data.currentProjectId ?? null,
        layoutsByProject: data.layoutsByProject,
      };
    }
    if (data.root && data.activePaneId) {
      return {
        root: data.root,
        activePaneId: data.activePaneId,
        currentProjectId: null,
        layoutsByProject: { __default__: { root: data.root, activePaneId: data.activePaneId } },
      };
    }
    return null;
  } catch {
    return null;
  }
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
function persistLayout(
  root: PaneNode,
  activePaneId: string,
  currentProjectId: string | null,
  layoutsByProject: Record<string, ProjectLayout>,
) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      setStoredItem(
        STORAGE_KEY,
        JSON.stringify({ root, activePaneId, currentProjectId, layoutsByProject }),
      );
    } catch {}
  }, 200);
}

const initialSaved = typeof window !== "undefined" ? loadPersistedLayout() : null;
const defaultInitialRoot = initialSaved?.root ?? createDefaultLayout();
const initialActivePaneId = initialSaved?.activePaneId ?? (defaultInitialRoot.type === "leaf" ? defaultInitialRoot.id : getAllLeaves(defaultInitialRoot)[0]?.id ?? "");
const initialCurrentProjectId = initialSaved?.currentProjectId ?? null;
const initialLayoutsByProject: Record<string, ProjectLayout> = initialSaved?.layoutsByProject ?? {
  [initialCurrentProjectId ?? "__default__"]: { root: defaultInitialRoot, activePaneId: initialActivePaneId },
};

export const usePaneLayoutStore = create<PaneLayoutState>((set, get) => ({
  root: defaultInitialRoot,
  activePaneId: initialActivePaneId,
  currentProjectId: initialCurrentProjectId,
  layoutsByProject: initialLayoutsByProject,
  draggingTab: null,

  setDraggingTab: (dragging) => set({ draggingTab: dragging }),

  setActivePaneId: (paneId) => {
    const currentKey = get().currentProjectId ?? "__default__";
    const updatedLayouts = { ...get().layoutsByProject, [currentKey]: { root: get().root, activePaneId: paneId } };
    set({ activePaneId: paneId, layoutsByProject: updatedLayouts });
    persistLayout(get().root, paneId, get().currentProjectId, updatedLayouts);
  },

  setActiveTabInPane: (paneId, tabId) => {
    const updated = setActiveTabInPane(get().root, paneId, tabId);
    const currentKey = get().currentProjectId ?? "__default__";
    const updatedLayouts = { ...get().layoutsByProject, [currentKey]: { root: updated, activePaneId: paneId } };
    set({ root: updated, activePaneId: paneId, layoutsByProject: updatedLayouts });
    persistLayout(updated, paneId, get().currentProjectId, updatedLayouts);
  },

  reorderTab: (paneId, fromIndex, toIndex) => {
    const updated = reorderTabInPane(get().root, paneId, fromIndex, toIndex);
    const currentKey = get().currentProjectId ?? "__default__";
    const updatedLayouts = { ...get().layoutsByProject, [currentKey]: { root: updated, activePaneId: paneId } };
    set({ root: updated, activePaneId: paneId, layoutsByProject: updatedLayouts });
    persistLayout(updated, paneId, get().currentProjectId, updatedLayouts);
  },

  moveTab: (tabId, targetPaneId, targetIndex) => {
    const updated = moveTabToPane(get().root, tabId, targetPaneId, targetIndex);
    const leaves = getAllLeaves(updated);
    const nextActivePane = leaves.some((l) => l.id === targetPaneId) ? targetPaneId : leaves[0]?.id ?? "";
    const currentKey = get().currentProjectId ?? "__default__";
    const updatedLayouts = { ...get().layoutsByProject, [currentKey]: { root: updated, activePaneId: nextActivePane } };
    set({ root: updated, activePaneId: nextActivePane, layoutsByProject: updatedLayouts });
    persistLayout(updated, nextActivePane, get().currentProjectId, updatedLayouts);
  },

  splitPane: (sourceTabId, targetPaneId, direction) => {
    const updated = splitPane(get().root, sourceTabId, targetPaneId, direction);
    const newLeaf = findLeafForTab(updated, sourceTabId);
    const nextActivePane = newLeaf?.id ?? targetPaneId;
    const currentKey = get().currentProjectId ?? "__default__";
    const updatedLayouts = { ...get().layoutsByProject, [currentKey]: { root: updated, activePaneId: nextActivePane } };
    set({ root: updated, activePaneId: nextActivePane, layoutsByProject: updatedLayouts });
    persistLayout(updated, nextActivePane, get().currentProjectId, updatedLayouts);
  },

  closeTab: (tabId) => {
    const updated = closeTabInTree(get().root, tabId);
    const leaves = getAllLeaves(updated);
    let nextActivePane = get().activePaneId;
    if (!leaves.some((l) => l.id === nextActivePane)) {
      nextActivePane = leaves[0]?.id ?? "";
    }
    const currentKey = get().currentProjectId ?? "__default__";
    const updatedLayouts = { ...get().layoutsByProject, [currentKey]: { root: updated, activePaneId: nextActivePane } };
    set({ root: updated, activePaneId: nextActivePane, layoutsByProject: updatedLayouts });
    persistLayout(updated, nextActivePane, get().currentProjectId, updatedLayouts);
  },

  resizeSplit: (splitId, sizes) => {
    const updated = resizeSplit(get().root, splitId, sizes);
    const currentKey = get().currentProjectId ?? "__default__";
    const updatedLayouts = { ...get().layoutsByProject, [currentKey]: { root: updated, activePaneId: get().activePaneId } };
    set({ root: updated, layoutsByProject: updatedLayouts });
    persistLayout(updated, get().activePaneId, get().currentProjectId, updatedLayouts);
  },

  syncWithTabs: (validTabIds, activeTabId, projectId) => {
    const targetProject = projectId !== undefined ? projectId : get().currentProjectId;
    const projectChanged = targetProject !== get().currentProjectId;
    const layoutsByProject = { ...get().layoutsByProject };

    let currentRoot = get().root;
    let currentActivePane = get().activePaneId;

    if (projectChanged) {
      // Save outgoing project layout
      const outgoingKey = get().currentProjectId ?? "__default__";
      layoutsByProject[outgoingKey] = { root: currentRoot, activePaneId: currentActivePane };

      // Restore incoming project layout if available, or inherit from __default__ on first project switch, or create default
      const incomingKey = targetProject ?? "__default__";
      let existing = layoutsByProject[incomingKey];
      if (!existing && outgoingKey === "__default__" && layoutsByProject["__default__"]) {
        existing = layoutsByProject["__default__"];
      }
      if (existing) {
        currentRoot = existing.root;
        currentActivePane = existing.activePaneId;
      } else {
        const fresh = createDefaultLayout(validTabIds, activeTabId);
        currentRoot = fresh;
        currentActivePane = fresh.id;
      }
    }

    const updated = syncTreeWithTabs(currentRoot, validTabIds, activeTabId, currentActivePane);
    const leaves = getAllLeaves(updated);
    let activePaneId = currentActivePane;
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

    const nextProjectKey = targetProject ?? "__default__";
    layoutsByProject[nextProjectKey] = { root, activePaneId };

    // Skip no-op syncs to avoid re-rendering
    if (
      !projectChanged &&
      activePaneId === get().activePaneId &&
      JSON.stringify(root) === JSON.stringify(get().root)
    ) {
      return;
    }

    set({ root, activePaneId, currentProjectId: targetProject, layoutsByProject });
    persistLayout(root, activePaneId, targetProject, layoutsByProject);
  },

  resetLayout: (validTabIds, activeTabId) => {
    const root = createDefaultLayout(validTabIds, activeTabId);
    const currentKey = get().currentProjectId ?? "__default__";
    const updatedLayouts = { ...get().layoutsByProject, [currentKey]: { root, activePaneId: root.id } };
    set({ root, activePaneId: root.id, layoutsByProject: updatedLayouts });
    persistLayout(root, root.id, get().currentProjectId, updatedLayouts);
  },
}));
