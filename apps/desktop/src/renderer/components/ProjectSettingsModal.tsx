/** Per-project settings: general (name, location), appearance (colour, icon), linked folders and removal. Opened from the project tab menu or the "+" switcher. */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ExternalLink, FolderOpen, Link2, Palette, Plus, Settings2, Trash2, X } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { DEFAULT_PROJECT_HUES, type LinkedProject } from "@hive/protocol";
import { useSessionStore } from "../store/session-store.ts";
import { useProjectSettings, type ProjectSettingsSection } from "../store/project-settings-store.ts";
import { askChoice } from "./ChoiceDialog.tsx";
import { toast } from "../modules/toast-store.ts";

interface Props {
  projectId: string;
  section: ProjectSettingsSection;
  onClose: () => void;
}

const folderName = (p: string) => p.split(/[/\\]/).filter(Boolean).pop() || p;
const PROJECT_ICON_PRESETS = ["🐝", "⚡", "🚀", "📦", "💻", "🌐", "🎯", "🔥", "🛠️", "📱", "🧠", "🎨"];

const NAV: { id: ProjectSettingsSection; label: string; icon: React.ReactNode }[] = [
  { id: "general", label: "General", icon: <Settings2 size={14} /> },
  { id: "appearance", label: "Appearance", icon: <Palette size={14} /> },
  { id: "folders", label: "Linked folders", icon: <Link2 size={14} /> },
  { id: "remove", label: "Remove", icon: <Trash2 size={14} /> },
];

