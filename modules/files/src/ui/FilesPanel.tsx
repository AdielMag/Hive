import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronsDownUp,
  Copy,
  Edit2,
  FilePlus,
  FolderOpen,
  FolderPlus,
  Play,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import type { FileTreeNode as TreeNode, ModuleHost } from "@hive/module-sdk/renderer";
import { FILE_OPEN_COMMAND, type FileOpenArgs } from "@hive-module/diff-viewer/shared";
import type { GitRepoStatus, GitFileStatus } from "@hive-module/git/shared";
import { FileMethods, type FileOperationResult } from "../shared.ts";
import { ConfirmModal } from "./ConfirmModal.tsx";
import { ContextMenu, type ContextMenuItem } from "./ContextMenu.tsx";
import { FileTreeNodeItem, type GitStatusType } from "./FileTreeNode.tsx";
import { NewItemInput } from "./NewItemInput.tsx";
import { filterTree, getFileParentPath, normalizeRelPath } from "./tree-utils.ts";

interface ContextMenuState {
  x: number;
  y: number;
  node: TreeNode | null;
}

interface CreatingState {
  parentPath: string;
  isDirectory: boolean;
  depth: number;
}

export const FilesPanel: React.FC<{ host: ModuleHost }> = ({ host }) => {
  const { project: activeProject } = host.hooks.useActiveSession();
  const [files, setFiles] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const [gitStatuses, setGitStatuses] = useState<Record<string, GitStatusType>>({});
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [creating, setCreating] = useState<CreatingState | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [deletingNode, setDeletingNode] = useState<TreeNode | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Load Git status
  const loadGitStatus = useCallback(async () => {
    if (!activeProject?.path) return;
    try {
      const status = await host.ipc.invokeOf<GitRepoStatus>("git", "status", activeProject.path);
      if (!status || !status.isRepo) {
        setGitStatuses({});
        return;
      }
      const map: Record<string, GitStatusType> = {};
      const record = (list: GitFileStatus[] | undefined) => {
        if (!list) return;
        for (const f of list) {
          if (f.path) {
            map[normalizeRelPath(f.path)] = f.status;
          }
        }
      };
      record(status.staged);
      record(status.unstaged);
      record(status.untracked);
      setGitStatuses(map);
    } catch {
      setGitStatuses({});
    }
  }, [activeProject?.path, host.ipc]);

  // Load files tree
  const loadFiles = useCallback(async () => {
    if (!activeProject?.path) return;
    setLoading(true);
    try {
      const tree = await host.files.list(activeProject.path);
      setFiles(tree);
      void loadGitStatus();
    } catch (e) {
      console.error("Failed to load files", e);
    } finally {
      setLoading(false);
    }
  }, [activeProject?.path, host.files, loadGitStatus]);

  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);

  // Track active tab
  useEffect(() => {
    const updateActiveTab = () => {
      const active = host.tabs.active();
      if (!active) {
        setActiveFilePath(null);
        return;
      }
      const p = (active.data as { path?: string } | undefined)?.path || (active.id.startsWith("file:") ? active.id.slice(5) : null);
      setActiveFilePath(p);
    };

    updateActiveTab();
    const unsub = host.tabs.onChange(updateActiveTab);
    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, [host.tabs]);

  // Focus search input when opened
  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [searchOpen]);

  // Toggle folder expansion
  const toggleFolder = useCallback((path: string) => {
    setExpanded((s) => ({ ...s, [path]: !(s[path] ?? false) }));
  }, []);

  // Collapse all folders
  const handleCollapseAll = useCallback(() => {
    setExpanded({});
  }, []);

  // Open file in viewer
  const handleOpenFile = useCallback(
    (file: TreeNode) => {
      if (!activeProject) return;
      const args: FileOpenArgs = {
        path: file.path,
        projectId: activeProject.id,
        name: file.name || file.relativePath,
      };
      void host.commands.run(FILE_OPEN_COMMAND, args);
    },
    [activeProject, host.commands],
  );

  // Filtered tree calculation
  const { filteredFiles, matchCount, matchedFolderPaths } = useMemo(() => {
    const res = filterTree(files, searchQuery);
    return {
      filteredFiles: res.nodes,
      matchCount: res.matchCount,
      matchedFolderPaths: res.matchedFolderPaths,
    };
  }, [files, searchQuery]);

  // Compute effective expanded map (includes auto-expanded folders during search)
  const effectiveExpanded = useMemo(() => {
    if (!searchQuery.trim()) return expanded;
    const merged = { ...expanded };
    for (const p of matchedFolderPaths) {
      merged[p] = true;
    }
    return merged;
  }, [expanded, matchedFolderPaths, searchQuery]);

  // Create file/folder submission
  const handleCreateSubmit = useCallback(
    async (name: string) => {
      if (!activeProject || !creating) return;
      const targetPath = `${creating.parentPath}/${name}`.replace(/[\\/]+/g, "/");
      const method = creating.isDirectory ? FileMethods.createDirectory : FileMethods.createFile;

      try {
        const res = await host.ipc.invoke<FileOperationResult>(method, {
          rootPath: activeProject.path,
          targetPath,
        });

        if (res.ok) {
          // If created directory, auto-expand it
          if (creating.isDirectory) {
            setExpanded((s) => ({ ...s, [creating.parentPath]: true, [targetPath]: true }));
          } else {
            setExpanded((s) => ({ ...s, [creating.parentPath]: true }));
            // Auto open the newly created file
            void host.commands.run(FILE_OPEN_COMMAND, {
              path: targetPath,
              projectId: activeProject.id,
              name,
            });
          }
          await loadFiles();
        } else {
          console.error("Create failed:", res.error);
        }
      } catch (err) {
        console.error("Failed to create item", err);
      } finally {
        setCreating(null);
      }
    },
    [activeProject, creating, host.commands, host.ipc, loadFiles],
  );

  // Rename item submission
  const handleRenameSubmit = useCallback(
    async (node: TreeNode, newName: string) => {
      if (!activeProject) return;
      const parentDir = getFileParentPath(node.path);
      const newPath = `${parentDir}/${newName}`.replace(/[\\/]+/g, "/");

      try {
        const res = await host.ipc.invoke<FileOperationResult>(FileMethods.rename, {
          rootPath: activeProject.path,
          oldPath: node.path,
          newPath,
        });

        if (res.ok) {
          await loadFiles();
        } else {
          console.error("Rename failed:", res.error);
        }
      } catch (err) {
        console.error("Failed to rename item", err);
      } finally {
        setRenamingPath(null);
      }
    },
    [activeProject, host.ipc, loadFiles],
  );

  // Delete item submission
  const handleDeleteConfirm = useCallback(async () => {
    if (!activeProject || !deletingNode) return;
    try {
      const res = await host.ipc.invoke<FileOperationResult>(FileMethods.delete, {
        rootPath: activeProject.path,
        targetPath: deletingNode.path,
        useTrash: true,
      });

      if (res.ok) {
        await loadFiles();
      } else {
        console.error("Delete failed:", res.error);
      }
    } catch (err) {
      console.error("Failed to delete item", err);
    } finally {
      setDeletingNode(null);
    }
  }, [activeProject, deletingNode, host.ipc, loadFiles]);

  // Context Menu handlers
  const handleContextMenu = useCallback((e: React.MouseEvent, node: TreeNode | null) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, node });
  }, []);

  const handlePanelContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, node: null });
  }, []);

  // Runnable check for context menu
  const isRunnableNode = (node: TreeNode) => {
    if (node.isDirectory) return false;
    const ext = node.name.slice(node.name.lastIndexOf(".")).toLowerCase();
    return host.commands.has("terminal.run") && [".py", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".sh", ".bash", ".ps1"].includes(ext);
  };

  const handleRunFile = async (node: TreeNode) => {
    const ext = node.name.slice(node.name.lastIndexOf(".")).toLowerCase();
    let cmd = "";
    if (ext === ".py") cmd = `python "${node.path}"`;
    else if ([".js", ".mjs", ".cjs"].includes(ext)) cmd = `node "${node.path}"`;
    else if ([".ts", ".tsx"].includes(ext)) cmd = `npx tsx "${node.path}"`;
    else if ([".sh", ".bash"].includes(ext)) cmd = `bash "${node.path}"`;
    else if (ext === ".ps1") cmd = `powershell -NoProfile -File "${node.path}"`;
    if (!cmd) return;

    const cwd = getFileParentPath(node.path);
    await host.commands.run("terminal.run", { command: cmd, cwd });
  };

  const contextMenuItems: ContextMenuItem[] = useMemo(() => {
    if (!activeProject) return [];
    const node = contextMenu?.node;

    if (!node) {
      // Background click
      return [
        {
          label: "New File...",
          icon: <FilePlus size={13} />,
          onClick: () => {
            setCreating({ parentPath: activeProject.path, isDirectory: false, depth: 0 });
          },
        },
        {
          label: "New Folder...",
          icon: <FolderPlus size={13} />,
          onClick: () => {
            setCreating({ parentPath: activeProject.path, isDirectory: true, depth: 0 });
          },
        },
        { separator: true, label: "" },
        {
          label: "Refresh Files",
          icon: <RefreshCw size={13} />,
          shortcut: "Ctrl+R",
          onClick: loadFiles,
        },
        {
          label: "Collapse All Folders",
          icon: <ChevronsDownUp size={13} />,
          onClick: handleCollapseAll,
        },
      ];
    }

    const items: ContextMenuItem[] = [];

    if (!node.isDirectory) {
      items.push({
        label: "Open File",
        onClick: () => handleOpenFile(node),
      });

      if (isRunnableNode(node)) {
        items.push({
          label: "Run in Terminal",
          icon: <Play size={13} />,
          onClick: () => void handleRunFile(node),
        });
      }
      items.push({ separator: true, label: "" });
    } else {
      items.push(
        {
          label: "New File in Folder...",
          icon: <FilePlus size={13} />,
          onClick: () => {
            setExpanded((s) => ({ ...s, [node.path]: true }));
            setCreating({ parentPath: node.path, isDirectory: false, depth: 1 });
          },
        },
        {
          label: "New Folder in Folder...",
          icon: <FolderPlus size={13} />,
          onClick: () => {
            setExpanded((s) => ({ ...s, [node.path]: true }));
            setCreating({ parentPath: node.path, isDirectory: true, depth: 1 });
          },
        },
        { separator: true, label: "" },
      );
    }

    items.push(
      {
        label: "Copy Relative Path",
        icon: <Copy size={13} />,
        onClick: () => {
          const rel = normalizeRelPath(node.relativePath || node.name);
          void host.clipboard.copy(rel);
        },
      },
      {
        label: "Copy Full Path",
        icon: <Copy size={13} />,
        onClick: () => {
          void host.clipboard.copy(node.path);
        },
      },
      {
        label: "Copy File Name",
        onClick: () => {
          void host.clipboard.copy(node.name);
        },
      },
      { separator: true, label: "" },
      {
        label: "Show in Folder",
        icon: <FolderOpen size={13} />,
        onClick: () => {
          if (host.files.showInFolder) {
            void host.files.showInFolder(node.path);
          } else {
            void host.ipc.invoke(FileMethods.revealInExplorer, {
              rootPath: activeProject.path,
              targetPath: node.path,
            });
          }
        },
      },
      { separator: true, label: "" },
      {
        label: "Rename",
        icon: <Edit2 size={13} />,
        shortcut: "F2",
        onClick: () => setRenamingPath(node.path),
      },
      {
        label: "Delete",
        icon: <Trash2 size={13} />,
        danger: true,
        shortcut: "Del",
        onClick: () => setDeletingNode(node),
      },
    );

    return items;
  }, [
    activeProject,
    contextMenu?.node,
    handleCollapseAll,
    handleOpenFile,
    host.clipboard,
    host.ipc,
    loadFiles,
  ]);

  if (!activeProject) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          padding: 24,
          textAlign: "center",
          color: "var(--text-muted)",
          fontSize: 12,
        }}
      >
        <span style={{ fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 }}>
          No project open
        </span>
        <span>Open a workspace or project to view files.</span>
      </div>
    );
  }

  const projectName = activeProject.name || activeProject.path.split(/[/\\]/).pop() || "WORKSPACE";

  return (
    <div
      ref={panelRef}
      onContextMenu={handlePanelContextMenu}
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        padding: "8px 10px",
        fontSize: 12,
        userSelect: "none",
        position: "relative",
      }}
    >
      {/* Header Toolbar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
          gap: 6,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6, overflow: "hidden" }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "var(--text-muted)",
              letterSpacing: "0.05em",
            }}
          >
            FILES
          </span>
          <span
            style={{
              fontSize: 10,
              padding: "1px 5px",
              borderRadius: 3,
              backgroundColor: "var(--bg-surface)",
              color: "var(--text-secondary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: 110,
            }}
            title={activeProject.path}
          >
            {projectName}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          {/* New File */}
          <button
            onClick={() => {
              setCreating({ parentPath: activeProject.path, isDirectory: false, depth: 0 });
            }}
            title="New File"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              padding: 4,
              borderRadius: 3,
              display: "flex",
              alignItems: "center",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
          >
            <FilePlus size={13} />
          </button>

          {/* New Folder */}
          <button
            onClick={() => {
              setCreating({ parentPath: activeProject.path, isDirectory: true, depth: 0 });
            }}
            title="New Folder"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              padding: 4,
              borderRadius: 3,
              display: "flex",
              alignItems: "center",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
          >
            <FolderPlus size={13} />
          </button>

          {/* Toggle Search */}
          <button
            onClick={() => {
              setSearchOpen((v) => !v);
              if (searchOpen) setSearchQuery("");
            }}
            title="Filter files (Search)"
            style={{
              background: searchOpen ? "var(--bg-card-hover)" : "transparent",
              border: "none",
              color: searchOpen ? "var(--accent-base)" : "var(--text-muted)",
              cursor: "pointer",
              padding: 4,
              borderRadius: 3,
              display: "flex",
              alignItems: "center",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
            onMouseLeave={(e) =>
              (e.currentTarget.style.color = searchOpen
                ? "var(--accent-base)"
                : "var(--text-muted)")
            }
          >
            <Search size={13} />
          </button>

          {/* Collapse All */}
          <button
            onClick={handleCollapseAll}
            title="Collapse all folders"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              padding: 4,
              borderRadius: 3,
              display: "flex",
              alignItems: "center",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
          >
            <ChevronsDownUp size={13} />
          </button>

          {/* Refresh */}
          <button
            onClick={loadFiles}
            title="Refresh files & git status"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              padding: 4,
              borderRadius: 3,
              display: "flex",
              alignItems: "center",
              transform: loading ? "rotate(180deg)" : "none",
              transition: "transform 0.4s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
          >
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      {/* Filter / Search input bar */}
      {searchOpen && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 4,
            padding: "3px 6px",
            marginBottom: 8,
            gap: 6,
          }}
        >
          <Search size={12} color="var(--text-muted)" style={{ flexShrink: 0 }} />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            placeholder="Filter files..."
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                if (searchQuery) setSearchQuery("");
                else setSearchOpen(false);
              }
            }}
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "var(--text-primary)",
              fontSize: 11,
              padding: 0,
            }}
          />
          {searchQuery && (
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{matchCount}</span>
              <button
                onClick={() => setSearchQuery("")}
                title="Clear filter"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  display: "flex",
                  padding: 0,
                }}
              >
                <X size={11} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* File Tree Container */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          overflowY: "auto",
          gap: 1,
        }}
      >
        {/* Inline new item input at project root */}
        {creating && creating.parentPath === activeProject.path && (
          <NewItemInput
            isDirectory={creating.isDirectory}
            depth={0}
            onSubmit={handleCreateSubmit}
            onCancel={() => setCreating(null)}
          />
        )}

        {/* Tree nodes */}
        {filteredFiles.map((node) => (
          <FileTreeNodeItem
            key={node.path}
            node={node}
            host={host}
            depth={0}
            expanded={effectiveExpanded}
            activeFilePath={activeFilePath}
            filterQuery={searchQuery}
            gitStatuses={gitStatuses}
            renamingPath={renamingPath}
            creating={creating}
            onToggle={toggleFolder}
            onOpen={handleOpenFile}
            onContextMenu={handleContextMenu}
            onRenameSubmit={handleRenameSubmit}
            onRenameCancel={() => setRenamingPath(null)}
            onCreateSubmit={handleCreateSubmit}
            onCreateCancel={() => setCreating(null)}
          />
        ))}

        {/* Empty filter result state */}
        {searchQuery.trim() && filteredFiles.length === 0 && (
          <div
            style={{
              padding: "16px 8px",
              textAlign: "center",
              color: "var(--text-muted)",
              fontSize: 11,
            }}
          >
            <div>No files matching "{searchQuery}"</div>
            <button
              onClick={() => setSearchQuery("")}
              style={{
                marginTop: 6,
                background: "transparent",
                border: "1px solid var(--border-subtle)",
                borderRadius: 4,
                color: "var(--accent-base)",
                padding: "2px 8px",
                fontSize: 10,
                cursor: "pointer",
              }}
            >
              Clear filter
            </button>
          </div>
        )}

        {/* Empty directory state */}
        {!searchQuery && files.length === 0 && !loading && (
          <div
            style={{
              padding: "16px 8px",
              textAlign: "center",
              color: "var(--text-muted)",
              fontSize: 11,
            }}
          >
            No files in workspace.
          </div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deletingNode && (
        <ConfirmModal
          title={`Delete ${deletingNode.isDirectory ? "Folder" : "File"}`}
          message={`Are you sure you want to move this ${
            deletingNode.isDirectory ? "folder and all its contents" : "file"
          } to trash?`}
          itemName={deletingNode.name}
          confirmLabel="Move to Trash"
          isDanger
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeletingNode(null)}
        />
      )}
    </div>
  );
};
