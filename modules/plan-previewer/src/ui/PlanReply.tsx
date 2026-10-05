import React from "react";
import { Bot, X } from "lucide-react";
import type { ModuleHost } from "@hive/module-sdk/renderer";
import { usePlanStore } from "./plan-store.ts";

/** The agent's latest reply to the review, dismissible. Renders nothing when there is none (or it was dismissed). */
export const PlanReply: React.FC<{ Markdown: ModuleHost["ui"]["Markdown"] }> = ({ Markdown }) => {
  const reply = usePlanStore((s) => s.planData?.agentResponses?.at(-1));
  const dismissedAt = usePlanStore((s) => s.dismissedReplyAt);
  const dismissReply = usePlanStore((s) => s.dismissReply);
  if (!reply || reply.timestamp === dismissedAt) return null;
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
