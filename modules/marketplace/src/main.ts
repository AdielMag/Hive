import { defineMainModule } from "@hive/module-sdk/main";
import { MarketplaceService } from "./service.ts";
import { MODULE_ID, MarketplaceMethods, type MarketplaceSearchArgs } from "./shared.ts";

export default defineMainModule({
  id: MODULE_ID,
  activate(ctx) {
    const service = new MarketplaceService();
    ctx.ipc.handle(MarketplaceMethods.search, (args?: MarketplaceSearchArgs) =>
      service.search(args?.query ?? "", args?.kind ?? "pi-npm"),
    );
  },
});
