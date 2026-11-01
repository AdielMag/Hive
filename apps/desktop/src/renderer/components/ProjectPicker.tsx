import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, FolderKanban, FolderPlus, Plus, Settings2 } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import type { ProjectEntry } from "@hive/protocol";
import { useSessionStore } from "../store/session-store.ts";
import { useProjectSettings } from "../store/project-settings-store.ts";
import { openProjectFolder } from "../features/commands/registry.ts";

export interface ProjectPickerProps {
  mode?: "picker" | "dropdown-trigger";
}

/** Project switcher. `dropdown-trigger` is the "+" in the tab bar; `picker` is the title-bar trigger used when tabs are off. */
export const ProjectPicker: React.FC<ProjectPickerProps> = ({ mode = "picker" }) => {
  const { projects, activeProject, openProjectIds, openProjectTab } = useSessionStore(
    useShallow((s) => ({
      projects: s.projects,
      activeProject: s.activeProject,
      openProjectIds: s.openProjectIds,
      openProjectTab: s.openProjectTab,
    })),
  );
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", handleOutside);
    return () => window.removeEventListener("mousedown", handleOutside);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => p.name.toLowerCase().includes(q) || p.path.toLowerCase().includes(q));
  }, [projects, query]);

  const hi = filtered.length > 0 ? Math.min(highlight, filtered.length - 1) : 0;

  // Escape closes the menu from anywhere (focus can be on a gear button, or on nothing when there are no projects).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setQuery("");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Keep the keyboard-highlighted row visible while arrowing through a long list.
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${hi}"]`)?.scrollIntoView({ block: "nearest" });
  }, [hi, open]);

  const openMenu = () => {
    const current = projects.findIndex((p) => p.id === activeProject?.id);
    setQuery("");
    setHighlight(Math.max(0, current));
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
    setQuery("");
  };

  const handleSelect = (p: ProjectEntry) => {
    close();
    void openProjectTab(p.id);
  };

  const handleSettings = (p: ProjectEntry) => {
    close();
    useProjectSettings.getState().open(p.id, "general");
  };

  const handleOpenFolder = () => {
    close();
    void openProjectFolder();
  };

  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (filtered.length === 0) return;
      const step = e.key === "ArrowDown" ? 1 : -1;
      setHighlight((hi + step + filtered.length) % filtered.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const p = filtered[hi];
      if (p) handleSelect(p);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  };

  return (
    <div ref={containerRef} className={`project-picker no-drag${mode === "dropdown-trigger" ? " project-picker--compact" : ""}`}>
      {mode === "dropdown-trigger" ? (
        <button
          type="button"
          className={`project-tab-bar__dropdown-btn${open ? " is-open" : ""}`}
          onClick={() => (open ? close() : openMenu())}
          title="Switch or open a project"
          aria-label="Switch or open a project"
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <Plus size={15} />
        </button>
      ) : (
        <button
          type="button"
          className={`project-picker__trigger${open ? " is-open" : ""}`}
          onClick={() => (open ? close() : openMenu())}
          title="Select Project"
        >
          {activeProject ? (
            <>
              {activeProject.icon ? (
                <span className="project-picker__emoji">{activeProject.icon}</span>
              ) : (
                <span className="project-picker__dot" style={{ background: activeProject.color }} />
              )}
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
      )}

      {open && (
        <div className="project-picker__dropdown" role="menu" aria-label="Projects">
          {projects.length > 0 && (
            <input
              className="project-picker__search"
              placeholder="Find a project"
              aria-label="Find a project"
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setHighlight(0);
              }}
              onKeyDown={onSearchKey}
            />
          )}

          <div className="project-picker__list" ref={listRef}>
            {filtered.length === 0 && (
              <div className="project-picker__empty">{projects.length === 0 ? "No projects yet." : "No projects match."}</div>
            )}
            {filtered.map((p, idx) => {
              const isSelected = activeProject?.id === p.id;
              const isOpenTab = openProjectIds.includes(p.id);
              return (
                <div
                  key={p.id}
                  className={`project-picker__row${idx === hi ? " is-highlighted" : ""}`}
                  onMouseEnter={() => setHighlight(idx)}
                >
                  <button
                    type="button"
                    role="menuitem"
                    data-idx={idx}
                    className={`project-picker__item${isSelected ? " is-selected" : ""}`}
                    onClick={() => handleSelect(p)}
                    title={p.path}
                  >
                    {p.icon ? (
                      <span className="project-picker__emoji">{p.icon}</span>
                    ) : (
                      <span className="project-picker__dot" style={{ background: p.color }} />
                    )}
                    <span className="project-picker__item-name">{p.name}</span>
                    {isSelected ? (
                      <Check size={13} className="project-picker__check" />
                    ) : isOpenTab ? (
                      <span className="project-picker__open-badge">Open</span>
                    ) : null}
                  </button>
                  <button
                    type="button"
                    className="project-picker__gear"
                    title="Project settings"
                    aria-label={`${p.name} settings`}
                    onClick={() => handleSettings(p)}
                  >
                    <Settings2 size={13} />
                  </button>
                </div>
              );
            })}
          </div>

          <div className="project-picker__divider" />
          <button type="button" role="menuitem" className="project-picker__item project-picker__item--action" onClick={handleOpenFolder}>
            <FolderPlus size={13} />
            <span>Open folder…</span>
          </button>
        </div>
      )}
    </div>
  );
};
