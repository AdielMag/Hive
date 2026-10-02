import React, { useState } from "react";
import { ChevronDown, ChevronRight, Sparkles } from "lucide-react";
import type { SkillLoad } from "../../lib/ai/skills.ts";
import { Markdown } from "../code/Markdown.tsx";

export const SkillLoadCard: React.FC<{ load: SkillLoad; toolCallId?: string }> = ({
  load,
  toolCallId,
}) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="msg-skill-card ui-card"
      data-tool-call-id={toolCallId}
      role="region"
      aria-label={`Skill loaded: ${load.name}`}
    >
      <div
        className="msg-skill-card__header"
        onClick={() => setExpanded((prev) => !prev)}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded((prev) => !prev);
          }
        }}
      >
        <div className="msg-skill-card__icon">
          <Sparkles size={14} />
        </div>
        <div className="msg-skill-card__title">
          <span className="msg-skill-card__action">Skill loaded:</span>
          <span className="msg-skill-card__name">{load.name}</span>
          <span className="ui-chip ui-chip--accent" style={{ fontSize: "10px", padding: "1px 6px" }}>
            {load.source === "/skill" ? "/skill command" : "auto-loaded"}
          </span>
        </div>
        <button
          type="button"
          className="ui-btn ui-btn--ghost ui-btn--icon"
          title={expanded ? "Collapse skill instructions" : "Expand skill instructions"}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
      </div>

      {load.description && (
        <div className="msg-skill-card__desc">{load.description}</div>
      )}

      {expanded && (
        <div className="msg-skill-card__body ui-scroll">
          <Markdown text={load.body} />
        </div>
      )}
    </div>
  );
};
