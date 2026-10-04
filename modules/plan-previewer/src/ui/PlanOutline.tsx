import React from "react";
import type { TocHeading } from "../plan-utils.ts";

interface Props {
  headings: TocHeading[];
  activeId?: string;
  onSelectHeading: (id: string) => void;
}

/** Flat H2/H3 outline (falls back to H1s for plans without sections) with the scroll-spy active entry. */
export const PlanOutline: React.FC<Props> = ({ headings, activeId, onSelectHeading }) => (
  <nav className="plan-outline" aria-label="Outline">
    <div className="ui-section-label plan-outline__title">Outline</div>
    <ul className="plan-outline__list">
      {headings.map((h) => (
        <li key={h.id}>
          <a
            href={`#${h.id}`}
            className={`plan-outline__item plan-outline__item--l${h.level}${activeId === h.id ? " is-active" : ""}`}
            aria-current={activeId === h.id ? "location" : undefined}
            title={h.text}
            onClick={(e) => {
              e.preventDefault();
              onSelectHeading(h.id);
            }}
          >
            {h.text}
          </a>
        </li>
      ))}
    </ul>
  </nav>
);

/** Outline entries: H2/H3, or the H1s when a plan has no lower headings. */
export function outlineHeadings(all: TocHeading[]): TocHeading[] {
  const sections = all.filter((h) => h.level >= 2);
  return sections.length > 0 ? sections : all.filter((h) => h.level === 1);
}
