import React from "react";
import { defineRendererModule, type ModuleHost } from "@hive/module-sdk/renderer";
import { HIDDEN_EXTENSION_STATUSES, MODULE_ID } from "./shared.ts";
import { setLimitsHost } from "./ui/limits-host.ts";
import { startQuotaPolling } from "./ui/limits-store.ts";
import { QuotaStatusItem } from "./ui/QuotaStatusItem.tsx";
import "./ui/limits.css";

const Item: React.FC<{ host: ModuleHost }> = ({ host }) => <QuotaStatusItem host={host} />;

export default defineRendererModule({
  id: MODULE_ID,
  contributes: {
    statusBar: [{ id: "limits", component: Item, hideExtensionStatuses: HIDDEN_EXTENSION_STATUSES }],
  },
  activate(host) {
    setLimitsHost(host);
    const stopPolling = startQuotaPolling();
    return () => {
      stopPolling();
      setLimitsHost(null);
    };
  },
});
