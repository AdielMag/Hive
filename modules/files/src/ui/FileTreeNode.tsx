import React, { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, MoreVertical, Play } from "lucide-react";
import type { FileTreeNode as TreeNode, ModuleHost } from "@hive/module-sdk/renderer";
import { FileIcon } from "./file-icons.tsx";
import { HighlightText } from "./HighlightText.tsx";
import { NewItemInput } from "./NewItemInput.tsx";
import { normalizeRelPath } from "./tree-utils.ts";

export type GitStatusType = "modified" | "added" | "deleted" | "renamed" | "untracked" | "conflicted";

interface FileTreeNodeProps {
  node: TreeNode;
  host: ModuleHost;
  depth: number;
  expanded: Record<string, boolean>;
  activeFilePath: string | null;
  filterQuery: string;
  gitStatuses: Record<string, GitStatusType>;
  renamingPath: string | null;
  creating: { parentPath: string; isDirectory: boolean; depth: number } | null;
  onToggle: (path: string) => void;
  onOpen: (file: TreeNode) => void;
  onContextMenu: (e: React.MouseEvent, node: TreeNode) => void;
  onRenameSubmit: (node: TreeNode, newName: string) => void;
  onRenameCancel: () => void;
  onCreateSubmit: (name: string) => void;
  onCreateCancel: () => void;
}

