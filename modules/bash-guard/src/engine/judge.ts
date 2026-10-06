/**
 * Jev tier policy (pure, no I/O): which commands are worth a remote judgement,
 * how the command is redacted before leaving the machine, and how Jev's answers map
 * to a decision. The network client lives in `../jev.ts`.
 *
 * Invariants:
 *  - Only commands the deterministic engine did NOT flag are ever sent.
 *  - Jev can only escalate to a confirm prompt; it never overrides a rule hit.
 *  - Fail-open on any missing/invalid answer (deterministic rules still protect).
 */

import { parseCommand, type Segment } from "./tokenize.ts";

/** Thresholds measured in jev-guard: confirm when risk >= 1.5 (0-3 scale) or approval p >= 0.75. */
export const JEV_THRESHOLDS = { riskConfirm: 1.5, approvalConfirm: 0.75, riskHigh: 2.5 } as const;

export interface JevAnswers {
  /** Position on the 0-3 risk score. */
  risk?: number | undefined;
  /** Probability (0-1) that a careful engineer would want human approval. */
  approval?: number | undefined;
}

export interface JevDecision {
  confirm: boolean;
  severity: "high" | "moderate";
  risk?: number | undefined;
  approval?: number | undefined;
  reason: string;
}

export function decideFromJev(answers: JevAnswers | null | undefined, t = JEV_THRESHOLDS): JevDecision {
  const risk = typeof answers?.risk === "number" && Number.isFinite(answers.risk) ? answers.risk : undefined;
  const approval = typeof answers?.approval === "number" && Number.isFinite(answers.approval) ? answers.approval : undefined;
  const confirm = (risk !== undefined && risk >= t.riskConfirm) || (approval !== undefined && approval >= t.approvalConfirm);
  const stats = [risk !== undefined ? `risk ${risk.toFixed(1)}/3` : null, approval !== undefined ? `approval p=${approval.toFixed(2)}` : null].filter(Boolean).join(", ");
  return {
    confirm,
    severity: risk !== undefined && risk >= t.riskHigh ? "high" : "moderate",
    risk,
    approval,
    reason: confirm ? `Jev flagged this command as risky (${stats}). No built-in rule matched it.` : `Jev: ok (${stats || "no answer"})`,
  };
}

// ---------------------------------------------------------------------------
// redaction
// ---------------------------------------------------------------------------

const REDACTED = "[REDACTED]";

