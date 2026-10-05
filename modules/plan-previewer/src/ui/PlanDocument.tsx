import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import type { ModuleHost } from "@hive/module-sdk/renderer";
import { activeViewMarkdown, extractPlanViews, segmentPlan, stripMoreMarker, type TocHeading } from "../plan-utils.ts";
import { pendingRounds } from "../plan-review.ts";
import { usePlanStore, type PlanAnnotation } from "./plan-store.ts";
import { usePlanSync } from "./use-plan-sync.ts";
import { applyBadges, applyHeadingIds, findTextRange, scrollToRange, setNoteHighlights } from "./plan-dom.ts";
import { PlanHeader } from "./PlanHeader.tsx";
import { PlanOutline, outlineHeadings } from "./PlanOutline.tsx";
import { DecisionCard } from "./DecisionCard.tsx";
import { PlanCallout } from "./PlanCallout.tsx";
import { PlanAskCard } from "./PlanAskCard.tsx";
import { PlanReply } from "./PlanReply.tsx";
import { PlanSelectionPopover } from "./PlanSelectionPopover.tsx";
import { PlanReviewBar } from "./PlanReviewBar.tsx";
import "./plan.css";

interface Props {
  host: ModuleHost;
  filePath: string;
  /**
   * Owns loading and live updates of the plan. True for the plan tab; false in the popup, which sits on top of an
   * inline card that already keeps the shared store in sync.
   */
  sync: boolean;
  /** Popup: close button. */
  onClose?: () => void;
  /** Popup: "Open as tab". */
  onOpenAsTab?: () => void;
}

/** Tab width below which the outline hides itself (unless the user forced it). */
const OUTLINE_MIN_WIDTH = 1100;

