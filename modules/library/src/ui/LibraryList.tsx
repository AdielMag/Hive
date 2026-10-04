import React, { useMemo } from "react";
import { AlertTriangle, Bot, EyeOff, Filter, Search, Sparkles, Trash2, X } from "lucide-react";
import type { LibraryEntry, LibraryScope } from "@hive/protocol";
import { useLibraryStore } from "./library-store.ts";
import { libraryHost } from "./library-host.ts";

const SCOPES: Array<{ id: LibraryScope; label: string }> = [
  { id: "project", label: "Project" },
  { id: "global", label: "Global" },
  { id: "builtin", label: "Built-in" },
];

const scopeRank = (s: LibraryScope) => (s === "project" ? 0 : s === "global" ? 1 : 2);

const prettyModel = (raw?: unknown): string | null => {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const parts = raw.split("/");
  return parts.length > 1 ? parts.slice(1).join("/") : raw;
};

export const LibraryList: React.FC = () => {
  const {
    snapshot,
    selectedId,
    selectEntry,
    searchQuery,
    setSearchQuery,
    filterKind,
    setFilterKind,
    filterScope,
    setFilterScope,
    showOverridden,
    setShowOverridden,
    deleteEntry,
    deletingId,
  } = useLibraryStore();

  const activeProject = libraryHost().sessions.activeProject();
  const cwd = activeProject?.path;

  const handleDeleteEntry = async (entry: LibraryEntry) => {
    if (entry.readOnly || !entry.path || deletingId === entry.id) return;
    const kindLabel = entry.kind === "skill" ? "skill" : "agent";
    const nameLabel = entry.displayName || entry.name;
    const ok = window.confirm(
      `Delete ${kindLabel} "${nameLabel}"?\n\nThe file will be moved to the system trash.`,
    );
    if (!ok) return;
    await deleteEntry(entry, cwd);
  };

  const entries = snapshot?.entries ?? [];
  const overriddenCount = useMemo(() => entries.filter((e) => e.shadowed).length, [entries]);
  // Overridden copies are noise for most users: hide them unless asked (or the selected one is overridden).
  const base = useMemo(
    () => (showOverridden ? entries : entries.filter((e) => !e.shadowed || e.id === selectedId)),
    [entries, showOverridden, selectedId],
  );

  const counts = useMemo(() => {
    const c = { all: 0, skill: 0, agent: 0, project: 0, global: 0, builtin: 0 };
    // Counts are "active" definitions (same as the header); overridden copies have their own count.
    for (const e of base) {
      if (e.shadowed) continue;
      c.all++;
      c[e.kind]++;
      c[e.scope]++;
    }
    return c;
  }, [base]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return base
      .filter((e) => {
        if (filterKind !== "all" && e.kind !== filterKind) return false;
        if (filterScope !== "all" && e.scope !== filterScope) return false;
        if (!q) return true;
        return (
          e.name.toLowerCase().includes(q) ||
          (e.displayName?.toLowerCase().includes(q) ?? false) ||
          (e.description?.toLowerCase().includes(q) ?? false) ||
          (typeof e.frontmatter.tools === "string" && e.frontmatter.tools.toLowerCase().includes(q)) ||
          (typeof e.frontmatter.model === "string" && e.frontmatter.model.toLowerCase().includes(q)) ||
          e.body.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (a.shadowed !== b.shadowed) return a.shadowed ? 1 : -1;
        if (scopeRank(a.scope) !== scopeRank(b.scope)) return scopeRank(a.scope) - scopeRank(b.scope);
        return (a.displayName || a.name).localeCompare(b.displayName || b.name);
      });
  }, [base, filterKind, filterScope, searchQuery]);

  const groups = useMemo(() => {
    if (filterKind !== "all") return [{ kind: filterKind, items: filtered }];
    return (["agent", "skill"] as const)
      .map((kind) => ({ kind, items: filtered.filter((e) => e.kind === kind) }))
      .filter((g) => g.items.length > 0);
  }, [filtered, filterKind]);

  const visibleScopes = SCOPES.filter((s) => counts[s.id] > 0 || filterScope === s.id);
  const isFiltered = Boolean(searchQuery) || filterKind !== "all" || filterScope !== "all";

  return (
    <aside className="lib-sidebar">
      <div className="lib-sidebar__search">
        <div className="lib-sidebar__search-box">
          <Search size={13} className="text-muted" />
          <input type="text" placeholder="Search name, description, model…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          {searchQuery && (
            <button className="lib-sidebar__clear-btn" onClick={() => setSearchQuery("")} title="Clear search" aria-label="Clear search">
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      <div className="lib-sidebar__filters">
        <div className="lib-sidebar__kind-seg ui-seg" role="group" aria-label="Kind">
          {(
            [
              ["all", "All", counts.all],
              ["agent", "Agents", counts.agent],
              ["skill", "Skills", counts.skill],
            ] as const
          ).map(([id, label, n]) => (
            <button key={id} type="button" aria-pressed={filterKind === id} onClick={() => setFilterKind(id)}>
              {label} <span className="lib-sidebar__badge">{n}</span>
            </button>
          ))}
        </div>

        <div className="lib-sidebar__subfilters">
          {visibleScopes.length > 1 || filterScope !== "all" ? (
            <div className="lib-scope-tabs" role="group" aria-label="Scope (click again to clear)">
              {visibleScopes.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`lib-scope-tabs--${s.id} ${filterScope === s.id ? "is-active" : ""}`}
                  aria-pressed={filterScope === s.id}
                  title={filterScope === s.id ? "Show all scopes" : `Only ${s.label.toLowerCase()} definitions`}
                  onClick={() => setFilterScope(filterScope === s.id ? "all" : s.id)}
                >
                  {s.label} <span className="lib-scope-tabs__n">{counts[s.id]}</span>
                </button>
              ))}
            </div>
          ) : (
            <span />
          )}
          {overriddenCount > 0 && (
            <label className="lib-overridden-toggle" title="Definitions hidden because a higher-priority copy with the same name exists">
              <input type="checkbox" checked={showOverridden} onChange={(e) => setShowOverridden(e.target.checked)} />
              <span>
                Overridden <span className="lib-scope-tabs__n">{overriddenCount}</span>
              </span>
            </label>
          )}
        </div>
      </div>

      <div className="lib-sidebar__items">
        {filtered.length === 0 ? (
          <div className="lib-sidebar__empty text-muted">
            <Filter size={20} className="lib-sidebar__empty-icon" />
            <p>No matching skills or agents</p>
            {isFiltered && (
              <button
                type="button"
                className="ui-btn ui-btn--sm"
                onClick={() => {
                  setSearchQuery("");
                  setFilterKind("all");
                  setFilterScope("all");
                }}
              >
                Reset filters
              </button>
            )}
          </div>
        ) : (
          groups.map((g) => (
            <div key={g.kind} className="lib-group">
              {filterKind === "all" && (
                <div className="lib-group__header">
                  {g.kind === "agent" ? <Bot size={11} /> : <Sparkles size={11} />}
                  {g.kind === "agent" ? "Agents" : "Skills"}
                  <span className="lib-group__count">{g.items.length}</span>
                </div>
              )}
              {g.items.map((entry) => (
                <LibraryRow
                  key={entry.id}
                  entry={entry}
                  selected={entry.id === selectedId}
                  onSelect={() => selectEntry(entry.id)}
                  onDelete={() => void handleDeleteEntry(entry)}
                  isDeleting={deletingId === entry.id}
                />
              ))}
            </div>
          ))
        )}
      </div>
    </aside>
  );
};

