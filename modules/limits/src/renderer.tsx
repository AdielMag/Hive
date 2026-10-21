import React from "react";
import { defineRendererModule, type ModuleHost } from "@hive/module-sdk/renderer";
import { HIDDEN_EXTENSION_STATUSES, MODULE_ID } from "./shared.ts";
import { setLimitsHost } from "./ui/limits-host.ts";
import { startQuotaPolling, useLimits } from "./ui/limits-store.ts";
import { QuotaStatusItem } from "./ui/QuotaStatusItem.tsx";
import "./ui/limits.css";

const Item: React.FC<{ host: ModuleHost }> = ({ host }) => <QuotaStatusItem host={host} />;

let refreshTimer: ReturnType<typeof setTimeout> | null = null;
const debouncedRefresh = () => {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    void useLimits.getState().refresh(true);
  }, 1000);
};

export default defineRendererModule({
  id: MODULE_ID,
  contributes: {
    statusBar: [{ id: "limits", component: Item, hideExtensionStatuses: HIDDEN_EXTENSION_STATUSES }],
  },
  activate(host) {
    setLimitsHost(host);
    const stopPolling = startQuotaPolling();
    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      stopPolling();
      setLimitsHost(null);
    };
  },
  onSessionEvent(evt) {
    const type = evt.event?.type;
    if (type === "message_end") {
      const msg = evt.event.message as { role?: string } | undefined;
      if (msg?.role === "assistant") debouncedRefresh();
    } else if (type === "turn_complete" || type === "agent_end") {
      debouncedRefresh();
    }
  },
});
