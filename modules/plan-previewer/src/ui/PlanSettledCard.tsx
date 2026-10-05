import React, { useEffect, useMemo, useState } from "react";
import { AlertCircle, Check, ClipboardCheck, Clock, Eye, MessageSquare, X } from "lucide-react";
import type { ModuleHost, ToolCardCall } from "@hive/module-sdk/renderer";
import { PlanMethods, type PlanPreviewData } from "../shared.ts";
import { activeViewMarkdown, extractPlanViews, parseReviewResult, planFileName, segmentPlan, stripMoreMarker } from "../plan-utils.ts";
import type { DecisionItem } from "../plan-utils.ts";
import { ModalShell } from "./ModalShell.tsx";
import { PlanCallout } from "./PlanCallout.tsx";
import { InlineText } from "./InlineText.tsx";
import "./plan.css";

const MODE_LABEL: Record<string, string> = { "auto-edit": "Auto Edit", manual: "Manual" };

type Settled = { label: string; tone: "ok" | "info" | "muted" | "error"; Icon: typeof Check };

function describe(call: ToolCardCall): Settled {
  if (!call.result) return { label: "Not completed", tone: "muted", Icon: Clock };
  const text = call.result.text;
  const r = parseReviewResult(text);
  if (r.status === "approved") return { label: r.mode ? `Approved · ${MODE_LABEL[r.mode] ?? r.mode}` : "Approved", tone: "ok", Icon: Check };
  if (r.status === "changes_requested") return { label: "Changes requested", tone: "info", Icon: MessageSquare };
  if (r.status === "answered") return { label: "Answers sent", tone: "info", Icon: MessageSquare };
  if (r.status === "timeout") return { label: "Timed out · review continues", tone: "muted", Icon: Clock };
  if (r.status === "dismissed") return { label: "Dismissed", tone: "muted", Icon: X };
  if (call.result.isError) return { label: "Review failed", tone: "error", Icon: AlertCircle };
  return { label: "Reviewed", tone: "muted", Icon: Check };
}

/** A finished (or not yet running) `plan-previewer` call: one compact row, with a read-only view of the plan. */
export const PlanSettledCard: React.FC<{ host: ModuleHost; call: ToolCardCall; filePath: string | null }> = ({ host, call, filePath }) => {
  const [open, setOpen] = useState(false);
  const s = describe(call);
  return (
    <>
      <div className={`plan-card plan-card--settled plan-card--${s.tone}`}>
        <ClipboardCheck size={14} className="plan-card__icon" aria-hidden="true" />
        <span className="plan-card__name" title={filePath ?? undefined}>
          {filePath ? planFileName(filePath) : "Plan review"}
        </span>
        <span className={`plan-card__result plan-card__result--${s.tone}`}>
          <s.Icon size={12} aria-hidden="true" />
          {s.label}
        </span>
        <span className="plan-card__spacer" />
        {filePath && (
          <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={() => setOpen(true)}>
            <Eye size={12} aria-hidden="true" />
            View plan
          </button>
        )}
      </div>
      {open && filePath && <ReadonlyPlanModal host={host} filePath={filePath} onClose={() => setOpen(false)} />}
    </>
  );
};

/** Plan as it is on disk now, without touching the live review store. */
const ReadonlyPlanModal: React.FC<{ host: ModuleHost; filePath: string; onClose: () => void }> = ({ host, filePath, onClose }) => {
  const Markdown = host.ui.Markdown;
  const [data, setData] = useState<PlanPreviewData | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    host.ipc
      .invoke<PlanPreviewData | null>(PlanMethods.get, filePath)
      .then((d) => alive && setData(d))
      .catch(() => alive && setData(null));
    return () => {
      alive = false;
    };
  }, [host, filePath]);

  const segments = useMemo(() => {
    if (!data) return [];
    return segmentPlan(stripMoreMarker(activeViewMarkdown(extractPlanViews(data.content), "full")));
  }, [data]);

  return (
    <ModalShell label="Plan" onClose={onClose}>
      <div className="plan-view">
        <header className="plan-header">
          <ClipboardCheck size={14} className="plan-header__icon" aria-hidden="true" />
          <span className="plan-header__name">{planFileName(filePath)}</span>
          <span className="plan-status">Read-only</span>
          <span className="plan-header__spacer" />
          <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm ui-btn--icon" onClick={onClose} aria-label="Close plan" title="Close (Esc)">
            <X size={15} />
          </button>
        </header>
        <div className="plan-body">
          <div className="plan-scroll">
            <div className="plan-doc">
              {data === undefined && <p className="plan-static__note">Loading plan…</p>}
              {data === null && <p className="plan-static__note">The plan file is no longer available: {filePath}</p>}
              {segments.map((seg, i) => {
                if (seg.kind === "md") {
                  return (
                    <div key={`md-${i}`} className="plan-seg-md">
                      <Markdown text={seg.text} />
                    </div>
                  );
                }
                if (seg.kind === "callout") return <PlanCallout key={`co-${i}`} type={seg.type} title={seg.title} body={seg.body} Markdown={Markdown} />;
                return <StaticDecision key={`dc-${seg.item.key}-${i}`} item={seg.item} />;
              })}
            </div>
          </div>
        </div>
      </div>
    </ModalShell>
  );
};

const StaticDecision: React.FC<{ item: DecisionItem }> = ({ item }) => (
  <section className="plan-decision plan-decision--static">
    <div className="plan-decision__head">
      <span className="plan-decision__tag" aria-hidden="true">
        {item.id}
      </span>
      <span className="plan-decision__title">
        <InlineText text={item.title} />
      </span>
    </div>
    {item.prompt && (
      <p className="plan-decision__prompt">
        <InlineText text={item.prompt} />
      </p>
    )}
    <ul className="plan-static__options">
      {item.options.map((o, i) => (
        <li key={`${o.label}-${i}`} className={o.isPreselected ? "is-default" : undefined}>
          <InlineText text={o.label} />
          {o.isPreselected && <span className="plan-decision__hint"> · agent default</span>}
        </li>
      ))}
    </ul>
  </section>
);
