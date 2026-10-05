import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { ChevronDown, ClipboardCheck, Loader2, Maximize2 } from "lucide-react";
import type { ModuleHost, ToolCardCall } from "@hive/module-sdk/renderer";
import {
  extractInlinePart,
  parsePlanCommandPath,
  planFileName,
  resolvePlanPath,
  samePlanPath,
  segmentPlan,
} from "../plan-utils.ts";
import { pendingRounds } from "../plan-review.ts";
import { usePlanStore } from "./plan-store.ts";
import { usePlanSync } from "./use-plan-sync.ts";
import { registerInlineCard } from "./card-registry.ts";
import { applyBadges } from "./plan-dom.ts";
import { STATUS } from "./PlanHeader.tsx";
import { DecisionCard } from "./DecisionCard.tsx";
import { PlanCallout } from "./PlanCallout.tsx";
import { PlanAskCard } from "./PlanAskCard.tsx";
import { PlanReply } from "./PlanReply.tsx";
import { PlanReviewBar } from "./PlanReviewBar.tsx";
import { PlanModal } from "./PlanModal.tsx";
import { PlanSettledCard } from "./PlanSettledCard.tsx";
import "./plan.css";

interface Props {
  host: ModuleHost;
  call: ToolCardCall;
}

/** Transcript card for a `plan-previewer` bash call: live review while it blocks, a compact record once settled. */
export const PlanToolCard: React.FC<Props> = ({ host, call }) => {
  const command = typeof call.arguments.command === "string" ? call.arguments.command : "";
  const arg = useMemo(() => parsePlanCommandPath(command), [command]);
  const recent = usePlanStore((s) => s.recentPaths);
  const projectPath = host.sessions.activeProject()?.path ?? null;
  const filePath = useMemo(() => resolvePlanPath(arg, projectPath, recent), [arg, projectPath, recent]);

  if (call.result) return <PlanSettledCard host={host} call={call} filePath={filePath} />;
  if (!call.complete || !filePath) {
    return (
      <div className="plan-card plan-card--pending" role="status">
        <Loader2 size={13} className="spin" aria-hidden="true" />
        <span>Preparing plan review…</span>
      </div>
    );
  }
  if (!call.running) return <PlanSettledCard host={host} call={call} filePath={filePath} />;
  return <LivePlanCard host={host} filePath={filePath} />;
};

const LivePlanCard: React.FC<{ host: ModuleHost; filePath: string }> = ({ host, filePath }) => {
  const Markdown = host.ui.Markdown;
  // A live card means the call is blocked on the user: the agent has acted, so any earlier "sent" state is over.
  usePlanSync(host, filePath, true);
  useEffect(() => registerInlineCard(filePath), [filePath]);
  // The popup belongs to this card: never leave it flagged open once the card is gone (call settled).
  useEffect(() => () => usePlanStore.getState().closeModal(), []);

  const planData = usePlanStore((s) => s.planData);
  const error = usePlanStore((s) => s.error);
  const phase = usePlanStore((s) => s.phase);
  const openModal = usePlanStore((s) => s.openModal);
  const readOnly = phase === "sent" || phase === "approved";
  const rounds = pendingRounds(planData?.agentQuestions);
  const ready = planData !== null && samePlanPath(planData.filePath, filePath);

  const inline = useMemo(() => extractInlinePart(ready ? planData!.content : ""), [ready, planData?.content]);
  const segments = useMemo(() => segmentPlan(inline.markdown), [inline.markdown]);
  const bodyRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (bodyRef.current) applyBadges(bodyRef.current);
  }, [segments]);

  const jumpToDecision = useCallback(
    (key: string) => {
      const el = bodyRef.current?.querySelector<HTMLElement>(`[data-decision-key="${CSS.escape(key)}"]`);
      if (!el) {
        openModal(); // not part of the inline excerpt
        return;
      }
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.querySelector<HTMLElement>('[role="radio"][tabindex="0"], textarea, .plan-decision__change')?.focus({ preventScroll: true });
    },
    [openModal],
  );

  const jumpToAsk = useCallback(() => {
    const el = bodyRef.current?.querySelector<HTMLElement>("#inline-plan-ask");
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    el?.querySelector<HTMLElement>('[role="radio"][tabindex="0"], input, textarea')?.focus({ preventScroll: true });
  }, []);

  if (!ready) {
    return (
      <div className="plan-card plan-card--pending" role="status">
        {error ? (
          <span>Could not load plan: {error}</span>
        ) : (
          <>
            <Loader2 size={13} className="spin" aria-hidden="true" />
            <span>Loading plan…</span>
          </>
        )}
      </div>
    );
  }

  const status = STATUS[phase];

  return (
    <section className="plan-card" data-phase={phase} aria-label={`Plan review: ${planFileName(filePath)}`}>
      <header className="plan-card__head">
        <ClipboardCheck size={14} className="plan-card__icon" aria-hidden="true" />
        <span className="plan-card__name" title={filePath}>
          {planFileName(filePath)}
        </span>
        <span className={`plan-status plan-status--${status.tone}`} role="status">
          <span className="plan-status__dot" aria-hidden="true" />
          {status.label}
        </span>
        <span className="plan-card__spacer" />
        <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={openModal} title="Open the full plan in a popup">
          <Maximize2 size={12} aria-hidden="true" />
          {inline.hasMore ? "Show more" : "Expand"}
        </button>
      </header>

      <div className={`plan-card__body${inline.hasMore ? " has-more" : ""}`} ref={bodyRef}>
        <div className="plan-doc plan-doc--inline">
          <PlanReply Markdown={Markdown} />
          {phase === "answering" && <PlanAskCard rounds={rounds} scope="inline-" />}
          {segments.map((seg, i) => {
            if (seg.kind === "md") {
              return (
                <div key={`md-${i}`} className="plan-seg-md">
                  <Markdown text={seg.text} />
                </div>
              );
            }
            if (seg.kind === "callout") {
              return <PlanCallout key={`co-${i}`} type={seg.type} title={seg.title} body={seg.body} Markdown={Markdown} />;
            }
            return <DecisionCard key={`dc-${seg.item.key}-${i}`} item={seg.item} readOnly={readOnly} scope="inline-" />;
          })}
        </div>
        {inline.hasMore && (
          <button type="button" className="plan-card__more" onClick={openModal}>
            <ChevronDown size={13} aria-hidden="true" />
            Show more
          </button>
        )}
      </div>

      <PlanReviewBar onJumpToDecision={jumpToDecision} onJumpToNote={openModal} onJumpToAsk={jumpToAsk} />
      <PlanModal host={host} filePath={filePath} />
    </section>
  );
};
