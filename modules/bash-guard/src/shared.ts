/**
 * Contract between bash-guard module halves.
 */

export const MODULE_ID = "bash-guard";
export const DANGEROUS_BASH_KIND = "dangerous_bash_approval";

export type DangerSeverity = "critical" | "high" | "moderate";

export interface DangerousBashPayload {
  kind: typeof DANGEROUS_BASH_KIND;
  command: string;
  severity: DangerSeverity;
  ruleId: string;
  ruleTitle: string;
  reason: string;
  matchedSegment?: string;
  /** "rule" = a deterministic rule matched; "jev" = only Jev's risk assessment flagged it. */
  source?: "rule" | "jev";
  /** Plain-language explanation written by a cheap model (display-only; absent when unavailable). */
  description?: { summary: string; impact: string };
  /** Jev's opinion when it was consulted: risk on a 0-3 scale, approval as a probability. */
  jev?: { risk?: number; approval?: number };
}

export function isDangerousBashPayload(val: unknown): val is DangerousBashPayload {
  if (!val || typeof val !== "object") return false;
  const p = val as Partial<DangerousBashPayload>;
  return p.kind === DANGEROUS_BASH_KIND && typeof p.command === "string" && typeof p.reason === "string";
}

export function parseDangerousBashMessage(messageText: string | undefined): DangerousBashPayload | null {
  if (!messageText) return null;
  try {
    const parsed = JSON.parse(messageText);
    return isDangerousBashPayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
