/**
 * Renderer half. Plan review lives inline in the session: a `toolCards` contribution turns the agent's
 * `plan-previewer` bash call into a review card (with a "Show more" popup). The "plan" tab kind remains as a
 * fallback ("Open as tab", and when the CLI notifies but no card is on screen).
 */
import { lazy } from "react";
import { ClipboardCheck } from "lucide-react";
import { defineRendererModule } from "@hive/module-sdk/renderer";
import { MODULE_ID, PLAN_TAB_KIND, PlanEvents, type OpenPlanTabEvent } from "./shared.ts";
import { setPlanHost } from "./ui/plan-host.ts";
import { usePlanStore } from "./ui/plan-store.ts";
import { hasInlineCard } from "./ui/card-registry.ts";
import { PlanToolCard } from "./ui/PlanInlineCard.tsx";
import { parsePlanCommandPath, planFileName } from "./plan-utils.ts";

const PlanPreviewerTab = lazy(() => import("./ui/PlanPreviewerTab.tsx").then((m) => ({ default: m.PlanPreviewerTab })));

/** How long to wait for an inline card to claim a plan before falling back to a tab. */
const CARD_GRACE_MS = 1200;

export const planTabTitle = planFileName;

export default defineRendererModule({
  id: MODULE_ID,
  contributes: {
    tabKinds: [{ kind: PLAN_TAB_KIND, icon: ({ size }) => <ClipboardCheck size={size} />, component: PlanPreviewerTab }],
    toolCards: [
      {
        id: "plan-review",
        match: ({ name, arguments: args }) =>
          name === "bash" && typeof args.command === "string" && parsePlanCommandPath(args.command) !== null,
        component: PlanToolCard,
      },
    ],
  },
  activate(host) {
    setPlanHost(host);
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const off = host.ipc.on<OpenPlanTabEvent>(PlanEvents.openTab, ({ filePath, context }) => {
      usePlanStore.getState().addRecentPath(filePath);
      // The review shows inline. Only if no card claims this plan (e.g. the call was not recognised, or its session
      // is not on screen) open the tab, so a review is never lost.
      const timer = setTimeout(() => {
        timers.delete(timer);
        if (hasInlineCard(filePath)) return;
        host.tabs.open({ kind: PLAN_TAB_KIND, title: planTabTitle(filePath), filePath, data: { context } });
      }, CARD_GRACE_MS);
      timers.add(timer);
    });
    return () => {
      off();
      timers.forEach(clearTimeout);
      setPlanHost(null);
    };
  },
});
