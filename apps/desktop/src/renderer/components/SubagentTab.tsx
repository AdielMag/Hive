import React from "react";
import type { TabItem } from "@hive/protocol";
import type { SubagentView } from "../lib/ai/subagents.ts";
import { useSessionStore } from "../store/session-store.ts";
import { SubagentViewer } from "./SubagentViewer.tsx";

export interface SubagentTabProps {
  tab: TabItem;
}

export const SubagentTab: React.FC<SubagentTabProps> = ({ tab }) => {
  const openSubagentModal = useSessionStore((s) => s.openSubagentModal);
  const closeTab = useSessionStore((s) => s.closeTab);

  const view = (tab.subagentView as SubagentView | undefined) ?? {
    toolCallId: tab.subagentToolCallId ?? tab.id,
    agentId: tab.subagentAgentId,
    type: "subagent",
    description: tab.title,
    prompt: "",
    tags: [],
    background: false,
    status: "running",
  };

  return (
    <div className="subagent-tab">
      <SubagentViewer
        view={view}
        sessionPath={tab.parentSessionPath}
        activeKey={tab.parentActiveKey}
        onOpenModal={() => {
          openSubagentModal({
            view,
            parentSessionPath: tab.parentSessionPath,
            parentActiveKey: tab.parentActiveKey,
            projectId: tab.projectId,
          });
        }}
        onClose={() => {
          void closeTab(tab.id);
        }}
      />
    </div>
  );
};
