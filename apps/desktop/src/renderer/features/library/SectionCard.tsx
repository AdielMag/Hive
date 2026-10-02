import React, { useState } from "react";
import { Check, ChevronDown, ChevronRight, Copy } from "lucide-react";
import type { LibrarySection } from "@pi-studio/protocol";
import { Markdown } from "../../components/code/Markdown.tsx";
import { copyText } from "../../lib/clipboard.ts";

interface Props {
  section: LibrarySection;
  defaultExpanded?: boolean;
}

export const SectionCard: React.FC<Props> = ({ section, defaultExpanded = true }) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [copied, setCopied] = useState(false);

  // Sync when defaultExpanded prop changes from parent Expand All / Collapse All
  React.useEffect(() => {
    setExpanded(defaultExpanded);
  }, [defaultExpanded]);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await copyText(section.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const levelLabel = section.level === 0 ? "Overview" : `H${section.level}`;

  return (
    <section id={`section-${section.slug}`} className="lib-section-card ui-card">
      <header
        className="lib-section-card__header"
        onClick={() => setExpanded((prev) => !prev)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded((prev) => !prev);
          }
        }}
      >
        <span className="lib-section-card__chevron text-muted">
          {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </span>
        <span className={`lib-section-card__level-badge lib-section-card__level--${section.level}`}>
          {levelLabel}
        </span>
        <h3 className="lib-section-card__title">{section.title}</h3>
        <div className="lib-section-card__spacer" />
        <button
          type="button"
          className="lib-section-card__action-btn ui-btn ui-btn--ghost ui-btn--sm ui-btn--icon"
          onClick={handleCopy}
          title="Copy section markdown"
        >
          {copied ? <Check size={12} className="text-success" /> : <Copy size={12} />}
        </button>
      </header>

      {expanded && (
        <div className="lib-section-card__content">
          {section.content.trim() ? (
            <Markdown text={section.content} />
          ) : (
            <div className="lib-section-card__empty-content text-muted">(Empty section)</div>
          )}
        </div>
      )}
    </section>
  );
};
