import { ipcMain } from "electron";
import { IPC, type PlanFeedbackPayload } from "@hive/protocol";
import type { AppContext } from "../context.ts";

export function registerPlanIpc(ctx: AppContext): void {
  ipcMain.handle(IPC.planGet, async (_event, filePath: string) => {
    return ctx.planPreviewer.getPlanData(filePath);
  });

  ipcMain.handle(IPC.planSubmitFeedback, async (_event, payload: PlanFeedbackPayload) => {
    return ctx.planPreviewer.submitFeedback(payload);
  });

  ipcMain.handle(IPC.planSave, async (_event, filePath: string, content: string) => {
    return ctx.planPreviewer.savePlanContent(filePath, content);
  });
}
