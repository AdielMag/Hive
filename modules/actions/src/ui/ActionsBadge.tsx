/** Rail badge: spinner dot while runs are active, red dot when the latest run on this branch failed. */
import React from "react";
import type { ModuleHost } from "@hive/module-sdk/renderer";
import { useActionsStore } from "./actions-store.ts";

export const ActionsBadge: React.FC<{ host: ModuleHost }> = () => {
  const runs = useActionsStore((s) => s.runs);
  const branch = useActionsStore((s) => s.repo?.branch);
  const filtered = useActionsStore((s) => s.filters.status !== "all" || s.filters.workflowId !== null);
  const running = runs.filter((r) => r.state === "running").length;
  if (running > 0) {
    return (
      <span className="ga-badge ga-badge--running" aria-hidden="true">
        {running > 9 ? "9+" : running}
      </span>
    );
  }
  if (!filtered) {
    const latest = runs.find((r) => r.branch === branch) ?? null;
    if (latest?.state === "failure") return <span className="ga-badge ga-badge--failed" aria-hidden="true" />;
  }
  return null;
};

export function useActionsRailTitle(_host: ModuleHost, baseTitle: string): string {
  const runs = useActionsStore((s) => s.runs);
  const running = runs.filter((r) => r.state === "running").length;
  const queued = runs.filter((r) => r.state === "queued").length;
  const parts = [running > 0 ? `${running} running` : "", queued > 0 ? `${queued} queued` : ""].filter(Boolean);
  return parts.length ? `${baseTitle} • ${parts.join(", ")}` : baseTitle;
}
