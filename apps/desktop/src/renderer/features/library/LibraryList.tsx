import React, { useMemo } from "react";
import {
  AlertTriangle,
  Bot,
  Brain,
  Cpu,
  EyeOff,
  Filter,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import type { LibraryScope } from "@pi-studio/protocol";
import { useLibraryStore } from "./library-store.ts";

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
  } = useLibraryStore();

  const entries = snapshot?.entries ?? [];

  // Counts
  const counts = useMemo(() => {
    let skills = 0;
    let agents = 0;
    let project = 0;
    let global = 0;
    let builtin = 0;
    for (const e of entries) {
      if (e.kind === "skill") skills++;
      if (e.kind === "agent") agents++;
      if (e.scope === "project") project++;
      if (e.scope === "global") global++;
      if (e.scope === "builtin") builtin++;
    }
    return { all: entries.length, skills, agents, project, global, builtin };
  }, [entries]);

  // Filtered and sorted
  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return entries.filter((e) => {
      // Kind filter
      if (filterKind !== "all" && e.kind !== filterKind) return false;
      // Scope filter
      if (filterScope !== "all" && e.scope !== filterScope) return false;
      // Search
      if (q) {
        const inName = e.name.toLowerCase().includes(q);
        const inDisplay = e.displayName?.toLowerCase().includes(q) ?? false;
        const inDesc = e.description?.toLowerCase().includes(q) ?? false;
        const inTools = typeof e.frontmatter.tools === "string" && e.frontmatter.tools.toLowerCase().includes(q);
        const inModel = typeof e.frontmatter.model === "string" && e.frontmatter.model.toLowerCase().includes(q);
        const inBody = e.body.toLowerCase().includes(q);
        if (!inName && !inDisplay && !inDesc && !inTools && !inModel && !inBody) return false;
      }
      return true;
    }).sort((a, b) => {
      // Non-shadowed before shadowed
      if (a.shadowed !== b.shadowed) return a.shadowed ? 1 : -1;
      // Project before global before builtin
      const scopeRank = (s: LibraryScope) => (s === "project" ? 0 : s === "global" ? 1 : 2);
      if (scopeRank(a.scope) !== scopeRank(b.scope)) return scopeRank(a.scope) - scopeRank(b.scope);
      // Alphabetical by name
      return a.name.localeCompare(b.name);
    });
  }, [entries, filterKind, filterScope, searchQuery]);

  const prettyModel = (raw?: unknown): string | null => {
    if (typeof raw !== "string" || !raw.trim()) return null;
    const parts = raw.split("/");
    return parts.length > 1 ? parts.slice(1).join("/") : raw;
  };

  return (
    <aside className="lib-sidebar">
      {/* Search Header */}
      <div className="lib-sidebar__search">
        <div className="lib-sidebar__search-box">
          <Search size={13} className="text-muted" />
          <input
            type="text"
            placeholder="Search skills, agents, tools..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="lib-sidebar__clear-btn" onClick={() => setSearchQuery("")} title="Clear search">
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="lib-sidebar__filters">
        <div className="lib-sidebar__kind-seg ui-seg">
          <button
            type="button"
            aria-pressed={filterKind === "all"}
            onClick={() => setFilterKind("all")}
          >
            All <span className="lib-sidebar__badge">{counts.all}</span>
          </button>
          <button
            type="button"
            aria-pressed={filterKind === "skill"}
            onClick={() => setFilterKind("skill")}
          >
            Skills <span className="lib-sidebar__badge">{counts.skills}</span>
          </button>
          <button
            type="button"
            aria-pressed={filterKind === "agent"}
            onClick={() => setFilterKind("agent")}
          >
            Agents <span className="lib-sidebar__badge">{counts.agents}</span>
          </button>
        </div>

        {/* Scope pills */}
        <div className="lib-sidebar__scope-pills">
          <button
            type="button"
            className={`lib-scope-pill ${filterScope === "all" ? "is-active" : ""}`}
            onClick={() => setFilterScope("all")}
          >
            All scopes
          </button>
          <button
            type="button"
            className={`lib-scope-pill lib-scope-pill--project ${filterScope === "project" ? "is-active" : ""}`}
            onClick={() => setFilterScope("project")}
          >
            Project ({counts.project})
          </button>
          <button
            type="button"
            className={`lib-scope-pill lib-scope-pill--global ${filterScope === "global" ? "is-active" : ""}`}
            onClick={() => setFilterScope("global")}
          >
            Global ({counts.global})
          </button>
          <button
            type="button"
            className={`lib-scope-pill lib-scope-pill--builtin ${filterScope === "builtin" ? "is-active" : ""}`}
            onClick={() => setFilterScope("builtin")}
          >
            Built-in ({counts.builtin})
          </button>
        </div>
      </div>

      {/* List */}
      <div className="lib-sidebar__items">
        {filtered.length === 0 ? (
          <div className="lib-sidebar__empty text-muted">
            <Filter size={20} className="lib-sidebar__empty-icon" />
            <p>No matching skills or agents found</p>
            {(searchQuery || filterKind !== "all" || filterScope !== "all") && (
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
          filtered.map((entry) => {
            const isSelected = entry.id === selectedId;
            const modelVal = prettyModel(entry.frontmatter.model);
            const thinkingVal = typeof entry.frontmatter.thinking === "string" ? entry.frontmatter.thinking : null;
            const isAgentDisabled = entry.frontmatter.enabled === false;
            const customColor = entry.color;

            return (
              <div
                key={entry.id}
                className={`lib-item ${isSelected ? "is-selected" : ""} ${entry.shadowed ? "is-shadowed" : ""}`}
                onClick={() => selectEntry(entry.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    selectEntry(entry.id);
                  }
                }}
              >
                <div className="lib-item__icon-wrapper">
                  {entry.kind === "skill" ? (
                    <div className="lib-item__kind-icon lib-item__kind-icon--skill">
                      <Sparkles size={14} />
                    </div>
                  ) : (
                    <div
                      className="lib-item__kind-icon lib-item__kind-icon--agent"
                      style={customColor ? { background: customColor, color: "#fff" } : undefined}
                    >
                      <Bot size={14} />
                    </div>
                  )}
                </div>

                <div className="lib-item__content">
                  <div className="lib-item__top">
                    <span className="lib-item__title">
                      {entry.displayName || entry.name}
                    </span>
                    <span className={`lib-item__scope lib-item__scope--${entry.scope}`}>
                      {entry.scope === "builtin" ? "builtin" : entry.scope}
                    </span>
                  </div>

                  {entry.displayName && entry.displayName !== entry.name && (
                    <div className="lib-item__slug text-muted">@{entry.name}</div>
                  )}

                  {entry.description && (
                    <div className="lib-item__desc text-muted">{entry.description}</div>
                  )}

                  {/* Chips for model, thinking, warnings */}
                  <div className="lib-item__footer">
                    {entry.kind === "agent" && modelVal && (
                      <span className="lib-chip lib-chip--model" title={`Model: ${String(entry.frontmatter.model)}`}>
                        <Cpu size={10} /> {modelVal}
                      </span>
                    )}
                    {entry.kind === "agent" && thinkingVal && (
                      <span className="lib-chip lib-chip--thinking" title={`Thinking: ${thinkingVal}`}>
                        <Brain size={10} /> {thinkingVal}
                      </span>
                    )}
                    {isAgentDisabled && (
                      <span className="lib-chip lib-chip--disabled" title="Agent is disabled in frontmatter">
                        <EyeOff size={10} /> disabled
                      </span>
                    )}
                    {entry.shadowed && (
                      <span className="lib-chip lib-chip--shadowed" title={`Overridden by ${entry.overriddenBy || "project"}`}>
                        overridden
                      </span>
                    )}
                    {entry.parseError && (
                      <span className="lib-chip lib-chip--error" title={entry.parseError}>
                        <AlertTriangle size={10} /> error
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};
