import React, { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, FolderPlus, FolderKanban } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import type { ProjectEntry } from "@hive/protocol";
import { useSessionStore } from "../store/session-store.ts";
import { openProjectFolder } from "../features/commands/registry.ts";

export const ProjectPicker: React.FC = () => {
  const { projects, activeProject, setActiveProject, newSessionTab } = useSessionStore(
    useShallow((s) => ({
      projects: s.projects,
      activeProject: s.activeProject,
      setActiveProject: s.setActiveProject,
      newSessionTab: s.newSessionTab,
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
      const st = useSessionStore.getState();
      const hasTab = st.tabs.some((t) => t.projectId === p.id);
      if (!hasTab) {
        void newSessionTab(p.id);
      } else {
        const firstTab = st.tabs.find((t) => t.projectId === p.id);
        if (firstTab) void st.switchTab(firstTab.id);
      }
    }
  };

  const handleOpenFolder = () => {
    setOpen(false);
    void openProjectFolder();
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
            <span className="project-picker__dot" style={{ background: activeProject.color }} />
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
        </div>
      )}
    </div>
  );
};
