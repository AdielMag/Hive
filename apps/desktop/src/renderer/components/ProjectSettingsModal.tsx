/** Per-project settings: name, color, linked folders, and removal. Opened from the sidebar project row. */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FolderOpen, Link2, Plus, Settings2, Trash2, X } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { DEFAULT_PROJECT_HUES, type LinkedProject } from "@hive/protocol";
import { useSessionStore } from "../store/session-store.ts";

export type ProjectSettingsSection = "general" | "links";

interface Props {
  projectId: string;
  initialSection?: ProjectSettingsSection;
  onClose: () => void;
}

const folderName = (p: string) => p.split(/[/\\]/).filter(Boolean).pop() || p;

export const ProjectSettingsModal: React.FC<Props> = ({ projectId, initialSection = "general", onClose }) => {
  const { project, updateProject, removeProject, tabs, closeTab } = useSessionStore(
    useShallow((s) => ({
      project: s.projects.find((p) => p.id === projectId),
      updateProject: s.updateProject,
      removeProject: s.removeProject,
      tabs: s.tabs,
      closeTab: s.closeTab,
    })),
  );
  const [name, setName] = useState(project?.name ?? "");
  const linksRef = useRef<HTMLElement>(null);
  const nameRef = useRef(name);
  nameRef.current = name;

  const commitName = useCallback(() => {
    if (!project) return;
    const next = nameRef.current.trim();
    if (!next) {
      setName(project.name);
      return;
    }
    if (next !== project.name) void updateProject(project.id, { name: next });
  }, [project, updateProject]);

  const handleClose = useCallback(() => {
    commitName();
    onClose();
  }, [commitName, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && handleClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleClose]);

  useEffect(() => {
    if (initialSection === "links") linksRef.current?.scrollIntoView({ block: "start" });
  }, [initialSection]);

  useEffect(() => {
    if (project) setName(project.name);
  }, [project?.name]);

  if (!project) return null;
  const links = project.links ?? [];

  const setLinks = (next: LinkedProject[]) => updateProject(project.id, { links: next });

  const addLink = async () => {
    const folder = await window.studio.pickFolder();
    if (!folder || links.some((l) => l.path === folder) || folder === project.path) return;
    await setLinks([...links, { path: folder, alias: folderName(folder), access: "read-only" }]);
  };

  const remove = async () => {
    if (!confirm(`Remove "${project.name}" from Hive?\n\nThe folder and its Pi sessions stay on disk.`)) return;
    for (const t of tabs.filter((t) => t.projectId === project.id)) {
      if (t.activeKey) {
        try {
          await window.studio.stopSession(t.activeKey);
        } catch {}
      }
      await closeTab(t.id);
    }
    await removeProject(project.id);
    onClose();
  };

  return createPortal(
    <div className="modal-scrim" onMouseDown={handleClose}>
      <div className="prj-settings" role="dialog" aria-label="Project settings" onMouseDown={(e) => e.stopPropagation()}>
        <header className="prj-settings__header">
          <span className="prj-settings__avatar" style={{ background: project.color }}>
            {project.name.slice(0, 1).toUpperCase()}
          </span>
          <div className="prj-settings__heading">
            <div className="prj-settings__title">{project.name}</div>
            <div className="prj-settings__path" title={project.path}>
              {project.path}
            </div>
          </div>
          <button className="ui-btn ui-btn--ghost ui-btn--icon" onClick={handleClose} aria-label="Close">
            <X size={16} />
          </button>
        </header>

        <div className="prj-settings__body">
          <section className="prj-settings__section">
            <div className="prj-settings__section-head">
              <Settings2 size={13} />
              <span className="ui-section-label">General</span>
            </div>
            <label className="prj-settings__field">
              <span className="prj-settings__label">Name</span>
              <input
                className="prj-settings__input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={commitName}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
              />
            </label>
            <div className="prj-settings__field">
              <span className="prj-settings__label">Color</span>
              <div className="prj-settings__swatches">
                {DEFAULT_PROJECT_HUES.map((c) => (
                  <button
                    key={c}
                    className={`prj-swatch${project.color === c ? " is-selected" : ""}`}
                    style={{ background: c }}
                    aria-label={`Use color ${c}`}
                    onClick={() => void updateProject(project.id, { color: c })}
                  />
                ))}
              </div>
            </div>
          </section>

          <section className="prj-settings__section" ref={linksRef}>
            <div className="prj-settings__section-head">
              <Link2 size={13} />
              <span className="ui-section-label">Linked folders</span>
              {links.length > 0 && <span className="ui-chip ui-chip--accent">{links.length}</span>}
              <span style={{ flex: 1 }} />
              <button className="ui-btn ui-btn--sm" onClick={() => void addLink()}>
                <Plus size={12} /> Link folder
              </button>
            </div>
            <p className="prj-settings__hint">
              Related repositories or folders that Pi can reference while working in this project.
            </p>

            {links.length === 0 ? (
              <div className="prj-settings__empty">
                <FolderOpen size={16} />
                <span>No linked folders yet.</span>
              </div>
            ) : (
              <ul className="prj-links">
                {links.map((lnk) => (
                  <li key={lnk.path} className="prj-link">
                    <FolderOpen size={14} className="prj-link__icon" />
                    <div className="prj-link__text">
                      <span className="prj-link__alias">{lnk.alias || folderName(lnk.path)}</span>
                      <span className="prj-link__path" title={lnk.path}>
                        {lnk.path}
                      </span>
                    </div>
                    <div className="ui-seg prj-link__access" role="group" aria-label="Access">
                      {(["read-only", "read-write"] as const).map((a) => (
                        <button
                          key={a}
                          aria-pressed={lnk.access === a}
                          onClick={() => void setLinks(links.map((l) => (l.path === lnk.path ? { ...l, access: a } : l)))}
                        >
                          {a === "read-only" ? "Read" : "Read/Write"}
                        </button>
                      ))}
                    </div>
                    <button
                      className="ui-btn ui-btn--ghost ui-btn--sm ui-btn--icon"
                      title="Unlink folder"
                      onClick={() => void setLinks(links.filter((l) => l.path !== lnk.path))}
                    >
                      <X size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="prj-settings__section prj-settings__danger">
            <div className="prj-settings__danger-text">
              <span className="prj-settings__label">Remove project</span>
              <span className="prj-settings__hint">Hides it from Hive. Files and sessions stay on disk.</span>
            </div>
            <button className="ui-btn ui-btn--sm prj-settings__danger-btn" onClick={() => void remove()}>
              <Trash2 size={12} /> Remove
            </button>
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
};
