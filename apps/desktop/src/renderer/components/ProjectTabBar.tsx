import React, { useEffect, useMemo, useRef, useState } from "react";
import { Settings2, X } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import type { ProjectEntry } from "@hive/protocol";
import { useSessionStore } from "../store/session-store.ts";
import { useProjectSettings } from "../store/project-settings-store.ts";
import { ProjectPicker } from "./ProjectPicker.tsx";
import { ContextMenu, type ContextMenuEntry, type ContextMenuState } from "./ContextMenu.tsx";
import { getFileManagerLabel } from "../lib/platform.ts";
import { playUiSound } from "../store/sound-store.ts";

export const ProjectTabBar: React.FC = () => {
  const {
    openProjectIds,
    projects,
    activeProject,
    openProjectTab,
    closeProjectTab,
    reorderProjectTabs,
    closeOtherProjectTabs,
    closeProjectTabsToRight,
  } = useSessionStore(
    useShallow((s) => ({
      openProjectIds: s.openProjectIds,
      projects: s.projects,
      activeProject: s.activeProject,
      openProjectTab: s.openProjectTab,
      closeProjectTab: s.closeProjectTab,
      reorderProjectTabs: s.reorderProjectTabs,
      closeOtherProjectTabs: s.closeOtherProjectTabs,
      closeProjectTabsToRight: s.closeProjectTabsToRight,
    })),
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const [dropIndicatorLeft, setDropIndicatorLeft] = useState<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const [draggedProjectId, setDraggedProjectId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const openProjects = useMemo(() => {
    const map = new Map(projects.map((p) => [p.id, p]));
    const list: ProjectEntry[] = [];
    for (const id of openProjectIds) {
      const p = map.get(id);
      if (p) list.push(p);
    }
    return list;
  }, [projects, openProjectIds]);

  // Mouse wheel horizontal scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY !== 0 && !e.shiftKey) {
        el.scrollLeft += e.deltaY;
      }
    };
    el.addEventListener("wheel", handleWheel, { passive: true });
    return () => el.removeEventListener("wheel", handleWheel);
  }, []);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const container = scrollRef.current;
    if (!container) return;

    const tabEls = Array.from(container.querySelectorAll<HTMLElement>(".project-tab"));
    if (tabEls.length === 0) {
      setDropIndicatorLeft(0);
      setDropTargetIndex(0);
      return;
    }

    const containerRect = container.getBoundingClientRect();
    let targetIdx = tabEls.length;
    let indicatorX = container.scrollLeft + containerRect.width;

    for (let i = 0; i < tabEls.length; i++) {
      const el = tabEls[i]!;
      const r = el.getBoundingClientRect();
      const mid = r.left + r.width / 2;
      if (e.clientX < mid) {
        targetIdx = i;
        indicatorX = r.left - containerRect.left + container.scrollLeft;
        break;
      } else if (i === tabEls.length - 1 && e.clientX <= r.right + 20) {
        targetIdx = tabEls.length;
        indicatorX = r.right - containerRect.left + container.scrollLeft;
      }
    }

    setDropIndicatorLeft(indicatorX);
    setDropTargetIndex(targetIdx);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    const container = scrollRef.current;
    if (!container) return;
    const r = container.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX >= r.right || e.clientY < r.top || e.clientY >= r.bottom) {
      setDropIndicatorLeft(null);
      setDropTargetIndex(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const pid = e.dataTransfer.getData("application/x-hive-project-tab") || draggedProjectId;
    const targetIdx = dropTargetIndex ?? openProjects.length;

    setDropIndicatorLeft(null);
    setDropTargetIndex(null);
    setDraggedProjectId(null);

    if (!pid) return;
    const fromIdx = openProjects.findIndex((p) => p.id === pid);
    if (fromIdx !== -1) {
      const adjustedTarget = fromIdx < targetIdx ? targetIdx - 1 : targetIdx;
      reorderProjectTabs(fromIdx, Math.min(Math.max(0, adjustedTarget), openProjects.length - 1));
    }
  };

  const handleContextMenu = (e: React.MouseEvent, project: ProjectEntry, index: number) => {
    e.preventDefault();
    const items: ContextMenuEntry[] = [
      {
        label: "Project Settings…",
        icon: <Settings2 size={13} />,
        onSelect: () => useProjectSettings.getState().open(project.id, "general"),
      },
      { kind: "separator" },
      {
        label: "Close Project Tab",
        icon: <X size={13} />,
        onSelect: () => void closeProjectTab(project.id),
      },
    ];

    if (openProjects.length > 1) {
      items.push({
        label: "Close Other Projects",
        onSelect: () => void closeOtherProjectTabs(project.id),
      });
      if (index < openProjects.length - 1) {
        items.push({
          label: "Close Projects to the Right",
          onSelect: () => void closeProjectTabsToRight(project.id),
        });
      }
    }

    items.push({ kind: "separator" });
    items.push({
      label: getFileManagerLabel(),
      onSelect: () => void window.studio.showItemInFolder(project.path),
    });
    items.push({
      label: "Copy Path",
      onSelect: () => void navigator.clipboard.writeText(project.path),
    });

    setContextMenu({ x: e.clientX, y: e.clientY, items });
  };

  return (
    <div className="project-tab-bar no-drag">
      <div
        ref={scrollRef}
        className="project-tab-bar__scroll"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {dropIndicatorLeft !== null && (
          <div className="project-tab-bar__drop-indicator" style={{ left: dropIndicatorLeft }} />
        )}
        {openProjects.map((p, idx) => {
          const isActive = activeProject?.id === p.id;
          return (
            <div
              key={p.id}
              className={`project-tab${isActive ? " is-active" : ""}`}
              draggable={true}
              onDragStart={(e) => {
                e.dataTransfer.setData("application/x-hive-project-tab", p.id);
                e.dataTransfer.effectAllowed = "move";
                setDraggedProjectId(p.id);
              }}
              onDragEnd={() => {
                setDropIndicatorLeft(null);
                setDropTargetIndex(null);
                setDraggedProjectId(null);
              }}
              onClick={() => {
                if (!isActive) {
                  playUiSound("tab_switch");
                  void openProjectTab(p.id);
                }
              }}
              onAuxClick={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                  void closeProjectTab(p.id);
                }
              }}
              onContextMenu={(e) => handleContextMenu(e, p, idx)}
              title={p.path}
            >
              {p.icon ? (
                <span className="project-tab__emoji">{p.icon}</span>
              ) : (
                <span className="project-tab__dot" style={{ background: p.color }} />
              )}
              <span className="project-tab__name">{p.name}</span>
              <button
                type="button"
                className="project-tab__close"
                onClick={(e) => {
                  e.stopPropagation();
                  void closeProjectTab(p.id);
                }}
                title="Close project tab"
                aria-label={`Close ${p.name}`}
              >
                <X size={11} />
              </button>
            </div>
          );
        })}
      </div>

      <ProjectPicker mode="dropdown-trigger" />

      {contextMenu && (
        <ContextMenu
          menu={contextMenu}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
};
