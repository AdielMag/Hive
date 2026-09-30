import React from "react";
import { useSessionStore } from "../store/session-store.ts";
import { parseAnsi } from "@pi-studio/pi-adapter";

export const StatusBar: React.FC = () => {
  const { bootstrap, extensionStatus, transcript, stats } = useSessionStore();
  const piVersion = bootstrap?.pi.ok ? bootstrap.pi.info.version : "not found";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        height: 24,
        background: "var(--bg-sidebar)",
        borderTop: "1px solid var(--border-subtle)",
        padding: "0 10px",
        gap: 16,
        fontSize: 11,
        color: "var(--text-muted)",
        userSelect: "none",
        zIndex: 50,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ color: "var(--text-secondary)" }}>pi {piVersion}</span>
        {transcript.running && (
          <span style={{ color: "var(--accent-base)" }}>• running turn</span>
        )}
      </div>

      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 14, overflow: "hidden" }}>
        {Object.entries(extensionStatus).map(([key, text]) => {
          const segments = parseAnsi(text);
          return (
            <span key={key} style={{ display: "inline-flex", gap: 2, whiteSpace: "nowrap" }}>
              {segments.map((seg, idx) => (
                <span
                  key={idx}
                  style={{
                    color: seg.style.color || "var(--text-secondary)",
                    fontWeight: seg.style.bold ? 600 : "normal",
                  }}
                >
                  {seg.text}
                </span>
              ))}
            </span>
          );
        })}
      </div>

      {stats && stats.cost > 0 && (
        <span style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
          ${stats.cost.toFixed(3)}
        </span>
      )}
    </div>
  );
};