export const FileTreeNodeItem: React.FC<FileTreeNodeProps> = ({
  node,
  host,
  depth,
  expanded,
  activeFilePath,
  filterQuery,
  gitStatuses,
  renamingPath,
  creating,
  onToggle,
  onOpen,
  onContextMenu,
  onRenameSubmit,
  onRenameCancel,
  onCreateSubmit,
  onCreateCancel,
}) => {
  const [hovered, setHovered] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [renameValue, setRenameValue] = useState(node.name);

  const isRenaming = renamingPath === node.path;
  const isExp = expanded[node.path] ?? false;
  const isActive = activeFilePath === node.path;
  const renameSubmittedRef = useRef(false);

  // Git status lookup
  const relPath = normalizeRelPath(node.relativePath || node.name);
  const gitStatus = gitStatuses[relPath];

  // For folders, check if any descendant has git changes
  const hasGitDescendant = node.isDirectory && Object.keys(gitStatuses).some((p) =>
    p.startsWith(relPath + "/")
  );

  useEffect(() => {
    if (isRenaming) {
      renameSubmittedRef.current = false;
      setRenameValue(node.name);
      setTimeout(() => {
        if (renameInputRef.current) {
          renameInputRef.current.focus();
          const dot = node.isDirectory ? -1 : node.name.lastIndexOf(".");
          if (dot > 0) {
            renameInputRef.current.setSelectionRange(0, dot);
          } else {
            renameInputRef.current.select();
          }
        }
      }, 30);
    }
  }, [isRenaming, node.name, node.isDirectory]);

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      renameSubmittedRef.current = true;
      onRenameCancel();
    } else if (e.key === "Enter") {
      e.stopPropagation();
      if (renameSubmittedRef.current) return;
      renameSubmittedRef.current = true;
      const trimmed = renameValue.trim();
      if (trimmed && trimmed !== node.name) {
        onRenameSubmit(node, trimmed);
      } else {
        onRenameCancel();
      }
    }
  };

  const handleRenameBlur = () => {
    if (renameSubmittedRef.current) return;
    renameSubmittedRef.current = true;
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== node.name) {
      onRenameSubmit(node, trimmed);
    } else {
      onRenameCancel();
    }
  };

  const ext = node.name.slice(node.name.lastIndexOf(".")).toLowerCase();
  const hasTerminal = host.commands.has("terminal.run");
  const isRunnable = !node.isDirectory && hasTerminal && [".py", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".sh", ".bash", ".ps1"].includes(ext);

  const handleRunInTerminal = async (e: React.MouseEvent) => {
    e.stopPropagation();
    let cmd = "";
    if (ext === ".py") cmd = `python "${node.path}"`;
    else if ([".js", ".mjs", ".cjs"].includes(ext)) cmd = `node "${node.path}"`;
    else if ([".ts", ".tsx"].includes(ext)) cmd = `npx tsx "${node.path}"`;
    else if ([".sh", ".bash"].includes(ext)) cmd = `bash "${node.path}"`;
    else if (ext === ".ps1") cmd = `powershell -NoProfile -File "${node.path}"`;
    if (!cmd) return;

    const cwd = node.path.replace(/[/\\][^/\\]*$/, "");
    await host.commands.run("terminal.run", { command: cmd, cwd });
  };

  // Git badge helper
  const renderGitBadge = () => {
    if (gitStatus) {
      let label = "M";
      let color = "#f59e0b"; // amber
      if (gitStatus === "untracked" || gitStatus === "added") {
        label = gitStatus === "untracked" ? "U" : "A";
        color = "#10b981"; // green
      } else if (gitStatus === "deleted") {
        label = "D";
        color = "#ef4444"; // red
      } else if (gitStatus === "renamed") {
        label = "R";
        color = "#06b6d4"; // cyan
      } else if (gitStatus === "conflicted") {
        label = "C";
        color = "#ef4444";
      }

      return (
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color,
            fontFamily: "var(--font-mono, monospace)",
            padding: "0 2px",
            lineHeight: 1,
            flexShrink: 0,
          }}
          title={`Git: ${gitStatus}`}
        >
          {label}
        </span>
      );
    }

    if (hasGitDescendant) {
      return (
        <span
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            backgroundColor: "#f59e0b",
            flexShrink: 0,
          }}
          title="Contains modified files"
        />
      );
    }

    return null;
  };

  const getGitTextColor = () => {
    if (!gitStatus) return undefined;
    if (gitStatus === "modified") return "#f59e0b";
    if (gitStatus === "untracked" || gitStatus === "added") return "#10b981";
    if (gitStatus === "deleted") return "#ef4444";
    return undefined;
  };

  if (node.isDirectory) {
    return (
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div
          onClick={() => onToggle(node.path)}
          onContextMenu={(e) => onContextMenu(e, node)}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: `3px 6px 3px ${depth * 14 + 4}px`,
            borderRadius: 4,
            cursor: "pointer",
            color: getGitTextColor() || (isActive ? "var(--text-primary)" : "var(--text-secondary)"),
            backgroundColor: isActive
              ? "rgba(56, 189, 248, 0.1)"
              : hovered
              ? "var(--bg-card-hover)"
              : "transparent",
            borderLeft: isActive ? "2px solid var(--accent-base)" : "2px solid transparent",
            transition: "background-color 0.1s ease",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 5, overflow: "hidden", flex: 1 }}>
            <span style={{ display: "flex", alignItems: "center", color: "var(--text-muted)" }}>
              {isExp ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </span>
            <FileIcon name={node.name} isDirectory isOpen={isExp} size={14} />

            {isRenaming ? (
              <input
                ref={renameInputRef}
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={handleRenameKeyDown}
                onBlur={handleRenameBlur}
                onClick={(e) => e.stopPropagation()}
                style={{
                  flex: 1,
                  background: "var(--bg-surface)",
                  border: "1px solid var(--accent-base)",
                  borderRadius: 2,
                  outline: "none",
                  color: "var(--text-primary)",
                  fontSize: 12,
                  padding: "1px 4px",
                  fontFamily: "inherit",
                }}
              />
            ) : (
              <span
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  fontSize: 12,
                  fontWeight: 500,
                }}
              >
                <HighlightText text={node.name} query={filterQuery} />
              </span>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: 4 }}>
            {renderGitBadge()}
            {hovered && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onContextMenu(e, node);
                }}
                title="Folder options"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  padding: 1,
                  borderRadius: 3,
                }}
              >
                <MoreVertical size={12} />
              </button>
            )}
          </div>
        </div>

        {isExp && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              borderLeft: "1px solid var(--border-subtle)",
              marginLeft: depth * 14 + 10,
            }}
          >
            {creating && creating.parentPath === node.path && (
              <NewItemInput
                isDirectory={creating.isDirectory}
                depth={0}
                onSubmit={onCreateSubmit}
                onCancel={onCreateCancel}
              />
            )}
            {node.children &&
              node.children.map((child) => (
                <FileTreeNodeItem
                  key={child.path}
                  node={child}
                  host={host}
                  depth={depth + 1}
                  expanded={expanded}
                  activeFilePath={activeFilePath}
                  filterQuery={filterQuery}
                  gitStatuses={gitStatuses}
                  renamingPath={renamingPath}
                  creating={creating}
                  onToggle={onToggle}
                  onOpen={onOpen}
                  onContextMenu={onContextMenu}
                  onRenameSubmit={onRenameSubmit}
                  onRenameCancel={onRenameCancel}
                  onCreateSubmit={onCreateSubmit}
                  onCreateCancel={onCreateCancel}
                />
              ))}
          </div>
        )}
      </div>
    );
  }

  // File item
  return (
    <div
      onClick={() => onOpen(node)}
      onContextMenu={(e) => onContextMenu(e, node)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: `3px 6px 3px ${depth * 14 + 18}px`,
        borderRadius: 4,
        cursor: "pointer",
        color: getGitTextColor() || (isActive ? "var(--text-primary)" : "var(--text-secondary)"),
        backgroundColor: isActive
          ? "rgba(56, 189, 248, 0.12)"
          : hovered
          ? "var(--bg-card-hover)"
          : "transparent",
        borderLeft: isActive ? "2px solid var(--accent-base)" : "2px solid transparent",
        transition: "background-color 0.1s ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, overflow: "hidden", flex: 1 }}>
        <FileIcon name={node.name} isDirectory={false} size={14} />

        {isRenaming ? (
          <input
            ref={renameInputRef}
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={handleRenameKeyDown}
            onBlur={handleRenameBlur}
            onClick={(e) => e.stopPropagation()}
            style={{
              flex: 1,
              background: "var(--bg-surface)",
              border: "1px solid var(--accent-base)",
              borderRadius: 2,
              outline: "none",
              color: "var(--text-primary)",
              fontSize: 12,
              padding: "1px 4px",
              fontFamily: "inherit",
            }}
          />
        ) : (
          <span
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontSize: 12,
              fontWeight: isActive ? 600 : 400,
            }}
            title={node.name}
          >
            <HighlightText text={node.name} query={filterQuery} />
          </span>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: 4 }}>
        {renderGitBadge()}

        {isRunnable && hovered && (
          <button
            onClick={handleRunInTerminal}
            title={`Run ${node.name} in Terminal`}
            style={{
              background: "rgba(56, 189, 248, 0.15)",
              border: "1px solid rgba(56, 189, 248, 0.3)",
              borderRadius: 3,
              padding: "2px 4px",
              color: "var(--accent-hover)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 2,
              fontSize: 10,
            }}
          >
            <Play size={10} fill="currentColor" />
          </button>
        )}

        {hovered && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onContextMenu(e, node);
            }}
            title="File options"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              padding: 1,
              borderRadius: 3,
            }}
          >
            <MoreVertical size={12} />
          </button>
        )}
      </div>
    </div>
  );
};
