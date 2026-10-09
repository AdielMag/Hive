/**
 * Thin IO around session-scan.ts: walks the Pi sessions dir, parses only files modified in the last 30 days,
 * and caches each file's result by (mtime, size) like modules/analytics/src/service/usage.ts (session files are append-only).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { SessionScanEntry, SessionScanSummary } from "./shared.ts";
import { parseSessionScan, SCAN_WINDOW_DAYS, summarizeScan } from "./session-scan.ts";

interface CachedFile {
  mtimeMs: number;
  size: number;
  entry: SessionScanEntry;
}

interface CacheFile {
  version: typeof CACHE_VERSION;
  files: Record<string, CachedFile>;
}

const CACHE_VERSION = 1 as const;
const SUMMARY_TTL_MS = 30_000;
const CONCURRENCY = 6;

export class SessionScanService {
  private cache: CacheFile;
  private last: SessionScanSummary | null = null;
  private inflight: Promise<SessionScanSummary> | null = null;

  constructor(
    private readonly cachePath: string,
    private readonly sessionsDir: string,
  ) {
    this.cache = this.loadCache();
  }

  /** Latest finished summary (stale or not), null before the first scan completes. */
  peek(): SessionScanSummary | null {
    return this.last;
  }

  /** Cached summary when fresh, otherwise one (shared) scan. */
  get(force = false, now = Date.now()): Promise<SessionScanSummary> {
    if (!force && this.last && now - this.last.generatedAt < SUMMARY_TTL_MS) return Promise.resolve(this.last);
    this.inflight ??= this.build()
      .then((s) => (this.last = s))
      .finally(() => {
        this.inflight = null;
      });
    return this.inflight;
  }

  private async build(): Promise<SessionScanSummary> {
    const cutoff = Date.now() - SCAN_WINDOW_DAYS * 24 * 3600_000;
    const files = await listJsonl(this.sessionsDir);
    const next: Record<string, CachedFile> = {};
    const entries: SessionScanEntry[] = [];
    let dirty = false;
    let cursor = 0;
    const worker = async () => {
      while (cursor < files.length) {
        const file = files[cursor++]!;
        try {
          const st = await stat(file);
          if (st.mtimeMs < cutoff) continue;
          const prev = this.cache.files[file];
          if (prev && prev.mtimeMs === st.mtimeMs && prev.size === st.size) {
            next[file] = prev;
            entries.push(prev.entry);
            continue;
          }
          const entry = parseSessionScan(await readFile(file, "utf8"));
          next[file] = { mtimeMs: st.mtimeMs, size: st.size, entry };
          entries.push(entry);
          dirty = true;
        } catch {
          // unreadable / deleted mid-scan: skip
        }
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    if (dirty || Object.keys(next).length !== Object.keys(this.cache.files).length) {
      this.cache = { version: CACHE_VERSION, files: next };
      this.saveCache();
    }
    return summarizeScan(entries);
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
