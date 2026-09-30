import React, { useState } from "react";
import {
  Folder,
  Files,
  GitBranch,
  ShoppingBag,
  PieChart,
  Terminal as TerminalIcon,
  Sparkles,
  Settings,
} from "lucide-react";
import { Sidebar } from "./Sidebar.tsx";
import { FilesPanel } from "./FilesPanel.tsx";
import { GitPanel } from "./GitPanel.tsx";
import { MarketplacePanel } from "./MarketplacePanel.tsx";
import { WelcomeView } from "./WelcomeView.tsx";
import { TabStrip } from "./TabStrip.tsx";
import { Transcript } from "./Transcript.tsx";
import { Composer } from "./Composer.tsx";
import { FileViewerTab } from "./FileViewerTab.tsx";
import { DiffViewerTab } from "./DiffViewerTab.tsx";
import { AppTitleBar } from "./AppTitleBar.tsx";
import { StatusBar } from "./StatusBar.tsx";
import { SettingsModal } from "./SettingsModal.tsx";
import { ExtensionDialogModal } from "./ExtensionDialogModal.tsx";
import { useSessionStore } from "../store/session-store.ts";

export type LeftPanelTab = "projects" | "files" | "git" | null;
export type RightPanelTab = "marketplace" | "context" | "terminal" | null;

