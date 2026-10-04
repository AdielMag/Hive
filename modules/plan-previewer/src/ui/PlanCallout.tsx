import React from "react";
import { CircleAlert, Info, Lightbulb, OctagonAlert, TriangleAlert } from "lucide-react";
import type { ModuleHost } from "@hive/module-sdk/renderer";
import type { CalloutType } from "../plan-utils.ts";

const KINDS: Record<CalloutType, { label: string; Icon: typeof Info }> = {
  note: { label: "Note", Icon: Info },
  tip: { label: "Tip", Icon: Lightbulb },
  important: { label: "Important", Icon: CircleAlert },
  warning: { label: "Warning", Icon: TriangleAlert },
  caution: { label: "Caution", Icon: OctagonAlert },
};

interface Props {
  type: CalloutType;
  title: string;
  body: string;
  Markdown: ModuleHost["ui"]["Markdown"];
}

/** GitHub-style alert (`> [!NOTE]` ...), which host Markdown would otherwise print literally. */
export const PlanCallout: React.FC<Props> = ({ type, title, body, Markdown }) => {
  const { label, Icon } = KINDS[type];
  return (
    <aside className={`plan-callout plan-callout--${type}`} aria-label={label}>
      <div className="plan-callout__head">
        <Icon size={14} aria-hidden="true" />
        <span>{title || label}</span>
      </div>
      {body && (
        <div className="plan-callout__body">
          <Markdown text={body} />
        </div>
      )}
    </aside>
  );
};
