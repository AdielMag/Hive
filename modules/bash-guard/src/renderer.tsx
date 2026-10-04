import { defineRendererModule } from "@hive/module-sdk/renderer";
import { MODULE_ID } from "./shared.ts";
import { CommandApprovalBar } from "./ui/CommandApprovalBar.tsx";

export default defineRendererModule({
  id: MODULE_ID,
  contributes: {
    slots: {
      "composer.above": [CommandApprovalBar as any],
    },
  },
});
