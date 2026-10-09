/**
 * Phase 2 of the Jev analytics: after-the-fact signals mined from Pi session JSONL files.
 * Pure on purpose (no fs): main reads the files and caches `parseSessionScan` results per (mtime, size).
 *
 * Session entry shapes used (Pi session format v3, one JSON object per line):
 * - `{type:"session", cwd}` header
 * - `{type:"message", message:{role:"assistant", content:[{type:"toolCall", name, arguments}], usage:{input, cacheRead, cacheWrite}}}`
 * - `{type:"compaction"}` once per compaction
 */
import type { SessionGroupStats, SessionScanEntry, SessionScanSummary } from "./shared.ts";

/** The agent re-reading a file within this many tool calls after sending it to ask_jev cancels the saving. */
export const REREAD_WINDOW = 5;
export const SCAN_WINDOW_DAYS = 30;
export const SCAN_CAVEAT = "Correlation, not causation: sessions that use ask_jev also differ in length, task and model.";

const isAbsolute = (p: string): boolean => p.startsWith("/") || /^[a-zA-Z]:\//.test(p);

/**
 * Canonical form for comparing paths across the shapes seen in sessions (`C:\x`, `C:/x`, `/c/x`, relative to cwd):
 * forward slashes, `.`/`..` collapsed, drive letter lower-cased.
 */
export function normalizePath(path: string, cwd = ""): string {
  let p = path.replace(/\\/g, "/");
  const posixDrive = /^\/([a-zA-Z])\/(.*)$/.exec(p);
  if (posixDrive) p = `${posixDrive[1]}:/${posixDrive[2]}`;
  if (!isAbsolute(p) && cwd) p = `${normalizePath(cwd)}/${p}`;
  const drive = /^([a-zA-Z]):\//.exec(p);
  const prefix = drive ? `${drive[1]!.toLowerCase()}:/` : p.startsWith("/") ? "/" : "";
  const out: string[] = [];
  for (const seg of p.slice(prefix.length).split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") out.pop();
    else out.push(seg);
  }
  const joined = out.join("/");
  // Windows paths are case-insensitive.
  return prefix + (drive ? joined.toLowerCase() : joined);
}

const obj = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {});
const tokens = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);

/** Parses one session file's text. Torn or unknown lines are skipped. */
export function parseSessionScan(text: string): SessionScanEntry {
  const out: SessionScanEntry = { usedJev: false, filesSent: 0, reread: 0, turns: 0, inputTokens: 0, compactions: 0 };
  let cwd = "";
  let toolIndex = 0;
  const pending: Array<{ path: string; at: number; hit: boolean }> = [];
  let start = 0;
  while (start < text.length) {
    let end = text.indexOf("\n", start);
    if (end === -1) end = text.length;
    const line = text.slice(start, end);
    start = end + 1;
    if (!line.trim()) continue;
    let entry: Record<string, unknown>;
    try {
      entry = obj(JSON.parse(line));
    } catch {
      continue;
    }
    if (entry.type === "session") {
      if (typeof entry.cwd === "string") cwd = entry.cwd;
    } else if (entry.type === "compaction") {
      out.compactions += 1;
    } else if (entry.type === "message") {
      const message = obj(entry.message);
      if (message.role !== "assistant") continue;
      const usage = obj(message.usage);
      const fed = tokens(usage.input) + tokens(usage.cacheRead) + tokens(usage.cacheWrite);
      if (fed > 0) {
        out.turns += 1;
        out.inputTokens += fed;
      }
      if (!Array.isArray(message.content)) continue;
      for (const part of message.content) {
        const p = obj(part);
        if (p.type !== "toolCall") continue;
        toolIndex += 1;
        const args = obj(p.arguments);
        if (p.name === "ask_jev") {
          out.usedJev = true;
          // Single call: args.files. Batch call: args.items[].files.
          const sent: unknown[] = [];
          if (Array.isArray(args.files)) sent.push(...args.files);
          if (Array.isArray(args.items)) {
            for (const item of args.items) {
              const files = obj(item).files;
              if (Array.isArray(files)) sent.push(...files);
            }
          }
          for (const f of sent) {
            if (typeof f !== "string" || !f) continue;
            out.filesSent += 1;
            pending.push({ path: normalizePath(f, cwd), at: toolIndex, hit: false });
          }
        } else if (p.name === "read" && typeof args.path === "string") {
          const path = normalizePath(args.path, cwd);
          for (const ref of pending) {
            if (!ref.hit && ref.path === path && toolIndex > ref.at && toolIndex - ref.at <= REREAD_WINDOW) {
              ref.hit = true;
              out.reread += 1;
            }
          }
        }
      }
      // Refs older than the window can never match again.
      while (pending.length && toolIndex - pending[0]!.at > REREAD_WINDOW) pending.shift();
    }
  }
  return out;
}

function group(entries: readonly SessionScanEntry[]): SessionGroupStats {
  const turns = entries.reduce((n, e) => n + e.turns, 0);
  const inputTokens = entries.reduce((n, e) => n + e.inputTokens, 0);
  const compactions = entries.reduce((n, e) => n + e.compactions, 0);
  return {
    sessions: entries.length,
    turns,
    avgInputTokensPerTurn: turns > 0 ? inputTokens / turns : null,
    compactions,
    compactionsPerSession: entries.length > 0 ? compactions / entries.length : null,
  };
}

/** Rolls per-session entries up into the scan summary. */
export function summarizeScan(entries: readonly SessionScanEntry[], now = Date.now()): SessionScanSummary {
  const filesSent = entries.reduce((n, e) => n + e.filesSent, 0);
  const reread = entries.reduce((n, e) => n + e.reread, 0);
  return {
    generatedAt: now,
    windowDays: SCAN_WINDOW_DAYS,
    scannedSessions: entries.length,
    reread: { filesSent, reread, rate: filesSent > 0 ? reread / filesSent : null },
    withJev: group(entries.filter((e) => e.usedJev)),
    withoutJev: group(entries.filter((e) => !e.usedJev)),
    caveat: SCAN_CAVEAT,
  };
}
