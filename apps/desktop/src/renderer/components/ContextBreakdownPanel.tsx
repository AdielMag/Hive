import React from "react";
import { PieChart, X } from "lucide-react";
import type { ModuleHost } from "@hive/module-sdk/renderer";
import { ContextBreakdownView, useContextBreakdown } from "./ContextBreakdownView.tsx";
import { useUi } from "../store/ui-store.ts";

export const ContextBreakdownPanel: React.FC<{ host?: ModuleHost }> = ({ host }) => {
  const data = useContextBreakdown();
  const close = () => (host ? host.panels.close("right") : useUi.getState().showRight(null));
  return (
    <div className="ctx-panel">
      <div className="ui-panel-header">
        <div className="ui-panel-title">
          <PieChart size={14} /> Context window
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span
            className="ctx-panel__badge"
            title={data.breakdown.isExact ? "Total reported by the model" : "Estimated from the transcript"}
          >
            {data.breakdown.isExact ? "exact" : "estimated"}
          </span>
          <button
            className="ui-btn ui-btn--sm ui-btn--ghost ui-btn--icon"
            onClick={close}
            title="Close panel"
            aria-label="Close panel"
          >
            <X size={13} />
          </button>
        </div>
      </div>
      <div className="ctx-panel__body ui-scroll">
        <ContextBreakdownView data={data} />
      </div>
    </div>
  );
};
