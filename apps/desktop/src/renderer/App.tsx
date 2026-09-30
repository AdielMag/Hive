import React, { useEffect, useState } from "react";
import { AlertTriangle, Terminal } from "lucide-react";
import { useSessionStore } from "./store/session-store.ts";
import { AppTitleBar } from "./components/AppTitleBar.tsx";
import { DockShell } from "./components/DockShell.tsx";
import { StatusBar } from "./components/StatusBar.tsx";
import { ExtensionDialogModal } from "./components/ExtensionDialogModal.tsx";
import { ArcThemePicker } from "./components/ArcThemePicker.tsx";

export const App: React.FC = () => {
  const { init, isInitializing, bootstrap, error, activeProject } = useSessionStore();
  const [arcThemeOpen, setArcThemeOpen] = useState(false);

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    if (activeProject?.color) {
      document.documentElement.style.setProperty("--project-color", activeProject.color);
    }
  }, [activeProject?.color]);

  if (isInitializing) {
    return (
      <div
        style={{
          display: "flex",
          height: "100vh",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-muted)",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-secondary)" }}>Starting Pi Studio...</div>
        <div style={{ fontSize: 12 }}>Connecting to local Pi runtime</div>
      </div>
    );
  }

  if (bootstrap?.pi && !bootstrap.pi.ok) {
    return (
      <div
        style={{
          display: "flex",
          height: "100vh",
          alignItems: "center",
          justifyContent: "center",
          padding: 32,
        }}
      >
        <div
          style={{
            maxWidth: 520,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-prominent)",
            borderRadius: 8,
            padding: 24,
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--danger)" }}>
            <AlertTriangle size={20} />
            <span style={{ fontSize: 16, fontWeight: 600 }}>Pi CLI Not Found</span>
          </div>

          <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>
            Pi Studio drives your installed Pi CLI, but it was not detected on this machine.
          </div>

          <div
            style={{
              background: "var(--bg-input)",
              padding: 12,
              borderRadius: 6,
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              color: "var(--text-primary)",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Terminal size={14} color="var(--accent-base)" />
            <span>npm install -g @earendil-works/pi-coding-agent</span>
          </div>

          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
            Paths searched:
            <ul style={{ paddingLeft: 18, marginTop: 4 }}>
              {bootstrap.pi.searched.map((s, idx) => (
                <li key={idx}>{s}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        width: "100vw",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* SVG Grain Overlay */}
      <div
        className="grain-overlay"
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          zIndex: 9998,
          opacity: "var(--grain-opacity, 0.08)",
        }}
      />

      <AppTitleBar onOpenTheme={() => setArcThemeOpen(true)} />
      {error ? (
        <div
          style={{
            background: "rgba(229, 83, 75, 0.1)",
            borderBottom: "1px solid var(--danger)",
            color: "var(--danger)",
            padding: "6px 12px",
            fontSize: 12,
          }}
        >
          {error}
        </div>
      ) : null}
      <DockShell />
      <StatusBar />
      <ExtensionDialogModal />
      <ArcThemePicker isOpen={arcThemeOpen} onClose={() => setArcThemeOpen(false)} />
    </div>
  );
};
