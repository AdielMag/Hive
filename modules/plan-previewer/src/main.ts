/**
 * Main-process half: the Plan Previewer HTTP server (:3456, used by the `plan-previewer` CLI) runs only while
 * the module is enabled.
 */
import { defineMainModule } from "@hive/module-sdk/main";
import { PlanPreviewerService } from "./service.ts";
import { MODULE_ID, PlanMethods, type PlanFeedbackPayload } from "./shared.ts";

export default defineMainModule({
  id: MODULE_ID,
  activate(ctx) {
    const svc = new PlanPreviewerService((event, payload) => ctx.ipc.emit(event, payload));
    svc.start();
    ctx.ipc.handle(PlanMethods.get, (filePath: string) => svc.getPlanData(filePath));
    ctx.ipc.handle(PlanMethods.submitFeedback, (payload: PlanFeedbackPayload) => svc.submitFeedback(payload));
    ctx.ipc.handle(PlanMethods.save, (filePath: string, content: string) => svc.savePlanContent(filePath, content));
    return () => svc.dispose();
  },
});
