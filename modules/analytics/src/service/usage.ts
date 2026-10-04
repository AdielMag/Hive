/**
 * UsageService: builds a UsageReport from every Pi session file under ~/.pi/agent/sessions.
 *
 * Session files are append-only, so each file is parsed once and cached by (mtime, size). The cache is
 * persisted to userData so reopening the Usage window after a restart only re-reads changed sessions.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { UsageBucket, UsageReport } from "@hive/protocol";
import { SessionUsageParser } from "@hive/pi-adapter";

interface FileEntry {
  mtimeMs: number;
  size: number;
  buckets: UsageBucket[];
  days: string[];
}

interface CacheFile {
  version: typeof CACHE_VERSION;
  files: Record<string, FileEntry>;
}

const CACHE_VERSION = 2 as const;
const REPORT_TTL_MS = 20_000;
const CONCURRENCY = 6;

export class UsageService {
  private cache: CacheFile;
  private lastReport: UsageReport | null = null;
  private inflight: Promise<UsageReport> | null = null;

  constructor(
    private readonly cachePath: string,
    private readonly sessionsDir: string,
  ) {
    this.cache = this.loadCache();
  }

  async getReport(force = false): Promise<UsageReport> {
    if (!force && this.lastReport && Date.now() - this.lastReport.generatedAt < REPORT_TTL_MS) return this.lastReport;
    this.inflight ??= this.build().finally(() => {
      this.inflight = null;
    });
    this.lastReport = await this.inflight;
    return this.lastReport;
  }

  private async build(): Promise<UsageReport> {
    const started = Date.now();
    const files = await listJsonl(this.sessionsDir);
    const next: Record<string, FileEntry> = {};
    let dirty = files.length !== Object.keys(this.cache.files).length;

    let cursor = 0;
    const worker = async () => {
      while (cursor < files.length) {
        const file = files[cursor++]!;
        try {
          const st = await stat(file);
          const prev = this.cache.files[file];
          if (prev && prev.mtimeMs === st.mtimeMs && prev.size === st.size) {
            next[file] = prev;
            continue;
          }
          next[file] = { mtimeMs: st.mtimeMs, size: st.size, ...parseSessionText(await readFile(file, "utf8")) };
          dirty = true;
        } catch {
          // unreadable / deleted mid-scan: skip
        }
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    this.cache = { version: CACHE_VERSION, files: next };
    if (dirty) this.saveCache();

    const buckets: UsageBucket[] = [];
    const sessionDays: string[][] = [];
    for (const [file, entry] of Object.entries(next)) {
      if (!entry.buckets.length) continue;
      for (const b of entry.buckets) buckets.push({ ...b, session: file });
      sessionDays.push(entry.days);
    }
    return { buckets, sessionDays, sessionFiles: files.length, generatedAt: Date.now(), scanMs: Date.now() - started };
  }

  private loadCache(): CacheFile {
    try {
      if (existsSync(this.cachePath)) {
        const data = JSON.parse(readFileSync(this.cachePath, "utf8")) as CacheFile;
        if (data.version === CACHE_VERSION && data.files) return data;
      }
    } catch {
      // corrupted cache: rebuild
    }
    return { version: CACHE_VERSION, files: {} };
  }

  private saveCache(): void {
    try {
      mkdirSync(dirname(this.cachePath), { recursive: true });
      writeFileSync(this.cachePath, JSON.stringify(this.cache));
    } catch {
      // cache is an optimization only
    }
  }
}

export function parseSessionText(text: string): { buckets: UsageBucket[]; days: string[] } {
  const parser = new SessionUsageParser();
  let start = 0;
  while (start < text.length) {
    let end = text.indexOf("\n", start);
    if (end === -1) end = text.length;
    if (end > start) parser.push(text.slice(start, end));
    start = end + 1;
  }
  return { buckets: parser.result(), days: [...parser.days].sort() };
}

async function listJsonl(root: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (dir: string, depth: number) => {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory() && depth < 3) await walk(full, depth + 1);
      else if (e.isFile() && e.name.endsWith(".jsonl")) out.push(full);
    }
  };
  await walk(root, 0);
  return out;
}
