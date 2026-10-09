import React, { useState } from "react";
import { Check, ChevronDown, GitBranch, Search, Workflow } from "lucide-react";
import type { ActionsRepo, ActionsWorkflow, RunStatusFilter } from "../shared.ts";
import type { ActionsFilters } from "./actions-store.ts";
import { Menu } from "./Menu.tsx";

const SEGMENTS: Array<{ value: RunStatusFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "in_progress", label: "Running" },
  { value: "failure", label: "Failed" },
  { value: "success", label: "Passed" },
];

const SEARCH_THRESHOLD = 7;

const WorkflowMenu: React.FC<{ workflows: ActionsWorkflow[]; value: number | null; onChange: (id: number | null) => void }> = ({ workflows, value, onChange }) => {
  const [query, setQuery] = useState("");
  const current = workflows.find((w) => w.id === value);
  return (
    <Menu
      trigger={({ open, toggle }) => (
        <button type="button" className={`ga-chip-btn${value !== null ? " is-on" : ""}`} aria-haspopup="listbox" aria-expanded={open} onClick={toggle}>
          <Workflow size={12} />
          <span className="ga-chip-btn__label">{current ? current.name : "All workflows"}</span>
          <ChevronDown size={11} />
        </button>
      )}
    >
      {(close) => {
        const q = query.trim().toLowerCase();
        const shown = workflows.filter((w) => !q || w.name.toLowerCase().includes(q));
        const pick = (id: number | null) => {
          onChange(id);
          setQuery("");
          close();
        };
        return (
          <div className="ga-listbox" role="listbox" aria-label="Workflow">
            {workflows.length > SEARCH_THRESHOLD && (
              <label className="ga-listbox__search">
                <Search size={12} />
                <input autoFocus placeholder="Find workflow" value={query} onChange={(e) => setQuery(e.target.value)} spellCheck={false} />
              </label>
            )}
            {!q && (
              <button type="button" role="option" aria-selected={value === null} className="ga-option" onClick={() => pick(null)}>
                <span>All workflows</span>
                {value === null && <Check size={12} />}
              </button>
            )}
            {shown.map((w) => (
              <button key={w.id} type="button" role="option" aria-selected={w.id === value} className="ga-option" onClick={() => pick(w.id)}>
                <span>{w.name}</span>
                {w.id === value && <Check size={12} />}
              </button>
            ))}
            {shown.length === 0 && <div className="ga-listbox__none">No match</div>}
          </div>
        );
      }}
    </Menu>
  );
};

export const FilterBar: React.FC<{
  repo: ActionsRepo;
  workflows: ActionsWorkflow[];
  filters: ActionsFilters;
  onChange: (patch: Partial<ActionsFilters>) => void;
}> = ({ repo, workflows, filters, onChange }) => (
  <div className="ga-filters">
    <div className="ga-seg" role="radiogroup" aria-label="Status">
      {SEGMENTS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={filters.status === o.value}
          className={`ga-seg__btn ga-seg__btn--${o.value}${filters.status === o.value ? " is-on" : ""}`}
          onClick={() => onChange({ status: o.value })}
        >
          {o.label}
        </button>
      ))}
    </div>
    <div className="ga-filters__row">
      <button
        type="button"
        className={`ga-chip-btn${filters.branch === "current" ? " is-on" : ""}`}
        aria-pressed={filters.branch === "current"}
        disabled={!repo.branch}
        title={filters.branch === "current" ? "Showing this branch only. Click to show all branches." : "Show only the checked-out branch"}
        onClick={() => onChange({ branch: filters.branch === "current" ? "all" : "current" })}
      >
        <GitBranch size={12} />
        <span className="ga-chip-btn__label">{filters.branch === "current" && repo.branch ? repo.branch : "All branches"}</span>
      </button>
      <WorkflowMenu workflows={workflows} value={filters.workflowId} onChange={(id) => onChange({ workflowId: id })} />
    </div>
  </div>
);
