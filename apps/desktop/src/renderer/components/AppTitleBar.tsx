import React, { useState, useRef, useEffect } from "react";
import { Sparkles, Palette, Folder, HelpCircle } from "lucide-react";
import { useSessionStore } from "../store/session-store.ts";

interface AppTitleBarProps {
  onOpenTheme: () => void;
}

export const AppTitleBar: React.FC<AppTitleBarProps> = ({ onOpenTheme }) => {
  const { activeProject, activeTabId, closeTab, addProject, newSessionTab } = useSessionStore();
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setActiveMenu(null);
      }
    };
    window.addEventListener("mousedown", handleOutsideClick);
    return () => window.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const handleOpenFolder = async () => {
    setActiveMenu(null);
    const folder = await window.studio.pickFolder();
    if (folder) {
      const p = await addProject(folder);
      await newSessionTab(p.id);
    }
  };

  const handleNewSession = async () => {
    setActiveMenu(null);
    if (activeProject) {
      await newSessionTab(activeProject.id);
    }
  };

  const handleCloseActiveTab = async () => {
    setActiveMenu(null);
    if (activeTabId) {
      await closeTab(activeTabId);
    }
  };

  return (
    <div
      ref={barRef}
      style={{
        display: "flex",
        alignItems: "center",
        height: 36,
        background: "var(--bg-app)",
        borderBottom: "1px solid var(--border-subtle)",
        padding: "0 10px",
        userSelect: "none",
        fontSize: 12,
        color: "var(--text-secondary)",
        // Window drag region
        WebkitAppRegion: "drag" as any,
      }}
    >
      {/* Left: In-app Menus */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, WebkitAppRegion: "no-drag" as any }}>
        {/* Menus */}
        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          {/* File Menu */}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setActiveMenu(activeMenu === "file" ? null : "file")}
              style={{
                background: activeMenu === "file" ? "var(--bg-card)" : "transparent",
                border: "none",
                color: activeMenu === "file" ? "var(--text-primary)" : "var(--text-secondary)",
                borderRadius: 4,
                padding: "3px 8px",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              File
            </button>
            {activeMenu === "file" && (
              <MenuDropdown
                items={[
                  { label: "New Session", shortcut: "Ctrl+N", action: handleNewSession, disabled: !activeProject },
                  { label: "Open Project Folder...", shortcut: "Ctrl+O", action: handleOpenFolder },
                  { label: "Close Current Tab", shortcut: "Ctrl+W", action: handleCloseActiveTab, disabled: !activeTabId },
                ]}
              />
            )}
          </div>

          {/* Edit Menu */}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setActiveMenu(activeMenu === "edit" ? null : "edit")}
              style={{
                background: activeMenu === "edit" ? "var(--bg-card)" : "transparent",
                border: "none",
                color: activeMenu === "edit" ? "var(--text-primary)" : "var(--text-secondary)",
                borderRadius: 4,
                padding: "3px 8px",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Edit
            </button>
            {activeMenu === "edit" && (
              <MenuDropdown
                items={[
                  { label: "Undo", shortcut: "Ctrl+Z", action: () => document.execCommand("undo") },
                  { label: "Redo", shortcut: "Ctrl+Y", action: () => document.execCommand("redo") },
                  { label: "Cut", shortcut: "Ctrl+X", action: () => document.execCommand("cut") },
                  { label: "Copy", shortcut: "Ctrl+C", action: () => document.execCommand("copy") },
                  { label: "Paste", shortcut: "Ctrl+V", action: () => document.execCommand("paste") },
                ]}
              />
            )}
          </div>

          {/* View Menu */}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setActiveMenu(activeMenu === "view" ? null : "view")}
              style={{
                background: activeMenu === "view" ? "var(--bg-card)" : "transparent",
                border: "none",
                color: activeMenu === "view" ? "var(--text-primary)" : "var(--text-secondary)",
                borderRadius: 4,
                padding: "3px 8px",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              View
            </button>
            {activeMenu === "view" && (
              <MenuDropdown
                items={[
                  { label: "Theme & Arc Colors...", action: () => { setActiveMenu(null); onOpenTheme(); } },
                  { label: "Zoom In", shortcut: "Ctrl+Plus", action: () => {} },
                  { label: "Zoom Out", shortcut: "Ctrl+-", action: () => {} },
                ]}
              />
            )}
          </div>

          {/* Help Menu */}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setActiveMenu(activeMenu === "help" ? null : "help")}
              style={{
                background: activeMenu === "help" ? "var(--bg-card)" : "transparent",
                border: "none",
                color: activeMenu === "help" ? "var(--text-primary)" : "var(--text-secondary)",
                borderRadius: 4,
                padding: "3px 8px",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Help
            </button>
            {activeMenu === "help" && (
              <MenuDropdown
                items={[
                  { label: "Pi CLI Documentation", action: () => window.open("https://pi.dev", "_blank") },
                  { label: "About Pi Studio", action: () => alert("Pi Studio v0.1.0\nDesktop Workbench for Pi Coding Agent") },
                ]}
              />
            )}
          </div>
        </div>
      </div>

      {/* Center: Title / Breadcrumb */}
      <div
        style={{
          flex: 1,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          fontSize: 12,
          fontWeight: 500,
          color: "var(--text-muted)",
        }}
      >
        {activeProject ? (
          <span style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text-secondary)" }}>
            <Folder size={12} color="var(--project-color)" />
            <span>{activeProject.name}</span>
          </span>
        ) : (
          <span>No project opened</span>
        )}
      </div>

      {/* Right: Theme button + padding for window controls */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          WebkitAppRegion: "no-drag" as any,
          paddingRight: 140, // Space for Windows minimize/maximize/close buttons
        }}
      >
        <button
          onClick={onOpenTheme}
          title="Open Arc Theme & Color Palette"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "rgba(255, 255, 255, 0.05)",
            border: "1px solid var(--border-subtle)",
            color: "var(--text-primary)",
            borderRadius: 6,
            padding: "4px 10px",
            fontSize: 11,
            fontWeight: 500,
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--accent-subtle)";
            e.currentTarget.style.borderColor = "var(--accent-base)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)";
            e.currentTarget.style.borderColor = "var(--border-subtle)";
          }}
        >
          <Palette size={13} color="var(--accent-base)" />
          <span>Theme</span>
        </button>
      </div>
    </div>
  );
};

