import React from "react";
import { Ban, Check, CircleDashed, Clock, Loader2, MinusCircle, X } from "lucide-react";
import type { ActionsState } from "../shared.ts";
import { STATE_LABEL } from "./timing.ts";

export const StatusIcon: React.FC<{ state: ActionsState; size?: number }> = ({ state, size = 14 }) => {
  const common = { size, "aria-label": STATE_LABEL[state] } as const;
  let icon: React.ReactNode;
  switch (state) {
    case "running":
      icon = <Loader2 {...common} className="ga-spin" />;
      break;
    case "queued":
      icon = <Clock {...common} />;
      break;
    case "success":
      icon = <Check {...common} strokeWidth={3} />;
      break;
    case "failure":
      icon = <X {...common} strokeWidth={3} />;
      break;
    case "cancelled":
      icon = <Ban {...common} />;
      break;
    case "skipped":
      icon = <MinusCircle {...common} />;
      break;
    default:
      icon = <CircleDashed {...common} />;
  }
  return (
    <span className={`ga-status ga-status--${state}`} title={STATE_LABEL[state]}>
      {icon}
    </span>
  );
};
