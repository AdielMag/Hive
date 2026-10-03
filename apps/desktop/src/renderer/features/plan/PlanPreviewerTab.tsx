import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, CheckCircle2, Loader2, Sparkles, X } from "lucide-react";
import type { TabItem } from "@hive/protocol";
import { usePlanStore } from "./plan-store.ts";
import { extractPlanViews } from "./plan-utils.ts";
import { PlanHeader } from "./PlanHeader.tsx";
import { PlanOutline } from "./PlanOutline.tsx";
import { PlanDecisions } from "./PlanDecisions.tsx";
import { PlanSelectionPopover } from "./PlanSelectionPopover.tsx";
import { PlanActivitySidebar } from "./PlanActivitySidebar.tsx";
import { PlanFooter } from "./PlanFooter.tsx";
import { Markdown } from "../../components/code/Markdown.tsx";
import { useSessionStore } from "../../store/session-store.ts";
import "./plan.css";

interface Props {
  tab: TabItem;
}

export const PlanPreviewerTab: React.FC<Props> = ({ tab }) => {
  const {
    planData,
    loading,
    error,
    viewMode,
    widthMode,
    collapseLeft,
    collapseRight,
    toastMessage,
    isApproved,
    loadPlan,
    updateFromDisk,
    setViewMode,
    clearToast,
  } = usePlanStore();

  const closeTab = useSessionStore((s) => s.closeTab);
  const docContainerRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [activeHeadingId, setActiveHeadingId] = useState<string | undefined>();
  const [showApprovalModal, setShowApprovalModal] = useState(false);

  const targetPath = tab.planFile || tab.filePath || "plan.md";

  // Initial load
  useEffect(() => {
    void loadPlan(targetPath);
  }, [targetPath, loadPlan]);

  // Listen for live updates from disk
  useEffect(() => {
    const unsub = window.studio.onPlanUpdated((data) => {
      if (data.filePath === planData?.filePath && data.content) {
        updateFromDisk(data.content, data.fileVersion);
      }
    });
    return unsub;
  }, [planData?.filePath, updateFromDisk]);

  // Auto-dismiss toast
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => clearToast(), 4000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [toastMessage, clearToast]);

  // Show modal once approved
  useEffect(() => {
    if (isApproved) {
      setShowApprovalModal(true);
    }
  }, [isApproved]);

  // Dual-view markdown extraction
  const views = useMemo(() => extractPlanViews(planData?.content || ""), [planData?.content]);

  // If in summary mode and summary exists, show summary; otherwise full/raw
  const activeMarkdown = useMemo(() => {
    if (viewMode === "summary" && views.summary) return views.summary;
    if (viewMode === "full" && views.full) return views.full;
    // Strip out choice/question blockquotes from rendered body since DecisionsTray handles them
    return views.raw;
  }, [viewMode, views]);

  // Clean markdown for rendering without repeating decisions blockquotes in body
  const bodyMarkdown = useMemo(() => {
    // Remove > [!CHOICE] and > [!QUESTION] blockquotes from text so they don't render twice
    return activeMarkdown.replace(/(?:^[ \t]*>[ \t]*.*(?:\r?\n|$))+/gm, (match) => {
      if (/^>[ \t]*\[!(CHOICE|QUESTION)\]/im.test(match)) {
        return ""; // Stripped out, handled by PlanDecisions tray
      }
      return match;
    });
  }, [activeMarkdown]);

  const handleSelectHeading = (slug: string) => {
    setActiveHeadingId(slug);
    // Find heading element with matching slug/text
    const headings = docContainerRef.current?.querySelectorAll("h1, h2, h3") || [];
    for (const h of Array.from(headings)) {
      const text = h.textContent?.replace(/[^\w\s-]/g, "").trim().toLowerCase().replace(/\s+/g, "-") || "";
      if (text === slug || h.id === slug) {
        h.scrollIntoView({ behavior: "smooth", block: "start" });
        break;
      }
    }
  };

  if (loading && !planData) {
    return (
      <div className="plan-view plan-view--loading">
        <Loader2 size={28} className="spin text-accent" />
        <p>Loading plan preview...</p>
      </div>
    );
  }

  if (error && !planData) {
    return (
      <div className="plan-view plan-view--error">
        <h3>Could not load plan</h3>
        <p>{error}</p>
        <button type="button" className="ui-btn ui-btn--sm" onClick={() => void loadPlan(targetPath)}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className={`plan-view plan-view--w-${widthMode}`} data-view-mode={viewMode}>
      <PlanHeader onClose={() => void closeTab(tab.id)} />

      <div className="plan-body">
        {/* Left TOC Sidebar */}
        {!collapseLeft && (
          <PlanOutline
            markdown={activeMarkdown}
            activeId={activeHeadingId}
            onSelectHeading={handleSelectHeading}
          />
        )}

        {/* Center Document Area */}
        <div className="plan-doc-area" ref={scrollAreaRef}>
          <div className="plan-doc-container" ref={docContainerRef}>
            {/* Live update toast */}
            {toastMessage && (
              <div className="plan-toast-banner">
                <Sparkles size={14} className="text-accent" />
                <span>{toastMessage}</span>
                <button type="button" className="plan-toast-close" onClick={clearToast}>
                  <X size={12} />
                </button>
              </div>
            )}

            {/* Summary View Banner */}
            {viewMode === "summary" && (
              <div className="plan-summary-banner">
                <div className="plan-summary-banner__text">
                  <span className="plan-summary-banner__icon">✦</span>
                  <span>
                    <strong>Summary View:</strong> High-level strategy, key trade-offs &amp; milestones
                  </span>
                </div>
                <button
                  type="button"
                  className="plan-summary-banner__switch-btn"
                  onClick={() => setViewMode("full")}
                >
                  <span>Show Full Blueprint</span>
                  <ArrowRight size={12} />
                </button>
              </div>
            )}

            <div className="plan-doc-card">
              {/* Decisions Tray */}
              <PlanDecisions />

              {/* Rendered Markdown Blueprint */}
              <div className="plan-doc-content selectable">
                <Markdown text={bodyMarkdown} />
              </div>
            </div>

            {/* Floating popover for text selection annotations */}
            <PlanSelectionPopover containerRef={docContainerRef} />
          </div>
        </div>

        {/* Right Activity Sidebar */}
        {!collapseRight && <PlanActivitySidebar />}
      </div>

      <PlanFooter />

      {/* Approval Success Modal */}
      {showApprovalModal && (
        <div className="plan-modal-scrim" onClick={() => setShowApprovalModal(false)}>
          <div className="plan-modal" onClick={(e) => e.stopPropagation()}>
            <div className="plan-modal__icon">
              <CheckCircle2 size={32} className="text-success" />
            </div>
            <h2 className="plan-modal__title">Plan Approved</h2>
            <p className="plan-modal__desc">
              Your approval and comments have been transmitted back to the agent session. The agent is now executing
              the plan in <strong>{usePlanStore.getState().selectedExecutionMode.toUpperCase()}</strong> mode.
            </p>
            <div className="plan-modal__actions">
              <button
                type="button"
                className="plan-footer__btn plan-footer__btn--approve"
                onClick={() => setShowApprovalModal(false)}
              >
                Close Notice
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
