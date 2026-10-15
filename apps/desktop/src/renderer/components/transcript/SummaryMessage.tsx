import React, { useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, GitBranch, Minimize2 } from "lucide-react";
import { Markdown } from "../code/Markdown.tsx";
import { formatTokens } from "../../lib/format.ts";

export const COLLAPSED_SUMMARY_MAX_HEIGHT = 84;

export function getSummaryTitle(variant?: string, customTitle?: string): string {
  if (customTitle) return customTitle;
  if (variant === "compaction") return "Context compacted";
  if (variant === "branch") return "Branch summary";
  return "Summary";
}

export function shouldSummaryCollapseHeuristic(text: string): boolean {
  if (!text) return false;
  const lineCount = (text.match(/\n/g) || []).length + 1;
  return lineCount >= 4 || text.length > 180;
}

export interface SummaryMessageProps {
  itemKey: string;
  variant?: "compaction" | "branch" | string;
  title?: string;
  summary: string;
  tokensBefore?: number;
}

export const SummaryMessage: React.FC<SummaryMessageProps> = ({
  itemKey,
  variant = "compaction",
  title,
  summary,
  tokensBefore,
}) => {
  const isCompaction = variant === "compaction";
  const isBranch = variant === "branch";
  const displayTitle = getSummaryTitle(variant, title);

  const [expanded, setExpanded] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // Initial heuristic avoids content flicker before layout measurement
  const [canExpand, setCanExpand] = useState(() => shouldSummaryCollapseHeuristic(summary));

  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const checkOverflow = () => {
      // scrollHeight gives total content height, even when clipped by max-height
      const overflow = el.scrollHeight > COLLAPSED_SUMMARY_MAX_HEIGHT + 12;
      setCanExpand(overflow);
    };
    checkOverflow();
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(checkOverflow);
      ro.observe(el);
      return () => ro.disconnect();
    }
  }, [summary]);

  return (
    <div className="msg-summary" data-item-key={itemKey}>
      <div className="msg-summary__head">
        <div className="msg-summary__title">
          {isCompaction ? (
            <Minimize2 size={12} className="msg-summary__icon" />
          ) : isBranch ? (
            <GitBranch size={12} className="msg-summary__icon" />
          ) : null}
          <span>{displayTitle}</span>
        </div>
        {isCompaction && typeof tokensBefore === "number" && tokensBefore > 0 && (
          <span
            className="msg-summary__meta"
            title={`Context had ${tokensBefore.toLocaleString()} tokens before compaction`}
          >
            ~{formatTokens(tokensBefore)} tokens before
          </span>
        )}
      </div>
      <div
        ref={contentRef}
        className={`msg-summary__content${!expanded && canExpand ? " is-collapsed" : ""}`}
      >
        <Markdown text={summary} />
      </div>
      {canExpand && (
        <button
          type="button"
          className="msg-summary__toggle"
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
        >
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          <span>{expanded ? "Show less" : "Show more"}</span>
        </button>
      )}
    </div>
  );
};
