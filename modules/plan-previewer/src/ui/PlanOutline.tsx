import React, { useState } from "react";
import { AlignLeft, ChevronRight, ChevronsDown, ChevronsUp } from "lucide-react";
import { extractTocHeadings } from "../plan-utils.ts";

interface Props {
  markdown: string;
  activeId?: string;
  onSelectHeading: (id: string) => void;
}

export const PlanOutline: React.FC<Props> = ({ markdown, activeId, onSelectHeading }) => {
  const headings = React.useMemo(() => extractTocHeadings(markdown), [markdown]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleCollapse = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const collapseAll = () => {
    setCollapsed(new Set(headings.filter((h) => h.level === 1 || h.level === 2).map((h) => h.id)));
  };

  const expandAll = () => {
    setCollapsed(new Set());
  };

  if (headings.length === 0) {
    return (
      <aside className="plan-outline">
        <div className="plan-outline__header">
          <span className="plan-outline__title">
            <AlignLeft size={13} />
            <span>Outline</span>
          </span>
        </div>
        <div className="plan-outline__empty text-muted">No headings found</div>
      </aside>
    );
  }

  return (
    <aside className="plan-outline">
      <div className="plan-outline__header">
        <span className="plan-outline__title">
          <AlignLeft size={13} />
          <span>Outline</span>
        </span>
        <div className="plan-outline__actions">
          <button type="button" className="plan-outline__btn" onClick={collapseAll} title="Collapse all">
            <ChevronsUp size={13} />
          </button>
          <button type="button" className="plan-outline__btn" onClick={expandAll} title="Expand all">
            <ChevronsDown size={13} />
          </button>
        </div>
      </div>

      <nav className="plan-outline__nav">
        {headings.map((h) => {
          const isActive = activeId === h.id;
          const isCollapsed = collapsed.has(h.id);
          return (
            <div
              key={h.id}
              className={`plan-outline__item plan-outline__item--lvl-${h.level}${isActive ? " is-active" : ""}`}
              onClick={() => onSelectHeading(h.id)}
            >
              {h.level === 1 && (
                <button
                  type="button"
                  className={`plan-outline__chevron${isCollapsed ? "" : " is-open"}`}
                  onClick={(e) => toggleCollapse(h.id, e)}
                >
                  <ChevronRight size={11} />
                </button>
              )}
              <span className="plan-outline__text" title={h.text}>
                {h.text}
              </span>
            </div>
          );
        })}
      </nav>
    </aside>
  );
};
