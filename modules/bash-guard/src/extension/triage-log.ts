/**
 * Append-only JSONL log of prompts that Jev triage skipped, so the thresholds can be reviewed against real data
 * before they are loosened. Never throws. The command is redacted before it is written.
 *
 * Location: `BASH_GUARD_TRIAGE_LOG`, else `bash-guard-triage.jsonl` next to the Jev usage log (`HIVE_JEV_USAGE`),
 * else nothing is written (stderr only).
 */

import { appendFileSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { redactSecrets } from "../engine/judge.ts";

const MAX_BYTES = 1_000_000;

export interface TriageLogRecord {
  ts: number;
  event: "jev-triaged";
  command: string;
  ruleId: string;
  severity: string;
  risk?: number | undefined;
  approval?: number | undefined;
  reason: string;
}

export function triageLogPath(env: Record<string, string | undefined> = process.env): string | null {
  if (env.BASH_GUARD_TRIAGE_LOG) return env.BASH_GUARD_TRIAGE_LOG;
  if (env.HIVE_JEV_USAGE) return join(dirname(env.HIVE_JEV_USAGE), "bash-guard-triage.jsonl");
  return null;
}

export function logTriageSkip(rec: Omit<TriageLogRecord, "ts" | "event">, env: Record<string, string | undefined> = process.env): void {
  try {
    const line: TriageLogRecord = { ts: Date.now(), event: "jev-triaged", ...rec, command: redactSecrets(rec.command) };
    console.error(`bash-guard: Jev triage skipped prompt for ${line.ruleId}: ${line.reason}`);
    const file = triageLogPath(env);
    if (!file) return;
    mkdirSync(dirname(file), { recursive: true });
    try {
      if (statSync(file).size > MAX_BYTES) {
        const kept = readFileSync(file, "utf8").split("\n").slice(-2000).join("\n");
        writeFileSync(file, kept.endsWith("\n") ? kept : `${kept}\n`, "utf8");
      }
    } catch {
      // missing file: nothing to trim
    }
    appendFileSync(file, `${JSON.stringify(line)}\n`, "utf8");
  } catch {
    // logging must never affect the guard
  }
}
