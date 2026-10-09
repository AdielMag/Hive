import React from "react";
import { Ban, Check, CircleDashed, Clock, Loader2, MinusCircle, X } from "lucide-react";
import type { ActionsState } from "../shared.ts";
import { STATE_LABEL } from "./timing.ts";

/** State glyph. `disc` wraps it in a tinted circle (used on run cards and job nodes). */
export const StatusIcon: React.FC<{ state: ActionsState; size?: number; disc?: boolean }> = ({ state, size = 14, disc = false }) => {
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
  const box = disc ? { width: size + 12, height: size + 12 } : undefined;
  return (
    <span className={`ga-status ga-status--${state}${disc ? " ga-disc" : ""}`} style={box} title={STATE_LABEL[state]}>
      {icon}
    </span>
  );
};
