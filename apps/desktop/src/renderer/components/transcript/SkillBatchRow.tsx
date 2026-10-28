import React, { useState } from "react";
import { ChevronDown, ChevronRight, FileText, Sparkles } from "lucide-react";
import type { SkillBatchItem } from "./tool-batch.ts";
import { Markdown } from "../code/Markdown.tsx";
import { openFileInTab } from "../../lib/file-links.tsx";

export const SkillBatchRow: React.FC<{
  items: SkillBatchItem[];
}> = ({ items }) => {
  const [activeId, setActiveId] = useState<string | null>(null);

  if (items.length === 0) return null;

  const count = items.length;
  const activeItem = items.find((i) => (i.block.id || i.itemKey) === activeId);

  return (
    <div
      className="msg-skill-batch ui-card"
      data-tool-call-ids={items.map((i) => i.block.id).join(" ")}
      role="region"
      aria-label="Skills loaded into context"
    >
      <div className="msg-skill-batch__bar">
        <div className="msg-skill-batch__lead">
          <span className="msg-skill-batch__icon">
            <Sparkles size={13} />
          </span>
          <span className="msg-skill-batch__label">
            {count === 1 ? "Skill in context:" : `${count} skills in context:`}
          </span>
        </div>

        <div className="msg-skill-batch__chips">
          {items.map(({ block, load, itemKey }) => {
            const id = block.id || itemKey;
            const isOpen = activeId === id;
            return (
              <button
                key={id}
                type="button"
                className={`msg-skill-batch__chip${isOpen ? " is-active" : ""}`}
                onClick={() => setActiveId(isOpen ? null : id)}
                title={
                  load.description
                    ? `${load.name}: ${load.description}`
                    : `Click to inspect ${load.name} instructions`
                }
              >
                <Sparkles size={11} className="msg-skill-batch__chip-sparkle" />
                <span className="msg-skill-batch__chip-name">{load.name}</span>
                <span className="msg-skill-batch__chip-tag">
                  {load.source === "/skill" ? "/skill" : "auto"}
                </span>
                <span className="msg-skill-batch__chip-chevron">
                  {isOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {activeItem && (
        <div className="msg-skill-batch__drawer">
          <div className="msg-skill-batch__drawer-head">
            <div className="msg-skill-batch__drawer-meta">
              <span className="msg-skill-batch__drawer-name">{activeItem.load.name}</span>
              {activeItem.load.description && (
                <span className="msg-skill-batch__drawer-desc">{activeItem.load.description}</span>
              )}
            </div>
            {activeItem.load.filePath && (
              <button
                type="button"
                className="ui-btn ui-btn--ghost ui-btn--sm msg-skill-batch__drawer-file"
                onClick={() => void openFileInTab(activeItem.load.filePath)}
                title={`Open ${activeItem.load.filePath} in editor tab`}
              >
                <FileText size={12} />
                <span>Open file</span>
              </button>
            )}
          </div>
          {activeItem.load.body && (
            <div className="msg-skill-batch__body ui-scroll">
              <Markdown text={activeItem.load.body} />
            </div>
          )}
        </div>
      )}
    </div>
  );
};
