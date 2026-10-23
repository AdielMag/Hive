import React from "react";
import { defineRendererModule, type ModuleHost } from "@hive/module-sdk/renderer";
import { HIDDEN_EXTENSION_STATUSES, MODULE_ID } from "./shared.ts";
import { setLimitsHost } from "./ui/limits-host.ts";
import { startQuotaPolling, useLimits } from "./ui/limits-store.ts";
import { QuotaStatusItem } from "./ui/QuotaStatusItem.tsx";
import "./ui/limits.css";

const Item: React.FC<{ host: ModuleHost }> = ({ host }) => <QuotaStatusItem host={host} />;

let lastRefreshedAt = 0;
const throttledRefresh = () => {
  const now = Date.now();
  if (now - lastRefreshedAt < 60_000) return;
  lastRefreshedAt = now;
  void useLimits.getState().refresh(false);
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
      stopPolling();
      setLimitsHost(null);
    };
  },
  onSessionEvent(evt) {
    if (evt.event?.type === "agent_end") {
      throttledRefresh();
    }
  },
});
