import React from "react";
import { PieChart } from "lucide-react";
import { ContextBreakdownView } from "./ContextBreakdownView.tsx";

export const ContextBreakdownPanel: React.FC = () => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      height: "100%",
      background: "var(--bg-sidebar)",
      color: "var(--text-primary)",
    }}
  >
    <div
      style={{
        padding: "12px 16px",
        borderBottom: "1px solid var(--border-subtle)",
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexShrink: 0,
      }}
    >
      <PieChart size={15} color="var(--accent-base)" />
      <span style={{ fontWeight: 600, fontSize: 13, letterSpacing: "-0.01em" }}>Context window</span>
    </div>
    <div style={{ padding: 16, overflowY: "auto", flex: 1, minHeight: 0 }}>
      <ContextBreakdownView compact />
    </div>
  </div>
);
