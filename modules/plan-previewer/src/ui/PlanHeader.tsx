import React from "react";
import { ExternalLink, FileText, MoreHorizontal, PanelLeft, X } from "lucide-react";
import { usePlanStore, type PlanPhase } from "./plan-store.ts";
import { PlanMenu, type PlanMenuItem } from "./PlanMenu.tsx";

interface Props {
  hasBothViews: boolean;
  outlineVisible: boolean;
  onToggleOutline: () => void;
  onCopyPath: () => void;
  /** Popup only: closes it. */
  onClose?: () => void;
  /** Popup only: moves the review into a regular tab. */
  onOpenAsTab?: () => void;
}

export const STATUS: Record<PlanPhase, { label: string; tone: string }> = {
  reviewing: { label: "Awaiting review", tone: "review" },
  answering: { label: "Needs your input", tone: "input" },
  sent: { label: "Waiting for agent", tone: "sent" },
  approved: { label: "Approved", tone: "approved" },
};

export const PlanHeader: React.FC<Props> = ({ hasBothViews, outlineVisible, onToggleOutline, onCopyPath, onClose, onOpenAsTab }) => {
  const planData = usePlanStore((s) => s.planData);
  const phase = usePlanStore((s) => s.phase);
  const viewMode = usePlanStore((s) => s.viewMode);
  const widthMode = usePlanStore((s) => s.widthMode);
  const outlineOpen = usePlanStore((s) => s.outlineOpen);
  const lastUpdate = usePlanStore((s) => s.lastUpdate);
  const setViewMode = usePlanStore((s) => s.setViewMode);
  const setWidthMode = usePlanStore((s) => s.setWidthMode);
  const setOutlineOpen = usePlanStore((s) => s.setOutlineOpen);
  const clearLastUpdate = usePlanStore((s) => s.clearLastUpdate);

  const status = STATUS[phase];
  const menuItems: PlanMenuItem[] = [
    { id: "w-c", group: "Reading width", label: "Comfortable", checked: widthMode === "comfortable", onSelect: () => setWidthMode("comfortable") },
    { id: "w-w", label: "Wide", checked: widthMode === "wide", onSelect: () => setWidthMode("wide") },
    { id: "o-a", group: "Outline", label: "Automatic", hint: "Shown when the tab is wide", checked: outlineOpen === null, onSelect: () => setOutlineOpen(null) },
    { id: "o-s", label: "Always show", checked: outlineOpen === true, onSelect: () => setOutlineOpen(true) },
    { id: "o-h", label: "Hide", checked: outlineOpen === false, onSelect: () => setOutlineOpen(false) },
    { id: "copy", group: "File", label: "Copy file path", onSelect: onCopyPath },
  ];

  return (
    <header className="plan-header">
      <button
        type="button"
        className="ui-btn ui-btn--ghost ui-btn--sm ui-btn--icon"
        onClick={onToggleOutline}
        aria-pressed={outlineVisible}
        title={outlineVisible ? "Hide outline" : "Show outline"}
        aria-label={outlineVisible ? "Hide outline" : "Show outline"}
      >
        <PanelLeft size={14} />
      </button>

      <span className="plan-header__file" title={planData?.filePath}>
        <FileText size={14} className="plan-header__icon" />
        <span className="plan-header__name">{planData?.filename || "plan.md"}</span>
      </span>

      <span className={`plan-status plan-status--${status.tone}`} role="status">
        <span className="plan-status__dot" aria-hidden="true" />
        {status.label}
      </span>

      {lastUpdate && (
        <button
          type="button"
          className="ui-chip plan-update-chip"
          onClick={clearLastUpdate}
          title="The agent revised the plan. Click to dismiss."
        >
          <span>Updated</span>
          {lastUpdate.additions > 0 && <span className="plan-diff-add">+{lastUpdate.additions}</span>}
          {lastUpdate.deletions > 0 && <span className="plan-diff-del">−{lastUpdate.deletions}</span>}
          <X size={11} aria-hidden="true" />
        </button>
      )}

      <span className="plan-header__spacer" />

      {hasBothViews && (
        <div className="ui-seg plan-header__seg" role="group" aria-label="Plan view">
          <button type="button" aria-pressed={viewMode === "summary"} onClick={() => setViewMode("summary")}>
            Summary
          </button>
          <button type="button" aria-pressed={viewMode === "full"} onClick={() => setViewMode("full")}>
            Full
          </button>
        </div>
      )}

      <PlanMenu
        label="Plan options"
        items={menuItems}
        renderTrigger={({ ref, ...props }) => (
          <button
            ref={ref}
            type="button"
            className="ui-btn ui-btn--ghost ui-btn--sm ui-btn--icon"
            title="Plan options"
            aria-label="Plan options"
            {...props}
          >
            <MoreHorizontal size={15} />
          </button>
        )}
      />

      {onOpenAsTab && (
        <button
          type="button"
          className="ui-btn ui-btn--ghost ui-btn--sm"
          onClick={onOpenAsTab}
          title="Open this plan in its own tab"
        >
          <ExternalLink size={13} aria-hidden="true" />
          Open as tab
        </button>
      )}
      {onClose && (
        <button
          type="button"
          className="ui-btn ui-btn--ghost ui-btn--sm ui-btn--icon"
          onClick={onClose}
          title="Close (Esc)"
          aria-label="Close plan"
        >
          <X size={15} />
        </button>
      )}
    </header>
  );
};
