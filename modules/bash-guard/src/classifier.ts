import type { DangerSeverity } from "./shared.ts";
import { analyzeCommand, collectSegments } from "./engine/analyze.ts";
import { LEGACY_RULES } from "./engine/legacy.ts";

/** Raw-string rule shape (kept for compatibility; see `DANGEROUS_RULES`). */
export interface ClassificationRule {
  id: string;
  title: string;
  severity: DangerSeverity;
  reason: string;
  pattern: RegExp;
}

export interface ClassificationResult {
  dangerous: boolean;
  severity?: DangerSeverity;
  ruleId?: string;
  ruleTitle?: string;
  reason?: string;
  matchedSegment?: string;
  fullCommand: string;
}

/**
 * Legacy raw-string rules. The tokenizer-based engine (`./engine`) is the source of truth;
 * these regexes are only the fail-closed fallback for commands that cannot be parsed
 * (unbalanced quotes) and are exported for backwards compatibility.
 */
export const DANGEROUS_RULES: readonly ClassificationRule[] = LEGACY_RULES;

/** Max command length inspected by the parser (16KB) to avoid regex/parser hangs on huge inputs. */
const MAX_COMMAND_LENGTH = 16_384;

/**
 * Splits a command into its individual segments (pipelines, `&&`/`||`/`;` chains, subshells,
 * command substitutions and unwrapped `bash -c "..."` strings).
 */
export function extractCommandSegments(rawCommand: string): string[] {
  const capped = rawCommand.length > MAX_COMMAND_LENGTH ? rawCommand.slice(0, MAX_COMMAND_LENGTH) : rawCommand;
  return collectSegments(capped);
}

/**
 * Classifies a command against destructive rules (quote-aware, wrapper-aware).
 */
export function classifyBashCommand(command: string): ClassificationResult {
  const fullCommand = command.trim();
  if (!fullCommand) return { dangerous: false, fullCommand };

  const toAnalyze = fullCommand.length > MAX_COMMAND_LENGTH ? fullCommand.slice(0, MAX_COMMAND_LENGTH) : fullCommand;
  const hit = analyzeCommand(toAnalyze);
  if (hit) {
    return {
      dangerous: true,
      severity: hit.severity,
      ruleId: hit.id,
      ruleTitle: hit.title,
      reason: hit.reason,
      matchedSegment: hit.matchedSegment,
      fullCommand,
    };
  }
  if (fullCommand.length > MAX_COMMAND_LENGTH) {
    return {
      dangerous: true,
      severity: "high",
      ruleId: "excessive-length",
      ruleTitle: "Excessively Large Command",
      reason: `Command length (${fullCommand.length} chars) exceeds the safety inspection cap (16KB) and cannot be verified safe.`,
      matchedSegment: fullCommand.slice(0, 200) + "...",
      fullCommand,
    };
  }
  return { dangerous: false, fullCommand };
}
