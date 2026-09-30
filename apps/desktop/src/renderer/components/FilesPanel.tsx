import React, { useEffect, useState } from "react";
import { Folder, FileText, ChevronRight, ChevronDown, RefreshCw } from "lucide-react";
import { useSessionStore } from "../store/session-store.ts";

export const FilesPanel: React.FC = () => {
  const { activeProject, openFileTab } = useSessionStore();
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

  return (
    <div
      onClick={() => onOpen(node)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 4px 3px 18px",
        borderRadius: 4,
        cursor: "pointer",
        color: "var(--text-secondary)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--bg-card-hover)";
        e.currentTarget.style.color = "var(--text-primary)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = "var(--text-secondary)";
      }}
    >
      <FileText size={13} color="var(--text-muted)" />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{node.name}</span>
    </div>
  );
};
