import React, { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, FolderPlus, FolderKanban, Link2, X } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import type { ProjectEntry } from "@hive/protocol";
import { useSessionStore } from "../store/session-store.ts";
import { openProjectFolder } from "../features/commands/registry.ts";

const folderName = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() || p;

export const ProjectPicker: React.FC = () => {
  const { projects, activeProject, setActiveProject, newSessionTab, updateProject } = useSessionStore(
    useShallow((s) => ({
      projects: s.projects,
      activeProject: s.activeProject,
      setActiveProject: s.setActiveProject,
      newSessionTab: s.newSessionTab,
      updateProject: s.updateProject,
    })),
  );
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", handleOutside);
    return () => window.removeEventListener("mousedown", handleOutside);
  }, []);

  const handleSelect = (p: ProjectEntry) => {
    setOpen(false);
    if (activeProject?.id !== p.id) {
      void setActiveProject(p);
    }
    const st = useSessionStore.getState();
    const hasTab = st.tabs.some((t) => t.projectId === p.id);
    if (!hasTab) {
      void newSessionTab(p.id);
    } else {
      const firstTab = st.tabs.find((t) => t.projectId === p.id);
      if (firstTab && st.activeTabId !== firstTab.id) void st.switchTab(firstTab.id);
    }
  };

  const handleOpenFolder = () => {
    setOpen(false);
    void openProjectFolder();
  };

  const links = activeProject?.links ?? [];

  const handleLinkFolder = async () => {
    if (!activeProject) return;
    setOpen(false);
    const folder = await window.studio.pickFolder();
    if (!folder || folder === activeProject.path || links.some((l) => l.path === folder)) return;
    await updateProject(activeProject.id, {
      links: [...links, { path: folder, alias: folderName(folder), access: "read-only" }],
    });
  };

  const handleUnlink = (path: string) => {
    if (!activeProject) return;
    void updateProject(activeProject.id, { links: links.filter((l) => l.path !== path) });
  };

  return (
    <div ref={containerRef} className="project-picker no-drag">
      <button
        type="button"
        className={`project-picker__trigger${open ? " is-open" : ""}`}
        onClick={() => setOpen(!open)}
        title="Select Project"
      >
        {activeProject ? (
          <>
            <FolderKanban size={13} className="project-picker__icon" />
            <span className="project-picker__name">{activeProject.name}</span>
          </>
        ) : (
          <>
            <FolderKanban size={13} className="project-picker__icon is-muted" />
            <span className="project-picker__name is-muted">Select Project…</span>
          </>
        )}
        <ChevronDown size={12} className="project-picker__caret" />
      </button>

      {open && (
        <div className="project-picker__dropdown" role="menu">
          <div className="project-picker__section-title">Projects</div>
          <div className="project-picker__list">
            {projects.map((p) => {
              const isSelected = activeProject?.id === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="menuitem"
                  className={`project-picker__item${isSelected ? " is-selected" : ""}`}
                  onClick={() => handleSelect(p)}
                >
                  <span className="project-picker__dot" style={{ background: p.color }} />
                  <span className="project-picker__item-name" title={p.path}>
                    {p.name}
                  </span>
                  {isSelected && <Check size={13} className="project-picker__check" />}
                </button>
              );
            })}
          </div>
          <div className="project-picker__divider" />
          <button
            type="button"
            role="menuitem"
            className="project-picker__item project-picker__item--action"
            onClick={handleOpenFolder}
          >
            <FolderPlus size={13} />
            <span>Open folder…</span>
          </button>
          {activeProject && (
            <>
              <div className="project-picker__divider" />
              <div className="project-picker__section-title">Linked folders · {activeProject.name}</div>
              {links.length > 0 && (
                <div className="project-picker__list">
                  {links.map((l) => (
                    <div key={l.path} className="project-picker__item project-picker__link" title={l.path}>
                      <Link2 size={12} />
                      <span className="project-picker__item-name">{l.alias || folderName(l.path)}</span>
                      <button
                        type="button"
                        className="project-picker__unlink"
                        aria-label={`Unlink ${l.alias || folderName(l.path)}`}
                        onClick={() => handleUnlink(l.path)}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button
                type="button"
                role="menuitem"
                className="project-picker__item project-picker__item--action"
                onClick={() => void handleLinkFolder()}
              >
                <Link2 size={13} />
                <span>Link folder to workspace…</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};
