import { join } from "node:path";
import { defineMainModule } from "@hive/module-sdk/main";
import { getMcpCatalog } from "./service/mcp-catalog.ts";
import { MODULE_ID, ToolsMethods } from "./shared.ts";

export default defineMainModule({
  id: MODULE_ID,
  activate(ctx) {
    ctx.ipc.handle(ToolsMethods.getMcpCatalog, () =>
      getMcpCatalog(join(ctx.paths.piAgentDir, "mcp.json")),
    );
  },
});