interface MenuDropdownProps {
  items: Array<{
    label: string;
    shortcut?: string;
    action?: () => void;
    disabled?: boolean;
  }>;
}

const MenuDropdown: React.FC<MenuDropdownProps> = ({ items }) => {
  return (
    <div
      style={{
        position: "absolute",
        top: 26,
        left: 0,
        zIndex: 10000,
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-prominent)",
        borderRadius: 6,
        boxShadow: "0 8px 24px rgba(0, 0, 0, 0.5)",
        minWidth: 180,
        padding: "4px 0",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {items.map((item, idx) => (
        <div
          key={idx}
          onClick={item.disabled ? undefined : item.action}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "6px 12px",
            fontSize: 11,
            color: item.disabled ? "var(--text-muted)" : "var(--text-primary)",
            cursor: item.disabled ? "default" : "pointer",
            opacity: item.disabled ? 0.5 : 1,
          }}
          onMouseEnter={(e) => {
            if (!item.disabled) e.currentTarget.style.background = "var(--accent-subtle)";
          }}
          onMouseLeave={(e) => {
            if (!item.disabled) e.currentTarget.style.background = "transparent";
          }}
        >
          <span>{item.label}</span>
          {item.shortcut && <span style={{ color: "var(--text-muted)", fontSize: 10 }}>{item.shortcut}</span>}
        </div>
      ))}
    </div>
  );
};
