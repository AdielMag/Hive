/**
 * Arc-style workbench: the window frame (title bar, activity rails, side panels, status bar) is painted
 * with the theme gradient + grain; the editor area floats on top as a rounded content card.
 */
import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MessageSquare, Settings } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { SessionsPanel } from "./SessionsPanel.tsx";
import { UsagePanel } from "./UsagePanel.tsx";
import { OnboardingGate } from "./OnboardingGate.tsx";
import { AppTitleBar } from "./AppTitleBar.tsx";
import { StatusBar } from "./StatusBar.tsx";
import { ExtensionDialogModal } from "./ExtensionDialogModal.tsx";
import { QuestionFormModal } from "./QuestionFormModal.tsx";
import { ImagePreviewModal } from "./ImagePreviewModal.tsx";
import { ChoiceDialogHost } from "./ChoiceDialog.tsx";
import { SubagentDetailModal } from "./SubagentDetailModal.tsx";
import { ErrorBoundary } from "./ErrorBoundary.tsx";
import { SessionErrorBanner } from "./SessionErrorBanner.tsx";
import { useSessionStore } from "../store/session-store.ts";
import { useUi, type LeftPanel, type RightPanel } from "../store/ui-store.ts";
import { useContributions, useModules } from "../modules/registry.ts";
import { ModulePanelView, ModuleRailButton, ModuleRailItemButton } from "../modules/ModuleViews.tsx";
import { ToastHost } from "../modules/ToastHost.tsx";
import { OnboardingPicker } from "../features/modules/OnboardingPicker.tsx";
import { useKeybindings } from "../features/commands/useKeybindings.ts";
import { useShortcut } from "../features/commands/useShortcut.ts";
import { CommandPalette } from "../features/commands/CommandPalette.tsx";
import { WorkbenchSplitTree } from "./WorkbenchSplitTree.tsx";
import { usePaneLayoutStore, findLeaf } from "../store/pane-layout-store.ts";
import hiveIcon from "../assets/hive-icon.png";

// Heavy views load on demand to keep startup fast (xterm, charts, settings, file/diff viewers).
const named = <T extends string>(loader: () => Promise<Record<T, React.ComponentType<any>>>, key: T) =>
  lazy(() => loader().then((m) => ({ default: m[key] })));
const SettingsModal = named(() => import("./SettingsModal.tsx"), "SettingsModal");

const Loading: React.FC = () => <div className="ui-skeleton" style={{ margin: 16, height: 120, flex: "none" }} />;

