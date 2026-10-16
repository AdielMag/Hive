import React from "react";
import type { ModuleHost } from "@hive/module-sdk/renderer";
import { PLAN_TAB_KIND } from "../shared.ts";
import { planFileName, samePlanPath } from "../plan-utils.ts";
import { usePlanStore } from "./plan-store.ts";
import { ModalShell } from "./ModalShell.tsx";
import { PlanDocument } from "./PlanDocument.tsx";

/** The full plan in a popup, opened from the inline card ("Show more"). Shares plan session state with the card. */
export const PlanModal: React.FC<{ host: ModuleHost; filePath: string }> = ({ host, filePath }) => {
  const modalFilePath = usePlanStore((s) => s.modalFilePath);
  const closeModal = usePlanStore((s) => s.closeModal);
  const open = samePlanPath(modalFilePath, filePath);
  if (!open) return null;

  return (
    <ModalShell label="Plan review" onClose={closeModal}>
      <PlanDocument
        host={host}
        filePath={filePath}
        sync={false}
        onClose={closeModal}
        onOpenAsTab={() => {
          host.tabs.open({ kind: PLAN_TAB_KIND, title: planFileName(filePath), filePath, data: {} });
          closeModal();
        }}
      />
    </ModalShell>
  );
};
