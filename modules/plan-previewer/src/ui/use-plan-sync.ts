import { useEffect } from "react";
import type { ModuleHost } from "@hive/module-sdk/renderer";
import { PlanEvents, type OpenPlanTabEvent, type PlanUpdatedEvent } from "../shared.ts";
import { samePlanPath } from "../plan-utils.ts";
import { usePlanStore } from "./plan-store.ts";

/**
 * Loads `filePath` into the shared plan store and keeps it live: file edits and agent re-notifications (new
 * `--ask` questions / replies) for that plan. Exactly one owner (the inline card or the plan tab) should call
 * this per plan; the popup renders on top of its owner and does not.
 */
export function usePlanSync(host: ModuleHost, filePath: string | null, agentWaiting = false): void {
  useEffect(() => {
    if (filePath) void usePlanStore.getState().loadPlan(filePath, agentWaiting);
  }, [filePath, agentWaiting]);

  useEffect(() => {
    if (!filePath) return;
    const offUpdated = host.ipc.on<PlanUpdatedEvent>(PlanEvents.updated, (data) => {
      const st = usePlanStore.getState();
      if (samePlanPath(data.filePath, st.planData?.filePath) && typeof data.content === "string") {
        st.updateFromDisk(data.content, data.fileVersion);
      }
    });
    const offOpen = host.ipc.on<OpenPlanTabEvent>(PlanEvents.openTab, (data) => {
      const st = usePlanStore.getState();
      if (samePlanPath(data.filePath, st.planData?.filePath)) void st.refresh();
    });
    return () => {
      offUpdated();
      offOpen();
    };
  }, [host, filePath]);
}