export const ProjectSettingsModal: React.FC<Props> = ({ projectId, section: initialSection, onClose }) => {
  const { project, updateProject, removeProject, tabs, closeTab } = useSessionStore(
    useShallow((s) => ({
      project: s.projects.find((p) => p.id === projectId),
      updateProject: s.updateProject,
      removeProject: s.removeProject,
      tabs: s.tabs,
      closeTab: s.closeTab,
    })),
  );
  const [section, setSection] = useState<ProjectSettingsSection>(initialSection);
  const [name, setName] = useState(project?.name ?? "");
  const [iconDraft, setIconDraft] = useState(project?.icon ?? "");
  const nameRef = useRef(name);
  nameRef.current = name;

  useEffect(() => setSection(initialSection), [initialSection]);

  useEffect(() => {
    if (project) {
      setName(project.name);
      setIconDraft(project.icon ?? "");
    }
  }, [project?.name, project?.icon]);

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
    // Escape belongs to a confirm dialog opened on top of this one (e.g. Remove), not to the settings.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || document.querySelector(".choice-dialog")) return;
      handleClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleClose]);

  if (!project) return null;
  const links = project.links ?? [];

  const setLinks = (next: LinkedProject[]) => updateProject(project.id, { links: next });

  const setIcon = (icon: string | null) => {
    setIconDraft(icon ?? "");
    if ((project.icon ?? null) !== icon) void updateProject(project.id, { icon });
  };

  /** Commit the typed icon on blur / Enter. Keeps only the first grapheme so ZWJ and variation-selector emoji stay whole. */
  const commitIconDraft = () => {
    const typed = iconDraft.trim();
    const first = typed ? [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(typed)][0]?.segment : undefined;
    setIcon(first ?? null);
  };

  const addLink = async () => {
    const folder = await window.studio.pickFolder();
    if (!folder || links.some((l) => l.path === folder) || folder === project.path) return;
    await setLinks([...links, { path: folder, alias: folderName(folder), access: "read-only" }]);
  };

  const remove = async () => {
    const projectTabs = tabs.filter((t) => t.projectId === project.id);
    const transcripts = useSessionStore.getState().transcriptsByTab;
    const running = projectTabs.filter((t) => t.activeKey && transcripts[t.id]?.running).length;
    const body = [`"${project.name}" will be removed from Hive. The folder and its Pi sessions stay on disk.`];
    if (projectTabs.length > 0) {
      body.push(
        `${projectTabs.length} open tab${projectTabs.length === 1 ? "" : "s"} will be closed` +
          (running > 0 ? `, and ${running} running session${running === 1 ? "" : "s"} will be stopped.` : "."),
      );
    }
    const choice = await askChoice({
      title: `Remove ${project.name}?`,
      body,
      choices: [
        { id: "cancel", label: "Cancel" },
        { id: "remove", label: "Remove project", tone: "danger" },
      ],
    });
    if (choice !== "remove") return;
    try {
      for (const t of projectTabs) {
        if (t.activeKey) {
          try {
            await window.studio.stopSession(t.activeKey);
          } catch {}
        }
        await closeTab(t.id);
      }
      await removeProject(project.id);
      onClose();
    } catch (err) {
      toast({ kind: "error", message: `Couldn't remove ${project.name}: ${err instanceof Error ? err.message : String(err)}` });
    }
  };

  return createPortal(
    <div className="modal-scrim" onMouseDown={handleClose}>
      <div className="prj-settings" role="dialog" aria-label="Project settings" onMouseDown={(e) => e.stopPropagation()}>
        <header className="prj-settings__header">
          <span className="prj-settings__avatar" style={{ background: project.color }}>
            {project.icon ? project.icon : project.name.slice(0, 1).toUpperCase()}
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

        <div className="prj-settings__main">
          <nav className="prj-settings__nav" aria-label="Project settings sections">
            {NAV.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`prj-settings__nav-item${section === item.id ? " is-active" : ""}${item.id === "remove" ? " is-danger" : ""}`}
                aria-current={section === item.id ? "page" : undefined}
                onClick={() => setSection(item.id)}
              >
                {item.icon}
                <span className="prj-settings__nav-label">{item.label}</span>
                {item.id === "folders" && links.length > 0 && <span className="prj-settings__nav-count">{links.length}</span>}
              </button>
            ))}
          </nav>

          <div className="prj-settings__body">
            {section === "general" && (
              <div className="prj-settings__pane">
                <h3 className="prj-settings__pane-title">General</h3>
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
                  <span className="prj-settings__label">Location</span>
                  <div className="prj-settings__row">
                    <code className="prj-settings__code" title={project.path}>
                      {project.path}
                    </code>
                    <button type="button" className="ui-btn ui-btn--sm" onClick={() => void window.studio.showItemInFolder(project.path)}>
                      <ExternalLink size={12} /> Show in folder
                    </button>
                  </div>
                </div>
              </div>
            )}

            {section === "appearance" && (
              <div className="prj-settings__pane">
                <h3 className="prj-settings__pane-title">Appearance</h3>
                <div className="prj-settings__field">
                  <span className="prj-settings__label">Colour</span>
                  <div className="prj-settings__swatches" role="radiogroup" aria-label="Project colour">
                    {DEFAULT_PROJECT_HUES.map((c) => {
                      const selected = project.color === c;
                      return (
                        <button
                          key={c}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          className={`prj-swatch${selected ? " is-selected" : ""}`}
                          style={{ background: c }}
                          title={c}
                          aria-label={`Colour ${c}`}
                          onClick={() => void updateProject(project.id, { color: c })}
                        >
                          {selected && <Check size={12} />}
                        </button>
                      );
                    })}
                  </div>
                  <span className="prj-settings__hint">Tints this project's tab and its session tabs.</span>
                </div>

                <div className="prj-settings__field">
                  <span className="prj-settings__label">Icon</span>
                  <div className="prj-settings__icon-grid" role="radiogroup" aria-label="Project icon">
                    <button
                      type="button"
                      role="radio"
                      aria-checked={!project.icon}
                      className={`prj-icon-btn${!project.icon ? " is-selected" : ""}`}
                      title="Colour dot"
                      aria-label="Use colour dot"
                      onClick={() => setIcon(null)}
                    >
                      <span className="prj-settings__dot" style={{ background: project.color }} />
                    </button>
                    {PROJECT_ICON_PRESETS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        role="radio"
                        aria-checked={project.icon === emoji}
                        className={`prj-icon-btn${project.icon === emoji ? " is-selected" : ""}`}
                        onClick={() => setIcon(emoji)}
                        aria-label={`Use icon ${emoji}`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                  <div className="prj-settings__row">
                    <input
                      type="text"
                      className="prj-settings__input prj-settings__input--icon"
                      placeholder="Or type any emoji"
                      value={iconDraft}
                      onChange={(e) => setIconDraft(e.target.value)}
                      onBlur={commitIconDraft}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      }}
                    />
                    {project.icon && (
                      <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={() => setIcon(null)}>
                        Clear
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {section === "folders" && (
              <div className="prj-settings__pane">
                <div className="prj-settings__pane-head">
                  <h3 className="prj-settings__pane-title">Linked folders</h3>
                  <button className="ui-btn ui-btn--sm" onClick={() => void addLink()}>
                    <Plus size={12} /> Link folder
                  </button>
                </div>
                <p className="prj-settings__hint">
                  Related repositories Pi can reference while working here. Read-only folders can't be changed by Pi.
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
                          title="Show in folder"
                          aria-label={`Show ${lnk.alias || folderName(lnk.path)} in folder`}
                          onClick={() => void window.studio.showItemInFolder(lnk.path)}
                        >
                          <ExternalLink size={13} />
                        </button>
                        <button
                          className="ui-btn ui-btn--ghost ui-btn--sm ui-btn--icon"
                          title="Unlink folder"
                          aria-label={`Unlink ${lnk.alias || folderName(lnk.path)}`}
                          onClick={() => void setLinks(links.filter((l) => l.path !== lnk.path))}
                        >
                          <X size={13} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {section === "remove" && (
              <div className="prj-settings__pane">
                <h3 className="prj-settings__pane-title">Remove project</h3>
                <div className="prj-settings__danger-card">
                  <p className="prj-settings__hint">
                    Hides "{project.name}" from Hive. Files and Pi sessions stay on disk. Open tabs for this project close, and running
                    sessions stop.
                  </p>
                  <button className="ui-btn ui-btn--sm prj-settings__danger-btn" onClick={() => void remove()}>
                    <Trash2 size={12} /> Remove project
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

/** Mounted once in the workbench. Renders the dialog for whichever project the store points at. */
export const ProjectSettingsHost: React.FC = () => {
  const projectId = useProjectSettings((s) => s.projectId);
  const section = useProjectSettings((s) => s.section);
  const close = useProjectSettings((s) => s.close);
  const exists = useSessionStore((s) => (projectId ? s.projects.some((p) => p.id === projectId) : false));
  if (!projectId || !exists) return null;
  return <ProjectSettingsModal key={projectId} projectId={projectId} section={section} onClose={close} />;
};
