import { join } from "node:path";
import { defineMainModule } from "@hive/module-sdk/main";
import type { PiInstallInfo } from "@hive/protocol";
import { UsageService } from "./service/usage.ts";
import { generateAiUsageInsights } from "./service/usage-ai.ts";
import { AnalyticsMethods, MODULE_ID, type GenerateInsightsPayload } from "./shared.ts";

export default defineMainModule({
  id: MODULE_ID,
  activate(ctx) {
    const svc = new UsageService(
      join(ctx.paths.hiveData, "usage-cache.json"),
      join(ctx.paths.piAgentDir, "sessions"),
    );

    ctx.ipc.handle(AnalyticsMethods.get, (opts?: { force?: boolean }) => svc.getReport(opts?.force));

    ctx.ipc.handle(AnalyticsMethods.generateInsights, ({ summaryText, model }: GenerateInsightsPayload) => {
      const pi = ctx.pi() as PiInstallInfo | null;
      if (!pi) throw new Error("Pi CLI not available to generate AI usage insights");
      return generateAiUsageInsights(summaryText, pi, model);
    });
  },
});
