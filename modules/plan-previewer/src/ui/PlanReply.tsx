import React from "react";
import { Bot, X } from "lucide-react";
import type { ModuleHost } from "@hive/module-sdk/renderer";
import { usePlan } from "./plan-store.ts";

/** The agent's latest reply to the review, dismissible. Renders nothing when there is none (or it was dismissed). */
export const PlanReply: React.FC<{ Markdown: ModuleHost["ui"]["Markdown"] }> = ({ Markdown }) => {
  const { planData, dismissedReplyAt, dismissReply } = usePlan();
  const reply = planData?.agentResponses?.at(-1);
  if (!reply || reply.timestamp === dismissedReplyAt) return null;
  return (
    <aside className="plan-reply" aria-label="Agent reply">
      <div className="plan-reply__head">
        <Bot size={13} aria-hidden="true" />
        <span>Agent reply</span>
        <button
          type="button"
          className="ui-btn ui-btn--ghost ui-btn--sm ui-btn--icon"
          aria-label="Dismiss agent reply"
          onClick={() => dismissReply(reply.timestamp)}
        >
          <X size={12} />
        </button>
      </div>
      <div className="plan-reply__body">
        <Markdown text={reply.text} />
      </div>
    </aside>
  );
};
