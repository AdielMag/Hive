/**
 * Renderer half. Plan review lives inline in the session: a `toolCards` contribution turns the agent's
 * `plan-previewer` bash call into a review card (with a "Show more" popup). The "plan" tab kind remains as a
 * manual option ("Open as tab" in the modal popup).
 */
import { lazy } from "react";
import { ClipboardCheck } from "lucide-react";
import { defineRendererModule } from "@hive/module-sdk/renderer";
import { MODULE_ID, PLAN_TAB_KIND, PlanEvents, type OpenPlanTabEvent } from "./shared.ts";
import { setPlanHost } from "./ui/plan-host.ts";
import { usePlanStore } from "./ui/plan-store.ts";
import { PlanToolCard } from "./ui/PlanInlineCard.tsx";
import { parsePlanCommandPath, planFileName } from "./plan-utils.ts";

const PlanPreviewerTab = lazy(() => import("./ui/PlanPreviewerTab.tsx").then((m) => ({ default: m.PlanPreviewerTab })));

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
    const off = host.ipc.on<OpenPlanTabEvent>(PlanEvents.openTab, ({ filePath }) => {
      usePlanStore.getState().addRecentPath(filePath);
    });
    return () => {
      off();
      setPlanHost(null);
    };
  },
});
