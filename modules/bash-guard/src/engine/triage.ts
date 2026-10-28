/**
 * Jev triage policy for commands the deterministic rules DID flag (pure, no I/O).
 *
 * Rules are intentionally broad, so most hits are routine (`git reset --hard` on a throwaway branch,
 * `rm -rf node_modules`). Triage lets an independent Jev opinion drop the prompt for those, and nothing else:
 *
 *  - `critical` rule hits ALWAYS prompt; Jev can never silence them.
 *  - Missing, partial or invalid Jev answers prompt (a rule hit stays a prompt unless Jev clearly says "routine").
 *  - Skipping needs BOTH signals to be low: risk below `riskBelow` AND approval probability below `approvalBelow`.
 *
 * The thresholds are unmeasured for flagged commands; callers log every skip (see `extension/triage-log.ts`).
 */

import type { JevAnswers } from "./judge.ts";

export type TriageSeverity = "critical" | "high" | "moderate";

/** Skip the prompt only when risk < 1.0 (0-3 scale: "read-only or easy to undo") and approval p < 0.4. */
export const TRIAGE_THRESHOLDS = { riskBelow: 1.0, approvalBelow: 0.4 } as const;

export interface TriageDecision {
  action: "prompt" | "skip";
  reason: string;
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function triageRuleHit(severity: TriageSeverity, answers: JevAnswers | null | undefined, t = TRIAGE_THRESHOLDS): TriageDecision {
  if (severity === "critical") return { action: "prompt", reason: "critical rule hits always prompt" };
  if (!answers) return { action: "prompt", reason: "no Jev opinion" };
  const { risk, approval } = answers;
  if (!isNum(risk) || !isNum(approval)) return { action: "prompt", reason: "incomplete Jev answers" };
  if (risk < t.riskBelow && approval < t.approvalBelow) {
    return { action: "skip", reason: `Jev rates this routine (risk ${risk.toFixed(1)}/3, approval p=${approval.toFixed(2)})` };
  }
  return { action: "prompt", reason: `Jev did not clear it (risk ${risk.toFixed(1)}/3, approval p=${approval.toFixed(2)})` };
}
