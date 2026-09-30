import React from "react";
import { Folder, Loader2 } from "lucide-react";
import { useSessionStore } from "../store/session-store.ts";

export const TabStrip: React.FC = () => {
  const { projectName, projectPath, transcript, status } = useSessionStore();
  const isRunning = transcript.running;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        height: 38,
        background: "var(--bg-sidebar)",
        borderBottom: "1px solid var(--border-subtle)",
        padding: "0 8px",
        gap: 6,
        userSelect: "none",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "var(--bg-app)",
          padding: "4px 12px",
          borderRadius: "6px 6px 0 0",
          borderTop: "3px solid var(--project-color)",
          borderLeft: "1px solid var(--border-subtle)",
          borderRight: "1px solid var(--border-subtle)",
          height: 34,
          marginTop: 4,
          fontSize: 12,
          fontWeight: 500,
        }}
        title={projectPath}
      >
        <Folder size={14} color="var(--project-color)" />
        <span>{projectName || "No Project"}</span>
        {isRunning && (
          <Loader2
            size={12}
            color="var(--accent-base)"
            style={{ animation: "spin 1s linear infinite" }}
          />
        )}
      </div>

      <div style={{ flex: 1 }} />

      {status?.error && (
        <span style={{ fontSize: 11, color: "var(--danger)" }}>
          {status.error}
        </span>
      )}
    </div>
  );
};
