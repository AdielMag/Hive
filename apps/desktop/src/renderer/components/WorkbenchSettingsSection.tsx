import React from "react";
import { useUi } from "../store/ui-store.ts";

export const WorkbenchSettingsSection: React.FC = () => {
  const projectTabsEnabled = useUi((s) => s.projectTabsEnabled);
  const setProjectTabsEnabled = useUi((s) => s.setProjectTabsEnabled);

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 12, borderTop: "1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))", paddingTop: 16 }}>
      <span className="ui-section-label">Workbench</span>
      <label style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 12, cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={projectTabsEnabled}
          onChange={(e) => setProjectTabsEnabled(e.target.checked)}
          style={{ marginTop: 2 }}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>Show projects as tabs in top bar</span>
          <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
            Keep all open projects as tabs in the top bar above session tabs, like JetBrains Rider on macOS.
          </span>
        </div>
      </label>
    </section>
  );
};
