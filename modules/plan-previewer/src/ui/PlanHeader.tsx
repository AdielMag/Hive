import React from "react";
import {
  AlignLeft,
  CheckCircle,
  Clock,
  Compass,
  FileText,
  Maximize2,
  Minimize2,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  X,
} from "lucide-react";
import { usePlanStore } from "./plan-store.ts";

interface Props {
  onClose?: () => void;
}

export const PlanHeader: React.FC<Props> = ({ onClose }) => {
  const {
    planData,
    viewMode,
    widthMode,
    collapseLeft,
    collapseRight,
    decisions,
    selections,
    draftAnswers,
    isApproved,
    setViewMode,
    setWidthMode,
    toggleLeftSidebar,
    toggleRightSidebar,
  } = usePlanStore();

  const totalDecisions = decisions.length;
  const answeredDecisions = decisions.filter((d) => {
    if (d.type === "choice") return Boolean(selections[d.id]);
    if (d.type === "question") return Boolean(draftAnswers[d.id]?.trim());
    return false;
  }).length;

  const percent = totalDecisions > 0 ? Math.round((answeredDecisions / totalDecisions) * 100) : 100;

  // Extract goal title from first H1
  const goalTitle = React.useMemo(() => {
    if (!planData?.content) return "Plan Overview";
    const m = planData.content.match(/^#\s+(.+)$/m);
    return m && m[1] ? m[1].replace(/<!--.*?-->/g, "").trim() : "Plan Overview";
  }, [planData?.content]);

  return (
    <header className="plan-header">
      <div className="plan-header__left">
        <button
          type="button"
          className="plan-header__btn"
          onClick={toggleLeftSidebar}
          title={collapseLeft ? "Show Outline (Ctrl+B)" : "Hide Outline (Ctrl+B)"}
        >
          {collapseLeft ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
        </button>

        <div className="plan-header__agent">
          <div className="plan-header__avatar">
            <Compass size={14} />
          </div>
          <div className="plan-header__agent-info">
            <span className="plan-header__agent-name">Hive Agent</span>
            <span className="plan-header__agent-mode">Plan Review</span>
          </div>
        </div>

        <div className="plan-header__context">
          <span className="plan-header__file">
            <FileText size={12} />
            <span>{planData?.filename || "plan.md"}</span>
          </span>
          <span className="plan-header__goal" title={goalTitle}>
            {goalTitle}
          </span>
        </div>
      </div>

      {totalDecisions > 0 && (
        <div className="plan-header__progress" title={`${answeredDecisions} of ${totalDecisions} decisions resolved`}>
          <div className="plan-header__progress-text">
            <span>{answeredDecisions} of {totalDecisions} resolved</span>
            <span className="plan-header__progress-pct">{percent}%</span>
          </div>
          <div className="plan-header__progress-track">
            <div className="plan-header__progress-fill" style={{ width: `${percent}%` }} />
          </div>
        </div>
      )}

      <div className="plan-header__right">
        {/* Summary vs Full View */}
        <div className="plan-header__btn-group" role="group" aria-label="View Mode">
          <button
            type="button"
            className={`plan-header__mode-btn${viewMode === "summary" ? " is-active" : ""}`}
            onClick={() => setViewMode("summary")}
            title="Summary View: 30-sec executive scan of key strategy & decisions"
          >
            <AlignLeft size={13} />
            <span>Summary</span>
          </button>
          <button
            type="button"
            className={`plan-header__mode-btn${viewMode === "full" ? " is-active" : ""}`}
            onClick={() => setViewMode("full")}
            title="Full View: complete technical blueprint & implementation steps"
          >
            <FileText size={13} />
            <span>Full</span>
          </button>
        </div>

        {/* Width Switcher */}
        <div className="plan-header__btn-group" role="group" aria-label="Reading Width">
          <button
            type="button"
            className={`plan-header__mode-btn${widthMode === "comfortable" ? " is-active" : ""}`}
            onClick={() => setWidthMode("comfortable")}
            title="Narrow reading column (~820px)"
          >
            <Minimize2 size={13} />
            <span>Narrow</span>
          </button>
          <button
            type="button"
            className={`plan-header__mode-btn${widthMode === "wide" ? " is-active" : ""}`}
            onClick={() => setWidthMode("wide")}
            title="Wide reading column (75%)"
          >
            <span>Wide</span>
          </button>
          <button
            type="button"
            className={`plan-header__mode-btn${widthMode === "full" ? " is-active" : ""}`}
            onClick={() => setWidthMode("full")}
            title="Full window width (100%)"
          >
            <Maximize2 size={13} />
            <span>Full</span>
          </button>
        </div>

        {/* Status Pill */}
        <div className={`plan-status-pill ${isApproved ? "is-approved" : "is-review"}`}>
          {isApproved ? <CheckCircle size={12} /> : <Clock size={12} />}
          <span>{isApproved ? "Approved" : "Awaiting review"}</span>
        </div>

        {/* Toggle Activity Sidebar */}
        <button
          type="button"
          className="plan-header__btn"
          onClick={toggleRightSidebar}
          title={collapseRight ? "Show Activity" : "Hide Activity"}
        >
          {collapseRight ? <PanelRightOpen size={15} /> : <PanelRightClose size={15} />}
        </button>

        {onClose && (
          <button type="button" className="plan-header__btn plan-header__btn--close" onClick={onClose} title="Close Plan Tab">
            <X size={15} />
          </button>
        )}
      </div>
    </header>
  );
};