const REDACTIONS: Array<[RegExp, string]> = [
  // URL credentials: scheme://user:pass@host and scheme://token@host
  [/(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/@:]*:[^\s/@]*@/gi, `$1${REDACTED}@`],
  [/(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+@/gi, `$1${REDACTED}@`],
  // Authorization headers / bearer tokens
  [/\b(authorization\s*[:=]\s*)(?:(?:bearer|basic|token)\s+)?[^\s'"]+/gi, `$1${REDACTED}`],
  [/\b((?:x-api-key|x-auth-token|cookie|set-cookie|proxy-authorization)\s*[:=]\s*)[^\s'"]+/gi, `$1${REDACTED}`],
  [/\bbearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, `Bearer ${REDACTED}`],
  // curl -u / --user user:pass
  [/(-u\s+|--user(?:=|\s+))(?:"[^"]*"|'[^']*'|\S+)/gi, `$1${REDACTED}`],
  // password flags: mysql -pPASS, sshpass -p PASS, docker login -p PASS
  [/\b(mysql\s+.*?-p)[^\s"']+/gi, `$1${REDACTED}`],
  [/\b(sshpass\s+-p\s+)\S+/gi, `$1${REDACTED}`],
  [/\b(docker\s+login\s+.*?(?:-p|--password)(?:=|\s+))\S+/gi, `$1${REDACTED}`],
  // aws credentials assignments: aws_secret_access_key value
  [/\b(aws_secret_access_key|aws_access_key_id)\s*[:= ]\s*(?:"[^"]*"|'[^']*'|\S+)/gi, `$1=${REDACTED}`],
  // URL query params: ?api_key=abc&token=xyz (preserves quotes and trailing chars)
  [/([?&](?:api[_-]?key|token|access[_-]?token|secret|password)=)[^&\s"']+/gi, `$1${REDACTED}`],
  // well-known secret shapes
  [/\bsk-[A-Za-z0-9_-]{16,}/g, REDACTED],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/g, REDACTED],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}/g, REDACTED],
  [/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, REDACTED],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}/g, REDACTED],
  [/\bAIza[0-9A-Za-z_-]{35}/g, REDACTED],
  [/\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+/g, REDACTED],
  // secret-looking flags: --password=x, --token x
  [/(--?(?:password|passwd|pass|token|secret|api-?key|access-?key|auth)(?:=|\s+))(?:"[^"]*"|'[^']*'|\S+)/gi, `$1${REDACTED}`],
  // KEY=value assignments where the name looks secret
  [/\b([A-Za-z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|PWD|CREDENTIAL|AUTH)[A-Za-z0-9_]*)=(?:"[^"]*"|'[^']*'|\S+)/gi, `$1=${REDACTED}`],
];

export function redactSecrets(command: string): string {
  let out = command;
  for (const [re, rep] of REDACTIONS) out = out.replace(re, rep);
  return out;
}

// ---------------------------------------------------------------------------
// allowlist gate
// ---------------------------------------------------------------------------

const READ_ONLY_PROGRAMS = new Set([
  "ls", "dir", "pwd", "cd", "echo", "printf", "cat", "head", "tail", "wc", "cut", "tr", "diff", "cmp", "stat", "file", "which", "where",
  "whoami", "uname", "hostname", "tree", "du", "df", "basename", "dirname", "realpath", "readlink", "true", "false", "test", "[", "sleep",
  "jq", "less", "more", "nl", "tac", "id", "uptime", "ps", "type", "pushd", "popd", "wait", "exit",
]);
const GIT_READ_ONLY = new Set(["status", "diff", "log", "show", "rev-parse", "ls-files", "blame", "describe", "shortlog", "ls-tree", "cat-file", "rev-list", "grep"]);
const PKG_MANAGERS = new Set(["npm", "pnpm", "yarn", "bun"]);
const PKG_READ_ONLY = new Set(["test", "t", "ls", "list", "view", "outdated", "why", "-v", "--version"]);
const PKG_RUN_ALLOWED = /^(test|lint|typecheck|type-check|check)(:[\w:-]+)?$/;
const VERSION_ONLY = new Set(["node", "python", "python3", "tsc", "npm", "pnpm", "yarn", "go", "cargo", "rustc", "java", "ruby", "php", "bun", "deno", "git"]);

function segmentAllowed(seg: Segment): boolean {
  if (!seg.program) return seg.assignments.length === 0 && seg.subs.length === 0 && seg.redirects.length === 0;
  for (const r of seg.redirects) {
    if (r.op === "<" || r.op === "<<" || r.op === "<<-" || r.op === "<<<") continue;
    if (/^(>&|<&)$/.test(r.op) && /^(\d+-?|-)$/.test(r.target)) continue;
    if (r.target === "/dev/null") continue;
    return false;
  }
  const p = seg.program;
  const a = seg.args;
  if (a.length === 1 && (a[0] === "--version" || a[0] === "-v" || a[0] === "-V") && VERSION_ONLY.has(p)) return true;
  if (p === "git") {
    let k = 0;
    while (k < a.length && (a[k] as string).startsWith("-")) k += a[k] === "-C" || a[k] === "-c" ? 2 : 1;
    const sub = a[k];
    if (!sub) return false;
    if (GIT_READ_ONLY.has(sub)) {
      if (sub === "diff" && a.some((x) => x.startsWith("--output"))) return false;
      return true;
    }
    if (sub === "branch") return a.slice(k + 1).every((x) => ["-a", "-r", "-v", "-vv", "--list", "--show-current", "--all"].includes(x));
    if (sub === "remote") return a.slice(k + 1).every((x) => x === "-v");
    return false;
  }
  if (p === "rg" || p === "grep" || p === "egrep" || p === "fgrep" || p === "ag" || p === "fd") {
    return !a.some((x) => x === "--pre" || x.startsWith("--pre="));
  }
  if (PKG_MANAGERS.has(p)) {
    const sub = a[0];
    if (!sub) return false;
    if (PKG_READ_ONLY.has(sub)) return true;
    if (sub === "run" || sub === "run-script") return PKG_RUN_ALLOWED.test(a[1] ?? "");
    return false;
  }
  if (p === "tsc") return a.includes("--noEmit");
  if (p === "vitest" || p === "jest" || p === "eslint") return true;
  if (p === "prettier") return a.includes("--check");
  if (p === "find") return !a.some((x) => /^-(delete|exec|execdir|ok|okdir|fprint\w*|fls)$/.test(x));
  return READ_ONLY_PROGRAMS.has(p);
}

/** True when every segment of the command is a recognised read-only operation. */
export function isReadOnlyAllowlisted(command: string): boolean {
  const parsed = parseCommand(command);
  if (!parsed.ok || parsed.segments.length === 0) return false;
  for (const seg of parsed.segments) {
    if (!segmentAllowed(seg)) return false;
    for (const sub of seg.subs) if (!isReadOnlyAllowlisted(sub.text)) return false;
  }
  return true;
}

/** Whether a command that the rules did not flag should be sent to Jev. */
export function shouldJudge(command: string, dangerous: boolean): boolean {
  if (dangerous) return false;
  if (!command.trim()) return false;
  return !isReadOnlyAllowlisted(command);
}
