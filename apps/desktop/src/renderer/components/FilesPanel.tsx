import React, { useEffect, useState } from "react";
import { Folder, FileText, ChevronRight, ChevronDown, Play, MessageSquare, X, RefreshCw } from "lucide-react";
import { useSessionStore } from "../store/session-store.ts";

export const FilesPanel: React.FC = () => {
  const { activeProject, setPromptText } = useSessionStore();
  const [files, setFiles] = useState<any[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [selectedFile, setSelectedFile] = useState<any>(null);
  const [fileContent, setFileContent] = useState<any>(null);
  const [runOutput, setRunOutput] = useState<{ stdout: string; stderr: string; exitCode: number } | null>(null);
  const [running, setRunning] = useState(false);

  const loadFiles = async () => {
    if (!activeProject?.path) return;
    try {
      const tree = await window.studio.listFiles(activeProject.path);
      setFiles(tree);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    void loadFiles();
  }, [activeProject?.path]);

  const toggleFolder = (path: string) => {
    setExpanded((s) => ({ ...s, [path]: !(s[path] ?? false) }));
  };

  const handleOpenFile = async (file: any) => {
    setSelectedFile(file);
    setRunOutput(null);
    try {
      const data = await window.studio.readFile(file.path);
      setFileContent(data);
    } catch (err: any) {
      setFileContent({ content: `Failed to load: ${err.message}`, language: "text" });
    }
  };

  const handleRunInterpreter = async () => {
    if (!selectedFile || !activeProject) return;
    setRunning(true);
    setRunOutput(null);
    try {
      const res = await window.studio.runFile(selectedFile.path, activeProject.path);
      setRunOutput(res);
    } catch (err: any) {
      setRunOutput({ stdout: "", stderr: err.message, exitCode: 1 });
    } finally {
      setRunning(false);
    }
  };

  const handleAskPi = () => {
    if (!selectedFile) return;
    setPromptText(`Please explain and inspect ${selectedFile.relativePath}:\n`);
    setSelectedFile(null);
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

      {/* File Inspector Modal */}
      {selectedFile && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.7)",
            backdropFilter: "blur(2px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
        >
          <div
            style={{
              width: "75vw",
              maxWidth: 900,
              height: "75vh",
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-prominent)",
              borderRadius: 8,
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 16px 40px rgba(0,0,0,0.5)",
              overflow: "hidden",
            }}
          >
            {/* Header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 16px",
                borderBottom: "1px solid var(--border-subtle)",
                background: "var(--bg-card)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
                <FileText size={15} color="var(--accent-base)" />
                <span>{selectedFile.relativePath}</span>
                <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 400 }}>
                  ({fileContent?.language})
                </span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  onClick={handleAskPi}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "4px 10px",
                    background: "var(--accent-subtle)",
                    border: "1px solid var(--accent-base)",
                    color: "var(--accent-hover)",
                    borderRadius: 4,
                    fontSize: 11,
                    cursor: "pointer",
                  }}
                >
                  <MessageSquare size={12} /> Ask Pi
                </button>

                <button
                  onClick={handleRunInterpreter}
                  disabled={running}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "4px 10px",
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border-prominent)",
                    color: "var(--text-primary)",
                    borderRadius: 4,
                    fontSize: 11,
                    cursor: running ? "default" : "pointer",
                  }}
                >
                  <Play size={12} color="var(--success)" fill="var(--success)" />{" "}
                  {running ? "Running..." : "Run with Interpreter"}
                </button>

                <button
                  onClick={() => setSelectedFile(null)}
                  style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Content view */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              <pre
                style={{
                  flex: 1,
                  margin: 0,
                  padding: 14,
                  overflowY: "auto",
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  lineHeight: 1.5,
                  color: "var(--text-primary)",
                  background: "var(--bg-app)",
                }}
              >
                {fileContent?.content}
              </pre>

              {/* Interpreter Output Drawer */}
              {runOutput && (
                <div
                  style={{
                    height: 180,
                    borderTop: "1px solid var(--border-prominent)",
                    background: "var(--bg-input)",
                    padding: 10,
                    display: "flex",
                    flexDirection: "column",
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-muted)", marginBottom: 4 }}>
                    <span>INTERPRETER OUTPUT (exit code {runOutput.exitCode})</span>
                    <button
                      onClick={() => setRunOutput(null)}
                      style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
                    >
                      <X size={12} />
                    </button>
                  </div>
                  <div style={{ flex: 1, overflowY: "auto" }}>
                    {runOutput.stdout && <pre style={{ color: "var(--text-primary)", margin: 0 }}>{runOutput.stdout}</pre>}
                    {runOutput.stderr && <pre style={{ color: "var(--danger)", margin: 0 }}>{runOutput.stderr}</pre>}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
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
    >
      <FileText size={12} color="var(--text-muted)" />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{node.name}</span>
    </div>
  );
};
