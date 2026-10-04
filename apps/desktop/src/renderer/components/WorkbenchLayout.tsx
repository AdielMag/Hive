/**
 * Arc-style workbench: the window frame (title bar, activity rails, side panels, status bar) is painted
 * with the theme gradient + grain; the editor area floats on top as a rounded content card.
 */
import React, { Suspense, lazy, useCallback, useRef, useState } from "react";
import {
  Files,
  FolderKanban,
  GitBranch,
  GitCommit,
  PieChart,
  Settings,
  Wrench,
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { Sidebar } from "./Sidebar.tsx";
import { FilesPanel } from "./FilesPanel.tsx";
import { WelcomeView } from "./WelcomeView.tsx";
import { TabStrip } from "./TabStrip.tsx";
import { Transcript } from "./Transcript.tsx";
import { Composer } from "./Composer.tsx";
import { ContextBreakdownPanel } from "./ContextBreakdownPanel.tsx";
import { AppTitleBar } from "./AppTitleBar.tsx";
import { StatusBar } from "./StatusBar.tsx";
import { ExtensionDialogModal } from "./ExtensionDialogModal.tsx";
import { QuestionFormModal } from "./QuestionFormModal.tsx";
import { ImagePreviewModal } from "./ImagePreviewModal.tsx";
import { ErrorBoundary } from "./ErrorBoundary.tsx";
import { SessionErrorBanner } from "./SessionErrorBanner.tsx";
import { useSessionStore } from "../store/session-store.ts";
import { useUi, type LeftPanel, type RightPanel } from "../store/ui-store.ts";
import { isCoreTabKind } from "@hive/protocol";
import { useContributions, useModules } from "../modules/registry.ts";
import { ModulePanelView, ModuleRailButton, ModuleRailItemButton, ModuleTabView } from "../modules/ModuleViews.tsx";
import { ToastHost } from "../modules/ToastHost.tsx";
import { OnboardingPicker } from "../features/modules/OnboardingPicker.tsx";
import { useKeybindings } from "../features/commands/useKeybindings.ts";
import { useShortcut } from "../features/commands/useShortcut.ts";
import { CommandPalette } from "../features/commands/CommandPalette.tsx";
import hiveIcon from "../assets/hive-icon.png";

// Heavy views load on demand to keep startup fast (xterm, charts, settings, file/diff viewers).
const named = <T extends string>(loader: () => Promise<Record<T, React.ComponentType<any>>>, key: T) =>
  lazy(() => loader().then((m) => ({ default: m[key] })));
const FileViewerTab = named(() => import("./FileViewerTab.tsx"), "FileViewerTab");
const DiffViewerTab = named(() => import("./DiffViewerTab.tsx"), "DiffViewerTab");
const SettingsModal = named(() => import("./SettingsModal.tsx"), "SettingsModal");
const GitPanel = named(() => import("./GitPanel.tsx"), "GitPanel");
const BranchesPanel = named(() => import("./BranchesPanel.tsx"), "BranchesPanel");
const ToolsPanel = named(() => import("./ToolsPanel.tsx"), "ToolsPanel");

const Loading: React.FC = () => <div className="ui-skeleton" style={{ margin: 16, height: 120, flex: "none" }} />;

export const WorkbenchLayout: React.FC = () => {
  useKeybindings();
  const projectsShortcut = useShortcut("view.projects");
  const filesShortcut = useShortcut("view.files");
  const gitShortcut = useShortcut("view.git");
  const settingsShortcut = useShortcut("settings.open");

  const { activeProject, tabs, activeTabId, error } = useSessionStore(
    useShallow((s) => ({
      activeProject: s.activeProject,
      tabs: s.tabs,
      activeTabId: s.activeTabId,
      error: s.error,
    })),
  );
  const ui = useUi(
    useShallow((s) => ({
      left: s.left,
      right: s.right,
      leftWidth: s.leftWidth,
      rightWidth: s.rightWidth,
      settingsOpen: s.settingsOpen,
      settingsTab: s.settingsTab,
      toggleLeft: s.toggleLeft,
      toggleRight: s.toggleRight,
      setSize: s.setSize,
      openSettings: s.openSettings,
      closeSettings: s.closeSettings,
    })),
  );
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const hasSession = Boolean(activeProject && tabs.some((t) => !t.kind || t.kind === "session"));
  const leftModulePanels = useContributions("leftPanels");
  const rightModulePanels = useContributions("rightPanels");
  const railItems = useContributions("railItems");
  const needsOnboarding = useModules((s) => s.ready && !s.onboarded);

  return (
    <div className="shell">
      <div className="shell__grain grain-overlay-bg" />
      <AppTitleBar />

      <div className="shell__body">
        {/* Left rail */}
        <nav className="rail">
          <div className="rail__brand" title="Hive">
            <img src={hiveIcon} alt="Hive" draggable={false} />
          </div>
          <RailButton
            icon={<FolderKanban size={18} />}
            title={projectsShortcut ? `Projects & Sessions (${projectsShortcut})` : "Projects & Sessions"}
            active={ui.left === "projects"}
            onClick={() => ui.toggleLeft("projects")}
          />
          <RailButton
            icon={<Files size={18} />}
            title={filesShortcut ? `Files (${filesShortcut})` : "Files"}
            active={ui.left === "files"}
            onClick={() => ui.toggleLeft("files")}
          />
          <RailButton
            icon={<GitCommit size={18} />}
            title={gitShortcut ? `Commits & Staging (${gitShortcut})` : "Commits & Staging"}
            active={ui.left === "git"}
            onClick={() => ui.toggleLeft("git")}
          />
          <RailButton
            icon={<GitBranch size={18} />}
            title="Branches & History"
            active={ui.left === "branches"}
            onClick={() => ui.toggleLeft("branches")}
          />
          {leftModulePanels.map((p) => (
            <ModuleRailButton key={`${p.moduleId}:${p.id}`} panel={p} active={ui.left === p.id} onClick={() => ui.toggleLeft(p.id)} />
          ))}
          <div className="rail__spacer" />
          {railItems.map((item) => (
            <ModuleRailItemButton key={`${item.moduleId}:${item.id}`} item={item} />
          ))}
          <RailButton
            icon={<Settings size={18} />}
            title={settingsShortcut ? `Settings (${settingsShortcut})` : "Settings"}
            active={ui.settingsOpen}
            onClick={() => ui.openSettings()}
          />
        </nav>

        {ui.left && (
          <SidePanel side="left" width={ui.leftWidth} onResize={(w) => ui.setSize({ leftWidth: w })}>
            <ErrorBoundary label="Side panel">
              <Suspense fallback={<Loading />}>
                <LeftPanelContent panel={ui.left} onClose={() => ui.toggleLeft(ui.left!)} />
              </Suspense>
            </ErrorBoundary>
          </SidePanel>
        )}

        {/* Content card */}
        <main className="card">
          <TabStrip />
          {error && <SessionErrorBanner error={error} />}
          <div className="card__content">
            <ErrorBoundary label="Editor" resetKey={activeTabId ?? ""}>
              <Suspense fallback={<Loading />}>
              {activeTab?.kind === "file" ? (
                <FileViewerTab tab={activeTab} />
              ) : activeTab?.kind === "diff" ? (
                <DiffViewerTab tab={activeTab} />
              ) : activeTab && !isCoreTabKind(activeTab.kind) ? (
                <ModuleTabView tab={activeTab} onClose={() => void useSessionStore.getState().closeTab(activeTab.id)} />
              ) : hasSession ? (
                <SessionView />
              ) : (
                <WelcomeView />
              )}
              </Suspense>
            </ErrorBoundary>
          </div>
        </main>

        {ui.right && (
          <SidePanel side="right" width={ui.rightWidth} onResize={(w) => ui.setSize({ rightWidth: w })}>
            <ErrorBoundary label="Side panel">
              <Suspense fallback={<Loading />}>
                <RightPanelContent panel={ui.right} onClose={() => ui.toggleRight(ui.right!)} />
              </Suspense>
            </ErrorBoundary>
          </SidePanel>
        )}

        {/* Right rail */}
        <nav className="rail rail--right">
          <RailButton icon={<Wrench size={18} />} title="Tools breakdown" active={ui.right === "tools"} onClick={() => ui.toggleRight("tools")} />
          <RailButton icon={<PieChart size={18} />} title="Context breakdown" active={ui.right === "context"} onClick={() => ui.toggleRight("context")} />
          {rightModulePanels.map((p) => (
            <ModuleRailButton key={`${p.moduleId}:${p.id}`} panel={p} active={ui.right === p.id} onClick={() => ui.toggleRight(p.id)} />
          ))}
        </nav>
      </div>

      <StatusBar />
      <ExtensionDialogModal />
      <QuestionFormModal />
      <ImagePreviewModal />
      <CommandPalette />
      <ToastHost />
      {needsOnboarding && <OnboardingPicker />}
      {ui.settingsOpen && (
        <Suspense fallback={null}>
          <SettingsModal isOpen initialTab={ui.settingsTab} onClose={ui.closeSettings} />
        </Suspense>
      )}
    </div>
  );
};

const LeftPanelContent: React.FC<{ panel: LeftPanel; onClose(): void }> = ({ panel, onClose }) =>
  panel === "projects" ? <Sidebar /> : panel === "files" ? <FilesPanel /> : panel === "branches" ? <BranchesPanel /> : panel === "git" ? <GitPanel /> : <ModulePanelView side="left" panelId={panel} onClose={onClose} />;

const RightPanelContent: React.FC<{ panel: RightPanel; onClose(): void }> = ({ panel, onClose }) =>
  panel === "tools" ? <ToolsPanel /> : panel === "context" ? <ContextBreakdownPanel /> : <ModulePanelView side="right" panelId={panel} onClose={onClose} />;

const SessionView: React.FC = () => {
  const composerHeight = useUi((s) => s.composerHeight);
  const setSize = useUi((s) => s.setSize);
  const startDrag = useDrag("row", (dy, start) => setSize({ composerHeight: start - dy }), () => composerHeight);
  return (
    <div className="session-view">
      <Transcript />
      <div className="resizer resizer--row" onMouseDown={startDrag} title="Drag to resize" />
      <Composer height={composerHeight} />
    </div>
  );
};

const SidePanel: React.FC<{ side: "left" | "right"; width: number; onResize(w: number): void; children: React.ReactNode }> = ({ side, width, onResize, children }) => {
  const start = useDrag("col", (dx, w0) => onResize(side === "left" ? w0 + dx : w0 - dx), () => width);
  return (
    <aside className={`panel panel--${side}`} style={{ width }}>
      <div className="panel__inner">{children}</div>
      <div className={`resizer resizer--col resizer--${side}`} onMouseDown={start} />
    </aside>
  );
};

/** Pointer drag helper that shields iframes/xterm from stealing events with a full-screen overlay. */
function useDrag(axis: "row" | "col", onMove: (delta: number, start: number) => void, getStart: () => number) {
  const moveRef = useRef(onMove);
  moveRef.current = onMove;
  const [, setDragging] = useState(false);
  return useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const origin = axis === "col" ? e.clientX : e.clientY;
      const start = getStart();
      const overlay = document.createElement("div");
      overlay.className = `drag-overlay drag-overlay--${axis}`;
      document.body.appendChild(overlay);
      setDragging(true);
      let raf = 0;
      const move = (ev: MouseEvent) => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => moveRef.current((axis === "col" ? ev.clientX : ev.clientY) - origin, start));
      };
      const up = () => {
        overlay.remove();
        setDragging(false);
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
      };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
    },
    [axis, getStart],
  );
}

const RailButton: React.FC<{ icon: React.ReactNode; title: string; active: boolean; onClick(): void }> = ({ icon, title, active, onClick }) => (
  <button className={`rail__btn${active ? " is-active" : ""}`} onClick={onClick} title={title} aria-label={title} aria-pressed={active}>
    {icon}
  </button>
);
