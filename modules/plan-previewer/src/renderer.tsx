/**
 * Renderer half: the "plan" tab kind. Main emits `openPlanTab` when the CLI notifies the server; we open (or
 * focus) a plan tab for that file.
 */
import { lazy } from "react";
import { ClipboardCheck } from "lucide-react";
import { defineRendererModule } from "@hive/module-sdk/renderer";
import { MODULE_ID, PLAN_TAB_KIND, PlanEvents, type OpenPlanTabEvent } from "./shared.ts";
import { setPlanHost } from "./ui/plan-host.ts";

const PlanPreviewerTab = lazy(() => import("./ui/PlanPreviewerTab.tsx").then((m) => ({ default: m.PlanPreviewerTab })));

export function planTabTitle(filePath: string): string {
  return filePath.replace(/\\/g, "/").split("/").pop() || "plan.md";
}

export default defineRendererModule({
  id: MODULE_ID,
  contributes: {
    tabKinds: [{ kind: PLAN_TAB_KIND, icon: ({ size }) => <ClipboardCheck size={size} />, component: PlanPreviewerTab }],
  },
  activate(host) {
    setPlanHost(host);
    const off = host.ipc.on<OpenPlanTabEvent>(PlanEvents.openTab, ({ filePath, context }) => {
      host.tabs.open({ kind: PLAN_TAB_KIND, title: planTabTitle(filePath), filePath, data: { context } });
    });
    return () => {
      off();
      setPlanHost(null);
    };
  },
});
