import { defineMainModule } from "@hive/module-sdk/main";
import { MarketplaceService } from "./service.ts";
import { installPackage, isInstallableSource, readInstalledSources } from "./installer.ts";
import {
  MODULE_ID,
  MarketplaceMethods,
  type MarketplaceInstallArgs,
  type MarketplaceInstallResult,
  type MarketplaceSearchArgs,
} from "./shared.ts";

export default defineMainModule({
  id: MODULE_ID,
  activate(ctx) {
    const service = new MarketplaceService();
    ctx.ipc.handle(MarketplaceMethods.search, (args?: MarketplaceSearchArgs) =>
      service.search(args?.query ?? "", args?.kind ?? "pi-npm", { force: args?.force }),
    );
    ctx.ipc.handle(MarketplaceMethods.installed, () => readInstalledSources(ctx.paths.piAgentDir));
    ctx.ipc.handle(MarketplaceMethods.install, async (args?: MarketplaceInstallArgs): Promise<MarketplaceInstallResult> => {
      const source = args?.source?.trim() ?? "";
      if (!isInstallableSource(source)) {
        return { ok: false, message: "This entry isn't a Pi package, so it can't be installed here." };
      }
      const pi = ctx.pi();
      if (!pi) return { ok: false, message: "Pi wasn't found. Locate Pi, then try again." };
      ctx.log.info("installing pi package", source);
      return installPackage(pi, source);
    });
  },
});