export const WorkbenchLayout: React.FC = () => {
  useKeybindings();
  const projectsShortcut = useShortcut("view.projects");
  const settingsShortcut = useShortcut("settings.open");

  const { tabs, activeTabId, error, switchTab, projects } = useSessionStore(
    useShallow((s) => ({
      tabs: s.tabs,
      activeTabId: s.activeTabId,
      error: s.error,
      switchTab: s.switchTab,
      projects: s.projects,
    })),
  );
  const tabIdsKey = tabs.map((t) => t.id).join(",");
  const tabIds = useMemo(() => (tabIdsKey ? tabIdsKey.split(",") : []), [tabIdsKey]);
  const root = usePaneLayoutStore((s) => s.root);
  const activePaneId = usePaneLayoutStore((s) => s.activePaneId);
  const setActivePaneId = usePaneLayoutStore((s) => s.setActivePaneId);
  const syncWithTabs = usePaneLayoutStore((s) => s.syncWithTabs);

  useEffect(() => {
    syncWithTabs(tabIds, activeTabId);
  }, [tabIds, activeTabId, syncWithTabs]);
  const ui = useUi(
    useShallow((s) => ({
      left: s.left,
      right: s.right,
      leftWidth: s.leftWidth,
      rightWidth: s.rightWidth,
      bottom: s.bottom,
      bottomHeight: s.bottomHeight,
      toggleBottom: s.toggleBottom,
      settingsOpen: s.settingsOpen,
      settingsTab: s.settingsTab,
      toggleLeft: s.toggleLeft,
      toggleRight: s.toggleRight,
      setSize: s.setSize,
      openSettings: s.openSettings,
      closeSettings: s.closeSettings,
    })),
  );
  const leftModulePanels = useContributions("leftPanels");
  const rightModulePanels = useContributions("rightPanels");
  const bottomModulePanels = useContributions("bottomPanels");
  const railItems = useContributions("railItems");
  const needsOnboarding = useModules((s) => s.ready && !s.onboarded);

  const terminalPanel = bottomModulePanels.find((p) => p.id === "terminal");
  const leftBottomPanels = bottomModulePanels.filter((p) => p.id !== "terminal");

  return (
    <div className="shell">
      {projects.length === 0 && <OnboardingGate />}
      <div className="shell__grain grain-overlay-bg" />
      <AppTitleBar />

      <div className="shell__body">
        {/* Left rail */}
        <nav className="rail">
          <div className="rail__brand" title="Hive">
            <img src={hiveIcon} alt="Hive" draggable={false} />
          </div>
          <RailButton
            icon={<MessageSquare size={18} />}
            title={projectsShortcut ? `Sessions (${projectsShortcut})` : "Sessions"}
            active={ui.left === "projects"}
            onClick={() => ui.toggleLeft("projects")}
          />
          {leftModulePanels.map((p) => (
            <ModuleRailButton key={`${p.moduleId}:${p.id}`} panel={p} active={ui.left === p.id} onClick={() => ui.toggleLeft(p.id)} />
          ))}
          {leftBottomPanels.length > 0 && <div className="rail__divider" />}
          {leftBottomPanels.map((p) => (
            <ModuleRailButton key={`${p.moduleId}:${p.id}`} panel={p} active={ui.bottom === p.id} onClick={() => ui.toggleBottom(p.id)} />
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

        <div className="center">
        {/* Content card */}
        <main className="card">
          {error && <SessionErrorBanner error={error} />}
          <div className="card__content">
            <WorkbenchSplitTree
              node={root}
              activePaneId={activePaneId}
              setActivePaneId={(id) => {
                // Read fresh state: callers may have just changed the pane's active tab in the same tick.
                setActivePaneId(id);
                const leaf = findLeaf(usePaneLayoutStore.getState().root, id);
                if (leaf?.activeTabId && leaf.activeTabId !== useSessionStore.getState().activeTabId) {
                  void switchTab(leaf.activeTabId);
                }
              }}
            />
          </div>
        </main>

        {ui.bottom && (
          <BottomDock height={ui.bottomHeight} onResize={(h) => ui.setSize({ bottomHeight: h })}>
            <ErrorBoundary label="Bottom panel">
              <Suspense fallback={<Loading />}>
                <ModulePanelView side="bottom" panelId={ui.bottom} onClose={() => ui.toggleBottom(ui.bottom!)} />
              </Suspense>
            </ErrorBoundary>
          </BottomDock>
        )}
        </div>

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
          {rightModulePanels.map((p) => (
            <ModuleRailButton key={`${p.moduleId}:${p.id}`} panel={p} active={ui.right === p.id} onClick={() => ui.toggleRight(p.id)} />
          ))}
          <div className="rail__spacer" />
          {terminalPanel && (
            <ModuleRailButton
              key={`${terminalPanel.moduleId}:${terminalPanel.id}`}
              panel={terminalPanel}
              active={ui.bottom === terminalPanel.id}
              onClick={() => ui.toggleBottom(terminalPanel.id)}
            />
          )}
        </nav>
      </div>

      <StatusBar />
      <ExtensionDialogModal />
      <QuestionFormModal />
      <ImagePreviewModal />
      <ChoiceDialogHost />
      <SubagentDetailModal />
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
  panel === "projects" ? <SessionsPanel /> : <ModulePanelView side="left" panelId={panel} onClose={onClose} />;

const RightPanelContent: React.FC<{ panel: RightPanel; onClose(): void }> = ({ panel, onClose }) =>
  panel === "usage" ? <UsagePanel onClose={onClose} /> : <ModulePanelView side="right" panelId={panel} onClose={onClose} />;

const SidePanel: React.FC<{ side: "left" | "right"; width: number; onResize(w: number): void; children: React.ReactNode }> = ({ side, width, onResize, children }) => {
  const start = useDrag("col", (dx, w0) => onResize(side === "left" ? w0 + dx : w0 - dx), () => width);
  return (
    <aside className={`panel panel--${side}`} style={{ width }}>
      <div className="panel__inner">{children}</div>
      <div className={`resizer resizer--col resizer--${side}`} onMouseDown={start} />
    </aside>
  );
};

/** Rider-style tool-window dock under the editor card; drag the top edge to resize. */
const BottomDock: React.FC<{ height: number; onResize(h: number): void; children: React.ReactNode }> = ({ height, onResize, children }) => {
  const start = useDrag("row", (dy, h0) => onResize(h0 - dy), () => height);
  return (
    <section className="dock dock--bottom" style={{ height }}>
      <div className="resizer resizer--dock" onMouseDown={start} />
      <div className="dock__inner">{children}</div>
    </section>
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

const RailButton: React.FC<{
  icon: React.ReactNode;
  title: string;
  active: boolean;
  onClick(): void;
  badge?: React.ReactNode;
}> = ({ icon, title, active, onClick, badge }) => (
  <button className={`rail__btn${active ? " is-active" : ""}`} onClick={onClick} title={title} aria-label={title} aria-pressed={active}>
    <span className="rail__icon-wrap">
      {icon}
      {badge}
    </span>
  </button>
);
