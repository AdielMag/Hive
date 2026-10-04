import { join } from "node:path";
import { defineMainModule } from "@hive/module-sdk/main";
import type { PiInstallInfo } from "@hive/protocol";
import { QuotaService } from "./service/index.ts";
import { LimitsMethods, MODULE_ID } from "./shared.ts";

export default defineMainModule({
  id: MODULE_ID,
  activate(ctx) {
    // Pi can be relocated at runtime, so resolve it on every snapshot build.
    let service: QuotaService | null = null;
    let servicePi: PiInstallInfo | null = null;
    const get = (): QuotaService => {
      const pi = ctx.pi() as PiInstallInfo | null;
      if (!service || pi !== servicePi) {
        servicePi = pi;
        service = new QuotaService(pi, {
          agentDir: () => ctx.paths.piAgentDir,
          helperPath: join(ctx.paths.moduleRoot, "helpers", "pi-credentials.mjs"),
        });
      }
      return service;
    };
    ctx.ipc.handle(LimitsMethods.get, (opts?: { force?: boolean }) => get().getSnapshot(opts?.force));
  },
});