/** The whole review UI (header, outline, document, review bar), shared by the plan tab and the popup. */
export const PlanDocument: React.FC<Props> = ({ host, filePath, sync, onClose, onOpenAsTab }) => {
  const Markdown = host.ui.Markdown;
  const planData = usePlanStore((s) => s.planData);
  const loading = usePlanStore((s) => s.loading);
  const error = usePlanStore((s) => s.error);
  const viewMode = usePlanStore((s) => s.viewMode);
  const widthMode = usePlanStore((s) => s.widthMode);
  const outlineOpen = usePlanStore((s) => s.outlineOpen);
  const phase = usePlanStore((s) => s.phase);
  const annotations = usePlanStore((s) => s.annotations);
  const { loadPlan, setOutlineOpen } = usePlanStore.getState();

  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<HTMLDivElement>(null);
  const [headings, setHeadings] = useState<TocHeading[]>([]);
  const [activeId, setActiveId] = useState<string | undefined>();
  const [wideEnough, setWideEnough] = useState(true);

  usePlanSync(host, sync ? filePath : null);

  // Outline auto-hides on narrow containers.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWideEnough((entry?.contentRect.width ?? 0) >= OUTLINE_MIN_WIDTH));
    ro.observe(el);
    return () => ro.disconnect();
  }, [planData !== null]);

  const views = useMemo(() => extractPlanViews(planData?.content || ""), [planData?.content]);
  const activeMarkdown = useMemo(() => stripMoreMarker(activeViewMarkdown(views, viewMode)), [views, viewMode]);
  const segments = useMemo(() => segmentPlan(activeMarkdown), [activeMarkdown]);
  const hasBothViews = Boolean(views.summary && views.full);
  const toc = useMemo(() => outlineHeadings(headings), [headings]);
  const outlineVisible = (outlineOpen ?? wideEnough) && toc.length > 0;
  const readOnly = phase === "sent" || phase === "approved";
  const rounds = pendingRounds(planData?.agentQuestions);

  // DOM post-pass after every render of the segments: heading ids (+ outline) and file badges. Idempotent.
  useLayoutEffect(() => {
    const doc = docRef.current;
    if (!doc) return;
    const found = applyHeadingIds(doc);
    applyBadges(doc);
    setHeadings((prev) =>
      prev.length === found.length && prev.every((h, i) => h.id === found[i]!.id && h.text === found[i]!.text) ? prev : found,
    );
  }, [segments]);

  // Scroll-spy: the active outline entry is the last heading that crossed the top band of the viewport.
  useEffect(() => {
    const root = scrollRef.current;
    const doc = docRef.current;
    if (!root || !doc || toc.length === 0) return;
    const ids = toc.map((h) => h.id);
    const els = ids.map((id) => doc.querySelector<HTMLElement>(`#${CSS.escape(id)}`)).filter((e): e is HTMLElement => !!e);
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const idx = ids.indexOf(entry.target.id);
          if (entry.isIntersecting) setActiveId(entry.target.id);
          else if (entry.rootBounds && entry.boundingClientRect.top > entry.rootBounds.top && idx > 0) {
            // Scrolled back above this heading: the previous section is current again.
            setActiveId((cur) => (cur === entry.target.id ? ids[idx - 1] : cur));
          }
        }
      },
      { root, rootMargin: "0px 0px -75% 0px", threshold: 0 },
    );
    els.forEach((el) => io.observe(el));
    setActiveId((cur) => (cur && ids.includes(cur) ? cur : ids[0]));
    return () => io.disconnect();
  }, [toc]);

  // Persistent highlights for saved notes (CSS Custom Highlight API; no-op where unsupported).
  useEffect(() => {
    const doc = docRef.current;
    if (!doc) return;
    const ranges = annotations.map((a) => findTextRange(doc, a.selectedText)).filter((r): r is Range => !!r);
    setNoteHighlights(ranges);
  }, [annotations, segments]);
  useEffect(() => () => void setNoteHighlights([]), []);

  const scrollToHeading = useCallback((id: string) => {
    const el = docRef.current?.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveId(id);
  }, []);

  const jumpToDecision = useCallback((key: string) => {
    const el = docRef.current?.querySelector<HTMLElement>(`[data-decision-key="${CSS.escape(key)}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.querySelector<HTMLElement>('[role="radio"][tabindex="0"], textarea, .plan-decision__change')?.focus({ preventScroll: true });
  }, []);

  const jumpToNote = useCallback(
    (note: PlanAnnotation) => {
      const doc = docRef.current;
      const range = doc ? findTextRange(doc, note.selectedText) : null;
      if (range) scrollToRange(range);
      else host.toast({ message: "That text is no longer in this view", kind: "info" });
    },
    [host],
  );

  const jumpToAsk = useCallback(() => {
    const el = docRef.current?.querySelector<HTMLElement>("#plan-ask");
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
    el?.querySelector<HTMLElement>('[role="radio"][tabindex="0"], input')?.focus({ preventScroll: true });
  }, []);

  const copyPath = useCallback(async () => {
    const path = usePlanStore.getState().planData?.filePath;
    if (!path) return;
    const ok = await host.clipboard.copy(path);
    host.toast({ message: ok ? "Plan path copied" : "Could not copy the path", kind: ok ? "success" : "error" });
  }, [host]);

  if (loading && !planData) {
    return (
      <div className="plan-view plan-view--center">
        <Loader2 size={20} className="spin" />
        <p>Loading plan…</p>
      </div>
    );
  }

  if (error && !planData) {
    return (
      <div className="plan-view plan-view--center">
        <h3>Could not load plan</h3>
        <p>{error}</p>
        <button type="button" className="ui-btn ui-btn--sm" onClick={() => void loadPlan(filePath)}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div ref={rootRef} className={`plan-view plan-view--${widthMode}`} data-phase={phase}>
      <PlanHeader
        hasBothViews={hasBothViews}
        outlineVisible={outlineVisible}
        onToggleOutline={() => setOutlineOpen(!outlineVisible)}
        onCopyPath={() => void copyPath()}
        onClose={onClose}
        onOpenAsTab={onOpenAsTab}
      />

      <div className="plan-body">
        {outlineVisible && <PlanOutline headings={toc} activeId={activeId} onSelectHeading={scrollToHeading} />}

        <div className="plan-scroll" ref={scrollRef}>
          <div className="plan-doc" ref={docRef}>
            <PlanReply Markdown={Markdown} />

            {phase === "answering" && <PlanAskCard rounds={rounds} />}

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
              return <DecisionCard key={`dc-${seg.item.key}-${i}`} item={seg.item} readOnly={readOnly} scope="full-" />;
            })}

            <PlanSelectionPopover containerRef={docRef} disabled={readOnly} />
          </div>
        </div>
      </div>

      <PlanReviewBar onJumpToDecision={jumpToDecision} onJumpToNote={jumpToNote} onJumpToAsk={jumpToAsk} />
    </div>
  );
};
