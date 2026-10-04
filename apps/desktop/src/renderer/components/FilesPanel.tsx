import React, { useEffect, useState } from "react";
import { Folder, FileText, ChevronRight, ChevronDown, RefreshCw, Play } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useSessionStore } from "../store/session-store.ts";
import { COMMANDS_BY_ID, useCommandsVersion } from "../features/commands/registry.ts";

export const FilesPanel: React.FC = () => {
  const { activeProject, openFileTab } = useSessionStore(useShallow((s) => ({ activeProject: s.activeProject, openFileTab: s.openFileTab })));
  const [files, setFiles] = useState<any[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const loadFiles = async () => {
    if (!activeProject?.path) return;
    try {
      const tree = await window.studio.listFiles(activeProject.path);
      setFiles(tree);
    } catch (e) {
      console.error("Failed to load files", e);
    }
  };

  useEffect(() => {
    void loadFiles();
  }, [activeProject?.path]);

  const toggleFolder = (path: string) => {
    setExpanded((s) => ({ ...s, [path]: !(s[path] ?? false) }));
  };

  const handleOpenFile = (file: any) => {
    if (!activeProject) return;
    void openFileTab(file.path, activeProject.id, file.name || file.relativePath);
  };

  if (!activeProject) {
    return <div style={{ padding: 16, color: "var(--text-muted)", fontSize: 12 }}>No project open.</div>;
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        padding: 10,
        fontSize: 12,
        userSelect: "none",
        overflowY: "auto",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.05em" }}>
          FILES
        </span>
        <button
          onClick={loadFiles}
          title="Refresh files"
          style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", display: "flex" }}
        >
          <RefreshCw size={12} />
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {files.map((node) => (
          <FileTreeNode
            key={node.path}
            node={node}
            expanded={expanded}
            onToggle={toggleFolder}
            onOpen={handleOpenFile}
          />
        ))}
      </div>
    </div>
  );
};

const FileTreeNode: React.FC<{
  node: any;
  expanded: Record<string, boolean>;
  onToggle: (path: string) => void;
  onOpen: (file: any) => void;
}> = ({ node, expanded, onToggle, onOpen }) => {
  if (node.isDirectory) {
    const isExp = expanded[node.path] ?? false;
    return (
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div
          onClick={() => onToggle(node.path)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            padding: "3px 4px",
            borderRadius: 4,
            cursor: "pointer",
            color: "var(--text-primary)",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-card-hover)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          {isExp ? <ChevronDown size={13} color="var(--text-muted)" /> : <ChevronRight size={13} color="var(--text-muted)" />}
          <Folder size={13} color="var(--accent-base)" />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{node.name}</span>
        </div>
        {isExp && node.children && (
          <div style={{ paddingLeft: 14 }}>
            {node.children.map((c: any) => (
              <FileTreeNode key={c.path} node={c} expanded={expanded} onToggle={onToggle} onOpen={onOpen} />
            ))}
          </div>
        )}
      </div>
    );
  }

  const [hovered, setHovered] = useState(false);

  const ext = node.name.slice(node.name.lastIndexOf(".")).toLowerCase();
  // "Run in terminal" exists only while a module provides the `terminal.run` command.
  useCommandsVersion((v) => v.version);
  const hasTerminal = COMMANDS_BY_ID.has("terminal.run");
  const isRunnable = hasTerminal && [".py", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".sh", ".bash", ".ps1"].includes(ext);

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
    await COMMANDS_BY_ID.get("terminal.run")?.run({ command: cmd, cwd });
  };

  return (
    <div
      onClick={() => onOpen(node)}
      onMouseEnter={(e) => {
        setHovered(true);
        e.currentTarget.style.background = "var(--bg-card-hover)";
        e.currentTarget.style.color = "var(--text-primary)";
      }}
      onMouseLeave={(e) => {
        setHovered(false);
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = "var(--text-secondary)";
      }}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "3px 6px 3px 18px",
        borderRadius: 4,
        cursor: "pointer",
        color: "var(--text-secondary)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, overflow: "hidden" }}>
        <FileText size={13} color="var(--text-muted)" style={{ flexShrink: 0 }} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{node.name}</span>
      </div>

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
    </div>
  );
};