const LibraryRow: React.FC<{
  entry: LibraryEntry;
  selected: boolean;
  onSelect(): void;
  onDelete?(): void;
  isDeleting?: boolean;
}> = ({ entry, selected, onSelect, onDelete, isDeleting }) => {
  const model = entry.kind === "agent" ? prettyModel(entry.frontmatter.model) : null;
  const thinking = entry.kind === "agent" && typeof entry.frontmatter.thinking === "string" ? entry.frontmatter.thinking : null;
  const disabled = entry.frontmatter.enabled === false;
  const meta = [model, thinking].filter(Boolean).join(" · ");

  return (
    <div
      className={`lib-item${selected ? " is-selected" : ""}${entry.shadowed ? " is-shadowed" : ""}${disabled ? " is-disabled" : ""}`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      aria-current={selected || undefined}
      title={entry.description || entry.name}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        } else if ((e.key === "Delete" || e.key === "Backspace") && !entry.readOnly && entry.path && onDelete) {
          e.preventDefault();
          onDelete();
        }
      }}
    >
      <div
        className={`lib-item__kind-icon lib-item__kind-icon--${entry.kind}`}
        style={entry.kind === "agent" && entry.color ? { background: entry.color, color: "#fff" } : undefined}
      >
        {entry.kind === "skill" ? <Sparkles size={12} /> : <Bot size={12} />}
      </div>

      <div className="lib-item__content">
        <div className="lib-item__top">
          <span className="lib-item__title">{entry.displayName || entry.name}</span>
          {entry.parseError && <AlertTriangle size={11} className="lib-item__flag is-error" aria-label="Parse error" />}
          {disabled && <EyeOff size={11} className="lib-item__flag" aria-label="Disabled" />}
          {entry.scope !== "global" && <span className={`lib-item__scope lib-item__scope--${entry.scope}`}>{entry.scope === "builtin" ? "built-in" : entry.scope}</span>}
          {entry.shadowed && <span className="lib-item__scope lib-item__scope--shadowed">overridden</span>}
          {!entry.readOnly && entry.path && onDelete && (
            <button
              type="button"
              className="lib-item__delete-btn"
              title={`Delete ${entry.kind}`}
              aria-label={`Delete ${entry.displayName || entry.name}`}
              disabled={isDeleting}
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
            >
              <Trash2 size={11} />
            </button>
          )}
        </div>
        {entry.description && <div className="lib-item__desc">{entry.description}</div>}
        {meta && <div className="lib-item__meta">{meta}</div>}
      </div>
    </div>
  );
};
