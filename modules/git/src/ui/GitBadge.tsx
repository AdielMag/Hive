/** Rail badge + tooltip showing how many commits are ahead of / behind the upstream. */
import React from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { ModuleHost } from "@hive/module-sdk/renderer";
import { useGitStore } from "./git-store.ts";

export const GitBadge: React.FC<{ host: ModuleHost }> = () => {
  const status = useGitStore((s) => s.status);
  const hasAhead = (status?.ahead ?? 0) > 0;
  const hasBehind = (status?.behind ?? 0) > 0;
  if (hasAhead && hasBehind) {
    return (
      <span className="rail__sync-badge rail__sync-badge--both" aria-hidden="true">
        <ArrowUpDown size={8} strokeWidth={2.75} />
      </span>
    );
  }
  if (hasAhead) {
    return (
      <span className="rail__sync-badge rail__sync-badge--ahead" aria-hidden="true">
        <ArrowUp size={8} strokeWidth={2.75} />
      </span>
    );
  }
  if (hasBehind) {
    return (
      <span className="rail__sync-badge rail__sync-badge--behind" aria-hidden="true">
        <ArrowDown size={8} strokeWidth={2.75} />
      </span>
    );
  }
  return null;
};

/** Hook: rail tooltip with the pending push / pull counts. */
export function useGitRailTitle(_host: ModuleHost, baseTitle: string): string {
  const status = useGitStore((s) => s.status);
  const ahead = status?.ahead ?? 0;
  const behind = status?.behind ?? 0;
  if (ahead > 0 && behind > 0) return `${baseTitle} • ${ahead} to push, ${behind} to pull`;
  if (ahead > 0) return `${baseTitle} • ${ahead} to push`;
  if (behind > 0) return `${baseTitle} • ${behind} to pull`;
  return baseTitle;
}
