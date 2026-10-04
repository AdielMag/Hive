/** Frameless window title bar: app menus, active project, update badge and caption buttons. */
import React, { useEffect, useRef, useState } from "react";
import { Copy, Download, FolderKanban, Minus, Search, Square, X } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useSessionStore } from "../store/session-store.ts";
import { useUi } from "../store/ui-store.ts";
import { openProjectFolder } from "../features/commands/registry.ts";
import { getShortcutLabel, useShortcut } from "../features/commands/useShortcut.ts";
import { COMMANDS_BY_ID } from "../features/commands/registry.ts";
import { useContributions } from "../modules/registry.ts";
import { openLink } from "../modules/link-bus.ts";
import { usePalette } from "../features/commands/palette-store.ts";
import { isInstalling, startUpdateChecks, useUpdates } from "../store/update-store.ts";
import { updatePercent } from "./UpdateProgressBar.tsx";

interface MenuItem {
  label: string;
  shortcut?: string;
  action?: () => void;
  disabled?: boolean;
  separator?: boolean;
}

export const AppTitleBar: React.FC = () => {
  const { activeProject, activeTabId, closeTab, newSessionTab } = useSessionStore(
    useShallow((s) => ({
      activeProject: s.activeProject,
      activeTabId: s.activeTabId,
      closeTab: s.closeTab,
      newSessionTab: s.newSessionTab,
    })),
  );
  const ui = useUi(useShallow((s) => ({ openSettings: s.openSettings, toggleLeft: s.toggleLeft, toggleRight: s.toggleRight })));
  const [menu, setMenu] = useState<string | null>(null);
  const moduleMenuItems = useContributions("titleMenu");
  const [maximized, setMaximized] = useState(false);
  const update = useUpdates((s) => s.info);
  const install = useUpdates((s) => s.install);
  const installing = isInstalling(install);
  const installPct = install ? updatePercent(install) : null;
  const barRef = useRef<HTMLDivElement>(null);

  // Dynamic shortcut hints
  const kbdNewSession = useShortcut("session.new");
  const kbdOpenProject = useShortcut("project.open");
  const kbdCloseTab = useShortcut("tab.close");
  const kbdSettings = useShortcut("settings.open");
  const kbdPalette = useShortcut("palette.open");
  const kbdProjects = useShortcut("view.projects");
  const kbdFiles = useShortcut("view.files");
  const kbdGit = useShortcut("view.git");
  const kbdZoomIn = useShortcut("zoom.in");
  const kbdZoomOut = useShortcut("zoom.out");
  const kbdZoomReset = useShortcut("zoom.reset");

  useEffect(() => {
    const outside = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) setMenu(null);
    };
    window.addEventListener("mousedown", outside);
    void window.studio.isWindowMaximized().then(setMaximized).catch(() => {});
    const off = window.studio.onWindowMaximizedChange(setMaximized);
    // Background update checks: shortly after launch, then periodically and on window focus.
    const stopUpdates = startUpdateChecks();
    return () => {
      window.removeEventListener("mousedown", outside);
      off();
      stopUpdates();
    };
  }, []);

  const run = (fn: () => void) => () => {
    setMenu(null);
    fn();
  };

  const menus: Record<string, MenuItem[]> = {
    File: [
      { label: "New Session", shortcut: kbdNewSession, disabled: !activeProject, action: () => activeProject && void newSessionTab(activeProject.id) },
      { label: "Open Project Folder…", shortcut: kbdOpenProject, action: () => void openProjectFolder() },
      { label: "Close Tab", shortcut: kbdCloseTab, disabled: !activeTabId, action: () => activeTabId && void closeTab(activeTabId) },
      { separator: true, label: "" },
      { label: "Settings…", shortcut: kbdSettings, action: () => ui.openSettings() },
      { separator: true, label: "" },
      { label: "Exit", action: () => void window.studio.closeWindow() },
    ],
    Edit: [
      { label: "Undo", shortcut: "Ctrl+Z", action: () => document.execCommand("undo") },
      { label: "Redo", shortcut: "Ctrl+Y", action: () => document.execCommand("redo") },
      { separator: true, label: "" },
      { label: "Cut", shortcut: "Ctrl+X", action: () => document.execCommand("cut") },
      { label: "Copy", shortcut: "Ctrl+C", action: () => document.execCommand("copy") },
      { label: "Paste", shortcut: "Ctrl+V", action: () => document.execCommand("paste") },
    ],
    View: [
      { label: "Command Palette…", shortcut: kbdPalette, action: () => usePalette.getState().openPalette() },
      { separator: true, label: "" },
      { label: "Projects", shortcut: kbdProjects, action: () => ui.toggleLeft("projects") },
      { label: "Files", shortcut: kbdFiles, action: () => ui.toggleLeft("files") },
      { label: "Source Control", shortcut: kbdGit, action: () => ui.toggleLeft("git") },
      { separator: true, label: "" },
      { label: "Appearance…", action: () => ui.openSettings("appearance") },
      { label: "Zoom In", shortcut: kbdZoomIn, action: () => window.studio.zoom("in") },
      { label: "Zoom Out", shortcut: kbdZoomOut, action: () => window.studio.zoom("out") },
      { label: "Reset Zoom", shortcut: kbdZoomReset, action: () => window.studio.zoom("reset") },
    ],
    Help: [
      { label: "Pi Documentation", action: () => openLink("https://pi.dev", "Pi Documentation") },
      { label: "Hive on GitHub", action: () => openLink("https://github.com/AdielMag/Hive", "Hive on GitHub") },
      { label: "Release Notes", action: () => openLink("https://github.com/AdielMag/Hive/releases", "Release Notes") },
      { separator: true, label: "" },
      { label: "About Hive", action: () => ui.openSettings("about") },
    ],
  };

  // Module menu entries are appended to the matching built-in menu (File / View / Help).
  for (const item of moduleMenuItems) {
    const items = menus[item.menu];
    if (!items) continue;
    if (!items.some((it) => it.label === item.label)) {
      items.push({ label: item.label, shortcut: getShortcutLabel(item.command), action: () => void COMMANDS_BY_ID.get(item.command)?.run() });
    }
  }

  return (
    <div ref={barRef} className="titlebar">
      <div className="titlebar__menus no-drag">
        {Object.entries(menus).map(([name, items]) => (
          <div key={name} className="titlebar__menu">
            <button
              className={`titlebar__menu-btn${menu === name ? " is-open" : ""}`}
              onClick={() => setMenu(menu === name ? null : name)}
              onMouseEnter={() => menu && menu !== name && setMenu(name)}
            >
              {name}
            </button>
            {menu === name && (
              <div className="menu-pop" role="menu">
                {items.map((it, i) =>
                  it.separator ? (
                    <div key={i} className="menu-pop__sep" />
                  ) : (
                    <button key={i} role="menuitem" className="menu-pop__item" disabled={it.disabled} onClick={run(() => it.action?.())}>
                      <span>{it.label}</span>
                      {it.shortcut && <span className="menu-pop__kbd">{it.shortcut}</span>}
                    </button>
                  ),
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="titlebar__center">
        {activeProject ? (
          <span className="titlebar__project">
            <span className="titlebar__dot" style={{ background: activeProject.color }} />
            <FolderKanban size={12} />
            {activeProject.name}
          </span>
        ) : (
          <span className="titlebar__project is-muted">Hive</span>
        )}
        <button
          type="button"
          className="titlebar__search-trigger no-drag"
          onClick={() => usePalette.getState().openPalette()}
          title={`Quick search & commands (${kbdPalette ?? "Ctrl+K"})`}
        >
          <Search size={11} />
          <span>Search</span>
          <kbd>{kbdPalette ?? "Ctrl+K"}</kbd>
        </button>
      </div>

      <div className="titlebar__right no-drag">
        {update?.hasUpdate && (
          <button
            className={`titlebar__update${installing ? " is-installing" : ""}`}
            onClick={() => ui.openSettings("updates")}
            title={installing ? "Installing update — click for details" : `Hive v${update.latestVersion} is available — click for details`}
            style={installing ? ({ "--update-pct": `${installPct ?? 0}%` } as React.CSSProperties) : undefined}
          >
            <Download size={11} className={installing ? "update-progress__bounce" : undefined} />{" "}
            {installing
              ? install?.phase === "launching"
                ? "Restarting…"
                : installPct != null
                  ? `Updating ${installPct}%`
                  : "Updating…"
              : `Update v${update.latestVersion}`}
          </button>
        )}
        <button className="caption-btn" onClick={() => void window.studio.minimizeWindow()} title="Minimize" aria-label="Minimize">
          <Minus size={14} />
        </button>
        <button className="caption-btn" onClick={() => void window.studio.maximizeWindow()} title={maximized ? "Restore" : "Maximize"} aria-label={maximized ? "Restore" : "Maximize"}>
          {maximized ? <Copy size={11} /> : <Square size={11} />}
        </button>
        <button className="caption-btn caption-btn--close" onClick={() => void window.studio.closeWindow()} title="Close" aria-label="Close">
          <X size={15} />
        </button>
      </div>
    </div>
  );
};
