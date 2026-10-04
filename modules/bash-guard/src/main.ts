import { defineMainModule } from "@hive/module-sdk/main";
import { MODULE_ID } from "./shared.ts";

export default defineMainModule({
  id: MODULE_ID,
  activate(_ctx) {
    // Agent assets (the Pi extension) are managed by Hive's agent-assets installer on enable/disable.
    return () => {};
  },
});
