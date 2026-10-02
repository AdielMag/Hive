import React, { useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Bot,
  Check,
  Code2,
  Copy,
  Cpu,
  ExternalLink,
  FileCode,
  FolderOpen,
  Info,
  List,
  Maximize2,
  Minimize2,
  Shield,
  Sparkles,
  Terminal,
  Wrench,
} from "lucide-react";
import type { LibraryEntry, LibraryFieldValue } from "@pi-studio/protocol";
import { useLibraryStore } from "./library-store.ts";
import { useSessionStore } from "../../store/session-store.ts";
import { ModelPicker } from "./ModelPicker.tsx";
import { ThinkingSelect } from "./ThinkingSelect.tsx";
import { SectionCard } from "./SectionCard.tsx";
import { CodeBlock } from "../../components/code/CodeBlock.tsx";
import { copyText } from "../../lib/clipboard.ts";

interface Props {
  entry: LibraryEntry;
}

export const LibraryDetail: React.FC<Props> = ({ entry }) => {
  const {
    snapshot,
    selectEntry,
    updateField,
    savingField,
    feedback,
    viewMode,
    setViewMode,
  } = useLibraryStore();
  // Narrow selectors: the session store updates on every streamed token.
  const activeProject = useSessionStore((s) => s.activeProject);
  const openFileTab = useSessionStore((s) => s.openFileTab);

  const [copiedPath, setCopiedPath] = useState(false);
  const [expandAll, setExpandAll] = useState(true);

  const cwd = activeProject?.path;

  // Cross references:
  // 1. If entry is a skill: which agents list it in their `skills:` frontmatter?
  const agentsPreloadingThisSkill = useMemo(() => {
    if (entry.kind !== "skill" || !snapshot) return [];
    return snapshot.entries.filter((e) => {
      if (e.kind !== "agent") return false;
      const s = e.frontmatter.skills;
      if (typeof s === "string") {
        return s.split(",").map((x) => x.trim().toLowerCase()).includes(entry.name.toLowerCase());
      }
      if (Array.isArray(s)) {
        return s.map((x) => String(x).trim().toLowerCase()).includes(entry.name.toLowerCase());
      }
      return false;
    });
  }, [entry, snapshot]);

  // 2. If entry is an agent: which skills are in its `skills:` frontmatter?
  const skillsPreloadedByThisAgent = useMemo(() => {
    if (entry.kind !== "agent" || !snapshot) return [];
    const s = entry.frontmatter.skills;
    let list: string[] = [];
    if (typeof s === "string") {
      list = s.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
    } else if (Array.isArray(s)) {
      list = s.map((x) => String(x).trim().toLowerCase()).filter(Boolean);
    }
    if (list.length === 0) return [];
    return list.map((skillName) => {
      const found = snapshot.entries.find((e) => e.kind === "skill" && e.name.toLowerCase() === skillName);
      return { name: skillName, entry: found ?? null };
    });
  }, [entry, snapshot]);

  const handleCopyPath = async () => {
    if (!entry.path) return;
    await copyText(entry.path);
    setCopiedPath(true);
    setTimeout(() => setCopiedPath(false), 1500);
  };

  const handleReveal = () => {
    if (entry.path) {
      void window.studio.revealLibraryPath(entry.path, cwd);
    }
  };

  const handleOpenInEditor = () => {
    if (entry.path) {
      void openFileTab(entry.path, activeProject?.id || "", entry.name + ".md");
    }
  };

  const handleOpenSupportingFile = (relPath: string) => {
    if (!entry.path) return;
    const fullPath = entry.path.replace(/[/\\]SKILL\.md$/, "") + "/" + relPath;
    void openFileTab(fullPath, activeProject?.id || "", relPath.split("/").pop());
  };

  // Helper to save a frontmatter field
  const handleSaveField = async (key: string, value: LibraryFieldValue) => {
    await updateField(entry, key, value, cwd);
  };

  const isSavingModel = savingField === "model";
  const isSavingThinking = savingField === "thinking";
  const isSavingEnabled = savingField === "enabled";

  // Frontmatter tools
  const toolsList = useMemo(() => {
    const raw = entry.frontmatter.tools;
    if (typeof raw === "string") {
      return raw.split(",").map((t) => t.trim()).filter(Boolean);
    }
    if (Array.isArray(raw)) {
      return raw.map((t) => String(t).trim()).filter(Boolean);
    }
    return [];
  }, [entry.frontmatter.tools]);

  const disallowedToolsList = useMemo(() => {
    const raw = entry.frontmatter.disallowed_tools;
    if (typeof raw === "string") {
      return raw.split(",").map((t) => t.trim()).filter(Boolean);
    }
    if (Array.isArray(raw)) {
      return raw.map((t) => String(t).trim()).filter(Boolean);
    }
    return [];
  }, [entry.frontmatter.disallowed_tools]);

  return (
    <div className="lib-detail">
      {/* Detail Header */}
      <header className="lib-detail__header">
        <div className="lib-detail__header-top">
          <div className="lib-detail__title-row">
            <div
              className={`lib-detail__avatar lib-detail__avatar--${entry.kind}`}
              style={entry.color ? { background: entry.color, color: "#fff" } : undefined}
            >
              {entry.kind === "skill" ? <Sparkles size={18} /> : <Bot size={18} />}
            </div>
            <div>
              <div className="lib-detail__name-badges">
                <h1 className="lib-detail__title">{entry.displayName || entry.name}</h1>
                <span className={`lib-badge lib-badge--${entry.kind}`}>{entry.kind}</span>
                <span className={`lib-badge lib-badge--scope lib-badge--${entry.scope}`}>{entry.scope}</span>
                {entry.readOnly && <span className="lib-badge lib-badge--readonly">read-only</span>}
                {entry.shadowed && <span className="lib-badge lib-badge--shadowed">overridden</span>}
              </div>
              <div className="lib-detail__handle text-muted">
                {entry.kind === "agent" ? `@${entry.name}` : entry.name}
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="lib-detail__actions">
            {entry.path && (
              <>
                <button
                  type="button"
                  className="ui-btn ui-btn--sm"
                  onClick={handleCopyPath}
                  title="Copy full filesystem path"
                >
                  {copiedPath ? <Check size={12} className="text-success" /> : <Copy size={12} />}
                  <span>{copiedPath ? "Copied" : "Copy Path"}</span>
                </button>
                <button
                  type="button"
                  className="ui-btn ui-btn--sm"
                  onClick={handleReveal}
                  title="Show file in folder"
                >
                  <FolderOpen size={12} />
                  <span>Reveal</span>
                </button>
                <button
                  type="button"
                  className="ui-btn ui-btn--sm ui-btn--primary"
                  onClick={handleOpenInEditor}
                  title="Open in Pi Studio code editor"
                >
                  <FileCode size={12} />
                  <span>Open in Editor</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Path breadcrumb */}
        {entry.path && (
          <div className="lib-detail__path-bar text-muted">
            <span className="lib-detail__path-label">Location:</span>
            <code className="lib-detail__path-code">{entry.path}</code>
          </div>
        )}

        {/* Description */}
        {entry.description && (
          <p className="lib-detail__desc">{entry.description}</p>
        )}
      </header>

      {/* Warning Banners */}
      {entry.parseError && (
        <div className="lib-banner lib-banner--error">
          <AlertCircle size={16} />
          <div>
            <strong>YAML Parse Error:</strong> {entry.parseError}
          </div>
        </div>
      )}

      {entry.warnings && entry.warnings.length > 0 && (
        <div className="lib-banner lib-banner--warning">
          <AlertTriangle size={16} />
          <div>
            {entry.warnings.map((w, i) => (
              <div key={i}>{w}</div>
            ))}
          </div>
        </div>
      )}

      {entry.shadowed && entry.overriddenBy && (
        <div className="lib-banner lib-banner--info">
          <Info size={16} />
          <div className="lib-banner__content">
            <span>
              This definition is <strong>overridden</strong> by a higher-priority project file:
            </span>
            <code className="lib-banner__code">{entry.overriddenBy}</code>
            {snapshot && (
              <button
                type="button"
                className="ui-btn ui-btn--sm"
                onClick={() => {
                  const target = snapshot.entries.find((e) => e.path === entry.overriddenBy);
                  if (target) selectEntry(target.id);
                }}
              >
                Go to overriding definition <ArrowRight size={12} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Feedback banner (e.g. Saved / Error) */}
      {feedback && (
        <div className={`lib-banner lib-banner--${feedback.type}`}>
          {feedback.type === "success" ? <Check size={16} /> : <AlertTriangle size={16} />}
          <div>{feedback.message}</div>
        </div>
      )}

      {/* Main Body Grid */}
      <div className="lib-detail__body">
        {/* Quick Config Card */}
        {entry.kind === "agent" && (
          <div className="lib-card ui-card">
            <div className="lib-card__header">
              <div className="lib-card__title">
                <Cpu size={15} />
                <span>Agent Configuration</span>
              </div>
              {entry.readOnly && <span className="lib-card__sub text-muted">Built-in defaults cannot be edited</span>}
            </div>

            <div className="lib-card__grid">
              {/* Model */}
              <div className="lib-field">
                <label className="lib-field__label">
                  Model
                  <span className="lib-field__hint text-muted">Subagent model override</span>
                </label>
                <div className="lib-field__control">
                  <ModelPicker
                    currentValue={typeof entry.frontmatter.model === "string" ? entry.frontmatter.model : null}
                    disabled={entry.readOnly || isSavingModel}
                    onSelect={(modelKey) => handleSaveField("model", modelKey)}
                  />
                </div>
              </div>

              {/* Thinking Level */}
              <div className="lib-field">
                <label className="lib-field__label">
                  Thinking Level
                  <span className="lib-field__hint text-muted">Reasoning budget</span>
                </label>
                <div className="lib-field__control">
                  <ThinkingSelect
                    currentValue={typeof entry.frontmatter.thinking === "string" ? entry.frontmatter.thinking : null}
                    disabled={entry.readOnly || isSavingThinking}
                    onSelect={(level) => handleSaveField("thinking", level)}
                  />
                </div>
              </div>

              {/* Enabled toggle */}
              {!entry.readOnly && (
                <div className="lib-field">
                  <label className="lib-field__label">
                    Status
                    <span className="lib-field__hint text-muted">Enable or disable subagent</span>
                  </label>
                  <div className="lib-field__control">
                    <label className="lib-toggle-row">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={entry.frontmatter.enabled !== false}
                        className={`ui-switch ${entry.frontmatter.enabled !== false ? "is-active" : ""}`}
                        disabled={isSavingEnabled}
                        onClick={() => handleSaveField("enabled", entry.frontmatter.enabled === false ? true : false)}
                      >
                        <span className="ui-switch__thumb" />
                      </button>
                      <span className="lib-toggle-label">
                        {entry.frontmatter.enabled !== false ? "Enabled" : "Disabled (hidden from tool listings)"}
                      </span>
                    </label>
                  </div>
                </div>
              )}

              {/* Max Turns */}
              {!entry.readOnly && (
                <div className="lib-field">
                  <label className="lib-field__label">
                    Max Turns
                    <span className="lib-field__hint text-muted">Turn limit (0 or empty = unlimited)</span>
                  </label>
                  <div className="lib-field__control">
                    <input
                      type="number"
                      min={0}
                      max={500}
                      className="lib-input"
                      placeholder="Unlimited"
                      defaultValue={typeof entry.frontmatter.max_turns === "number" ? entry.frontmatter.max_turns : ""}
                      onBlur={(e) => {
                        const val = e.target.value.trim();
                        const num = Number(val);
                        if (!val || num <= 0) {
                          if (entry.frontmatter.max_turns !== undefined) handleSaveField("max_turns", null);
                        } else if (Number.isFinite(num)) {
                          handleSaveField("max_turns", Math.round(num));
                        }
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Skill Card Info */}
        {entry.kind === "skill" && (
          <div className="lib-card ui-card">
            <div className="lib-card__header">
              <div className="lib-card__title">
                <Sparkles size={15} />
                <span>Skill Configuration</span>
              </div>
            </div>

            <div className="lib-skill-note">
              <Info size={14} className="text-muted" />
              <span>
                Pi skills are automatically invoked by the session model when needed. They operate under the
                active conversation&apos;s model and parameters.
              </span>
            </div>

            {/* disable-model-invocation toggle */}
            {!entry.readOnly && (
              <div className="lib-card__grid" style={{ marginTop: 12 }}>
                <div className="lib-field">
                  <label className="lib-field__label">
                    Autonomous Invocation
                    <span className="lib-field__hint text-muted">
                      When disabled, the model will not invoke this skill automatically
                    </span>
                  </label>
                  <div className="lib-field__control">
                    <label className="lib-toggle-row">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={!Boolean(entry.frontmatter["disable-model-invocation"])}
                        className={`ui-switch ${!Boolean(entry.frontmatter["disable-model-invocation"]) ? "is-active" : ""}`}
                        onClick={() =>
                          handleSaveField(
                            "disable-model-invocation",
                            entry.frontmatter["disable-model-invocation"] ? null : true,
                          )
                        }
                      >
                        <span className="ui-switch__thumb" />
                      </button>
                      <span className="lib-toggle-label">
                        {Boolean(entry.frontmatter["disable-model-invocation"])
                          ? "Model invocation disabled"
                          : "Allowed for model invocation"}
                      </span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* Supporting Files */}
            {entry.supportingFiles && entry.supportingFiles.length > 0 && (
              <div className="lib-supporting-files">
                <div className="lib-supporting-files__title">
                  <FileCode size={13} />
                  <span>Supporting Files ({entry.supportingFiles.length})</span>
                </div>
                <div className="lib-supporting-files__list">
                  {entry.supportingFiles.map((file) => (
                    <button
                      key={file}
                      type="button"
                      className="lib-supporting-file-btn ui-btn ui-btn--sm"
                      onClick={() => handleOpenSupportingFile(file)}
                      title={`Open ${file} in editor`}
                    >
                      <Code2 size={12} />
                      <span>{file}</span>
                      <ExternalLink size={10} className="text-muted" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Agents preloading this skill */}
            {agentsPreloadingThisSkill.length > 0 && (
              <div className="lib-cross-ref">
                <div className="lib-cross-ref__title">
                  <Bot size={13} />
                  <span>Preloaded by Agents:</span>
                </div>
                <div className="lib-cross-ref__chips">
                  {agentsPreloadingThisSkill.map((ag) => (
                    <button
                      key={ag.id}
                      type="button"
                      className="lib-chip lib-chip--clickable"
                      onClick={() => selectEntry(ag.id)}
                      title={`Open agent @${ag.name}`}
                    >
                      <Bot size={11} /> {ag.displayName || ag.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Cross references for Agent: Skills it preloads */}
        {entry.kind === "agent" && skillsPreloadedByThisAgent.length > 0 && (
          <div className="lib-card ui-card">
            <div className="lib-card__header">
              <div className="lib-card__title">
                <Sparkles size={15} />
                <span>Preloaded Skills ({skillsPreloadedByThisAgent.length})</span>
              </div>
            </div>
            <div className="lib-cross-ref__chips" style={{ padding: "8px 12px 14px" }}>
              {skillsPreloadedByThisAgent.map((sk) => (
                <button
                  key={sk.name}
                  type="button"
                  className={`lib-chip ${sk.entry ? "lib-chip--clickable" : ""}`}
                  disabled={!sk.entry}
                  onClick={() => sk.entry && selectEntry(sk.entry.id)}
                  title={sk.entry ? `Open skill ${sk.name}` : `Skill ${sk.name} not found in library`}
                >
                  <Sparkles size={11} /> {sk.name}
                  {!sk.entry && <span className="text-muted" style={{ marginLeft: 4 }}>(missing)</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Tools & Properties card */}
        {(toolsList.length > 0 || disallowedToolsList.length > 0 || Boolean(entry.frontmatter.prompt_mode) || Boolean(entry.frontmatter.isolation)) && (
          <div className="lib-card ui-card">
            <div className="lib-card__header">
              <div className="lib-card__title">
                <Wrench size={15} />
                <span>Tools & Permissions</span>
              </div>
            </div>

            <div className="lib-card__grid">
              {toolsList.length > 0 && (
                <div className="lib-field">
                  <label className="lib-field__label">Allowed Tools</label>
                  <div className="lib-chips-wrap">
                    {toolsList.map((t) => (
                      <span key={t} className="lib-chip lib-chip--tool">
                        <Terminal size={10} /> {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {disallowedToolsList.length > 0 && (
                <div className="lib-field">
                  <label className="lib-field__label">Disallowed Tools</label>
                  <div className="lib-chips-wrap">
                    {disallowedToolsList.map((t) => (
                      <span key={t} className="lib-chip lib-chip--disallowed">
                        <Shield size={10} /> {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {Boolean(entry.frontmatter.prompt_mode) && (
                <div className="lib-field">
                  <label className="lib-field__label">Prompt Mode</label>
                  <div className="text-secondary" style={{ fontSize: 12 }}>
                    <code>{String(entry.frontmatter.prompt_mode)}</code>
                    <span className="text-muted" style={{ marginLeft: 8 }}>
                      {entry.frontmatter.prompt_mode === "append"
                        ? "(parent twin — appends to parent prompt)"
                        : "(standalone — replaces parent prompt)"}
                    </span>
                  </div>
                </div>
              )}

              {Boolean(entry.frontmatter.isolation) && (
                <div className="lib-field">
                  <label className="lib-field__label">Filesystem Isolation</label>
                  <div className="text-secondary" style={{ fontSize: 12 }}>
                    <code>{String(entry.frontmatter.isolation)}</code>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Markdown Sections Container */}
        <div className="lib-sections-container">
          <div className="lib-sections-toolbar">
            <div className="lib-sections-toolbar__left">
              <List size={16} />
              <h2 className="lib-sections-toolbar__title">Content Sections</h2>
              <span className="lib-badge">{entry.sections.length}</span>
            </div>

            <div className="lib-sections-toolbar__right">
              {viewMode === "sections" && (
                <>
                  <button
                    type="button"
                    className="ui-btn ui-btn--ghost ui-btn--sm"
                    onClick={() => setExpandAll(true)}
                  >
                    <Maximize2 size={12} />
                    <span>Expand all</span>
                  </button>
                  <button
                    type="button"
                    className="ui-btn ui-btn--ghost ui-btn--sm"
                    onClick={() => setExpandAll(false)}
                  >
                    <Minimize2 size={12} />
                    <span>Collapse all</span>
                  </button>
                </>
              )}

              <div className="ui-seg">
                <button
                  type="button"
                  aria-pressed={viewMode === "sections"}
                  onClick={() => setViewMode("sections")}
                >
                  Sections
                </button>
                <button
                  type="button"
                  aria-pressed={viewMode === "raw"}
                  onClick={() => setViewMode("raw")}
                >
                  Raw source
                </button>
              </div>
            </div>
          </div>

          {/* Quick Jump Table of Contents (for sections view) */}
          {viewMode === "sections" && entry.sections.length > 2 && (
            <nav className="lib-toc ui-card">
              <span className="lib-toc__label text-muted">Jump to section:</span>
              <div className="lib-toc__links">
                {entry.sections.map((sec) => (
                  <a
                    key={sec.slug}
                    href={`#section-${sec.slug}`}
                    className="lib-toc__link"
                    onClick={(e) => {
                      e.preventDefault();
                      const el = document.getElementById(`section-${sec.slug}`);
                      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                  >
                    {sec.title}
                  </a>
                ))}
              </div>
            </nav>
          )}

          {/* Sections View */}
          {viewMode === "sections" ? (
            <div className="lib-sections-list">
              {entry.sections.length === 0 ? (
                <div className="lib-sections-empty text-muted">
                  <p>This definition has no markdown body.</p>
                </div>
              ) : (
                entry.sections.map((section) => (
                  <SectionCard
                    key={section.slug}
                    section={section}
                    defaultExpanded={expandAll}
                  />
                ))
              )}
            </div>
          ) : (
            /* Raw Markdown View */
            <div className="lib-raw-view ui-card">
              <CodeBlock
                code={entry.raw}
                language="markdown"
                fileName={entry.name + ".md"}
                collapseAfter={0}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