export const WorkbenchLayout: React.FC = () => {
  const { activeProject, tabs, activeTabId, error } = useSessionStore();
  const activeTab = tabs.find((t) => t.id === activeTabId);

  const [activeLeft, setActiveLeft] = useState<LeftPanelTab>("projects");
  const [activeRight, setActiveRight] = useState<RightPanelTab>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Resizable panel dimensions with localStorage persistence
  const [leftWidth, setLeftWidth] = useState<number>(() => {
    const saved = localStorage.getItem("pi_studio_left_width");
    return saved ? Math.max(160, Math.min(650, parseInt(saved, 10))) : 260;
  });
  const [rightWidth, setRightWidth] = useState<number>(() => {
    const saved = localStorage.getItem("pi_studio_right_width");
    return saved ? Math.max(200, Math.min(650, parseInt(saved, 10))) : 300;
  });
  const [composerHeight, setComposerHeight] = useState<number>(() => {
    const saved = localStorage.getItem("pi_studio_composer_height");
    return saved ? Math.max(100, Math.min(500, parseInt(saved, 10))) : 160;
  });

  const [isDraggingLeft, setIsDraggingLeft] = useState(false);
  const [isDraggingRight, setIsDraggingRight] = useState(false);
  const [isDraggingComposer, setIsDraggingComposer] = useState(false);

  const toggleLeft = (tab: LeftPanelTab) => {
    setActiveLeft((prev) => (prev === tab ? null : tab));
  };

  const toggleRight = (tab: RightPanelTab) => {
    setActiveRight((prev) => (prev === tab ? null : tab));
  };

  const handleLeftResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingLeft(true);
    const onMouseMove = (ev: MouseEvent) => {
      // Activity bar width = 44px
      const newWidth = Math.max(160, Math.min(650, ev.clientX - 44));
      setLeftWidth(newWidth);
      localStorage.setItem("pi_studio_left_width", String(newWidth));
    };
    const onMouseUp = () => {
      setIsDraggingLeft(false);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const handleRightResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingRight(true);
    const onMouseMove = (ev: MouseEvent) => {
      // Right activity bar = 44px
      const newWidth = Math.max(200, Math.min(650, window.innerWidth - 44 - ev.clientX));
      setRightWidth(newWidth);
      localStorage.setItem("pi_studio_right_width", String(newWidth));
    };
    const onMouseUp = () => {
      setIsDraggingRight(false);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const handleComposerResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingComposer(true);
    const onMouseMove = (ev: MouseEvent) => {
      // Status bar height = 24px
      const newHeight = Math.max(100, Math.min(500, window.innerHeight - 24 - ev.clientY));
      setComposerHeight(newHeight);
      localStorage.setItem("pi_studio_composer_height", String(newHeight));
    };
    const onMouseUp = () => {
      setIsDraggingComposer(false);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const hasActiveSession = Boolean(activeProject && tabs.length > 0);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        width: "100vw",
        overflow: "hidden",
        backgroundColor: "var(--bg-app)",
        color: "var(--text-primary)",
        position: "relative",
      }}
    >
      {/* Drag Overlay to prevent pointer events trapping during resize */}
      {(isDraggingLeft || isDraggingRight || isDraggingComposer) && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 99999,
            cursor: isDraggingComposer ? "row-resize" : "col-resize",
            userSelect: "none",
          }}
        />
      )}

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

      {/* Main Horizontal Area (flanked by Left and Right Activity Bars) */}
      <div style={{ display: "flex", flex: 1, minHeight: 0, position: "relative" }}>
        {/* ==================== LEFT ACTIVITY BAR ==================== */}
        <div
          style={{
            width: 44,
            background: "var(--bg-sidebar)",
            borderRight: "1px solid var(--border-subtle)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "8px 0",
            gap: 6,
            zIndex: 40,
            userSelect: "none",
          }}
        >
          {/* Top Brand Glyph */}
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              background: "linear-gradient(135deg, var(--accent-base), #986ee2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 10,
              boxShadow: "0 2px 8px var(--accent-subtle)",
            }}
            title="Pi Studio"
          >
            <Sparkles size={14} color="#fff" />
          </div>

          {/* Activity Bar Icon Buttons: PURE ICONS ONLY, NO TEXT */}
          <IconButton
            icon={<Folder size={18} />}
            title="Projects & Sessions (Ctrl+B)"
            active={activeLeft === "projects"}
            onClick={() => toggleLeft("projects")}
          />
          <IconButton
            icon={<Files size={18} />}
            title="File Explorer"
            active={activeLeft === "files"}
            onClick={() => toggleLeft("files")}
          />
          <IconButton
            icon={<GitBranch size={18} />}
            title="Source Control (Git)"
            active={activeLeft === "git"}
            onClick={() => toggleLeft("git")}
          />

          <div style={{ flex: 1 }} />

          <IconButton
            icon={<Settings size={18} />}
            title="Settings (Appearance, Accounts, Updates)"
            active={settingsOpen}
            onClick={() => setSettingsOpen(true)}
          />
        </div>

        {/* ==================== LEFT DRAWER PANEL ==================== */}
        {activeLeft && (
          <>
            <div
              style={{
                width: leftWidth,
                background: "var(--bg-sidebar)",
                borderRight: "1px solid var(--border-subtle)",
                display: "flex",
                flexDirection: "column",
                height: "100%",
                overflow: "hidden",
                zIndex: 30,
              }}
            >
              {activeLeft === "projects" && <Sidebar />}
              {activeLeft === "files" && <FilesPanel />}
              {activeLeft === "git" && <GitPanel />}
            </div>
            {/* Left Vertical Resize Handle */}
            <div
              onMouseDown={handleLeftResizeStart}
              title="Drag to resize panel width"
              style={{
                width: 6,
                marginLeft: -3,
                marginRight: -3,
                cursor: "col-resize",
                zIndex: 35,
                position: "relative",
                background: isDraggingLeft ? "var(--accent-base)" : "transparent",
                transition: "background 0.15s ease",
              }}
            />
          </>
        )}

        {/* ==================== CENTER WORKBENCH ==================== */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
            height: "100%",
            overflow: "hidden",
            background: "var(--bg-app)",
          }}
        >
          {/* Custom In-App Titlebar: sits cleanly across the center column */}
          <AppTitleBar onOpenSettings={() => setSettingsOpen(true)} />

          {/* Session TabStrip: sits cleanly between the sidebars */}
          <TabStrip />

          {/* Error Banner if any */}
          {error && (
            <div
              style={{
                background: "rgba(229, 83, 75, 0.12)",
                borderBottom: "1px solid var(--danger)",
                color: "var(--danger)",
                padding: "6px 14px",
                fontSize: 12,
              }}
            >
              {error}
            </div>
          )}

          {/* Center Main Content */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
            {activeTab?.kind === "file" ? (
              <FileViewerTab tab={activeTab} />
            ) : activeTab?.kind === "diff" ? (
              <DiffViewerTab tab={activeTab} />
            ) : hasActiveSession ? (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
                <Transcript />
                {/* Horizontal Resize Handle for Composer */}
                <div
                  onMouseDown={handleComposerResizeStart}
                  title="Drag to resize composer height"
                  style={{
                    height: 6,
                    marginTop: -3,
                    marginBottom: -3,
                    cursor: "row-resize",
                    zIndex: 25,
                    position: "relative",
                    background: isDraggingComposer ? "var(--accent-base)" : "transparent",
                    transition: "background 0.15s ease",
                  }}
                />
                <Composer height={composerHeight} />
              </div>
            ) : (
              <WelcomeView />
            )}
          </div>
        </div>

        {/* ==================== RIGHT DRAWER PANEL ==================== */}
        {activeRight && (
          <>
            {/* Right Vertical Resize Handle */}
            <div
              onMouseDown={handleRightResizeStart}
              title="Drag to resize panel width"
              style={{
                width: 6,
                marginLeft: -3,
                marginRight: -3,
                cursor: "col-resize",
                zIndex: 35,
                position: "relative",
                background: isDraggingRight ? "var(--accent-base)" : "transparent",
                transition: "background 0.15s ease",
              }}
            />
            <div
              style={{
                width: rightWidth,
                background: "var(--bg-sidebar)",
                borderLeft: "1px solid var(--border-subtle)",
                display: "flex",
                flexDirection: "column",
                height: "100%",
                overflow: "hidden",
                zIndex: 30,
              }}
            >
              {activeRight === "marketplace" && <MarketplacePanel />}
              {activeRight === "context" && (
                <div style={{ padding: 14, color: "var(--text-muted)", fontSize: 12 }}>
                  <div style={{ fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8 }}>Context Breakdown</div>
                  <div>Detailed token category inspector is also available by clicking the Context Ring below.</div>
                </div>
              )}
              {activeRight === "terminal" && (
                <div style={{ padding: 14, color: "var(--text-muted)", fontSize: 12 }}>
                  <div style={{ fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8 }}>Integrated Terminal</div>
                  <div>Run files with the interpreter runner in the Files tab or launch terminal tasks.</div>
                </div>
              )}
            </div>
          </>
        )}

        {/* ==================== RIGHT ACTIVITY BAR ==================== */}
        <div
          style={{
            width: 44,
            background: "var(--bg-sidebar)",
            borderLeft: "1px solid var(--border-subtle)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "8px 0",
            gap: 6,
            zIndex: 40,
            userSelect: "none",
          }}
        >
          <IconButton
            icon={<ShoppingBag size={18} />}
            title="Marketplace (Extensions & MCP)"
            active={activeRight === "marketplace"}
            onClick={() => toggleRight("marketplace")}
          />
          <IconButton
            icon={<PieChart size={18} />}
            title="Context Breakdown"
            active={activeRight === "context"}
            onClick={() => toggleRight("context")}
          />
          <IconButton
            icon={<TerminalIcon size={18} />}
            title="Terminal"
            active={activeRight === "terminal"}
            onClick={() => toggleRight("terminal")}
          />
        </div>
      </div>

      {/* ==================== BOTTOM STATUS BAR ==================== */}
      <StatusBar />

      {/* Modals */}
      <ExtensionDialogModal />
      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
};

interface IconButtonProps {
  icon: React.ReactNode;
  title: string;
  active: boolean;
  onClick: () => void;
}

const IconButton: React.FC<IconButtonProps> = ({ icon, title, active, onClick }) => {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 34,
        height: 34,
        borderRadius: 8,
        border: "none",
        background: active ? "var(--accent-subtle)" : "transparent",
        color: active ? "var(--accent-hover)" : "var(--text-muted)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        position: "relative",
        transition: "all 0.15s ease",
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background = "rgba(255, 255, 255, 0.06)";
          e.currentTarget.style.color = "var(--text-primary)";
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = "var(--text-muted)";
        }
      }}
    >
      {/* Active pill indicator bar on side */}
      {active && (
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 6,
            bottom: 6,
            width: 3,
            borderRadius: "0 2px 2px 0",
            background: "var(--accent-base)",
          }}
        />
      )}
      {icon}
    </button>
  );
};
