import React from "react";
import type { ModuleHost, ModuleTab } from "@hive/module-sdk/renderer";
import { PlanDocument } from "./PlanDocument.tsx";

interface Props {
  tab: ModuleTab;
  host: ModuleHost;
}

/** The plan as a regular tab (fallback / "Open as tab"); the inline card in the session is the primary surface. */
export const PlanPreviewerTab: React.FC<Props> = ({ tab, host }) => (
  <PlanDocument host={host} filePath={tab.filePath || "plan.md"} sync />
);
