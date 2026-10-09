/**
 * Main half: owns the settings file (API key included), exposes it to the renderer without the key, publishes
 * the file paths to Pi sessions through this process's environment, and reads the usage log the Pi extension
 * appends to. The Jev API itself is called from the Pi extension; main only calls it to test a key.
 */
import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { defineMainModule } from "@hive/module-sdk/main";
import { SessionScanService } from "./session-scan-io.ts";
import {
  applyPatch,
  DEFAULT_SETTINGS,
  dedupeEvents,
  eventDedupeKey,
  JEV_API_URL,
  JEV_ENV,
  JevMethods,
  MODULE_ID,
  normalizeSettings,
  parseJevEvent,
  parseUsageRecord,
  summarizeImpact,
  summarizeUsage,
  toView,
  type JevEvent,
  type JevInsights,
  type JevSettings,
  type JevSettingsPatch,
  type JevSettingsView,
  type TestKeyResult,
  type UsageRecord,
  type UsageSummary,
} from "./shared.ts";

const MAX_LOG_BYTES = 2 * 1024 * 1024;
const SCAN_WAIT_MS = 2_500;
const BALANCE_HEADER = /balance|credit|quota|remaining|limit|usage|spend|billing/i;

function parseJsonl<T>(text: string, parse: (raw: unknown) => T | null): T[] {
  const out: T[] = [];
  for (const line of text.split("\n")) {
    if (!line) continue;
    try {
      const r = parse(JSON.parse(line));
      if (r) out.push(r);
    } catch {
      // Torn line from a concurrent append: skip it.
    }
  }
  return out;
}

export const parseUsageLog = (text: string): UsageRecord[] => parseJsonl(text, parseUsageRecord);
export const parseEventLog = (text: string): JevEvent[] => parseJsonl(text, parseJevEvent);

/** Keeps a jsonl log bounded: drops the oldest half when it grows past `maxBytes`. */
export function trimLog(path: string, maxBytes = MAX_LOG_BYTES): void {
  try {
    if (existsSync(path) && statSync(path).size > maxBytes) {
      const lines = readFileSync(path, "utf8").split("\n").filter(Boolean);
      writeFileSync(path, `${lines.slice(Math.floor(lines.length / 2)).join("\n")}\n`, "utf8");
    }
  } catch {}
}

/** events.jsonl: the compaction-hint funnel. Main is the only writer; repeats of key + entryId + kind are dropped. */
export function createEventLog(path: string, maxBytes = MAX_LOG_BYTES) {
  trimLog(path, maxBytes);
  const read = (): JevEvent[] => {
    trimLog(path, maxBytes);
    try {
      return existsSync(path) ? dedupeEvents(parseEventLog(readFileSync(path, "utf8"))) : [];
    } catch {
      return [];
    }
  };
  const seen = new Set<string>();
  for (const e of read()) {
    const k = eventDedupeKey(e);
    if (k) seen.add(k);
  }
  return {
    read,
    /** Appends a validated event; returns false for malformed input or a duplicate. */
    append(raw: unknown): boolean {
      const e = parseJevEvent(raw);
      if (!e) return false;
      const k = eventDedupeKey(e);
      if (k && seen.has(k)) return false;
      try {
        mkdirSync(dirname(path), { recursive: true });
        appendFileSync(path, `${JSON.stringify(e)}\n`, "utf8");
      } catch {
        return false;
      }
      if (k) seen.add(k);
      trimLog(path, maxBytes);
      return true;
    },
    clear(): void {
      seen.clear();
      try {
        writeFileSync(path, "", "utf8");
      } catch {}
    },
  };
}

/** Calls GET /v1/models, which validates the key and lists models. Also surfaces any balance-like headers. */
export async function testKey(apiKey: string, fetchImpl: typeof fetch = fetch): Promise<TestKeyResult> {
  if (!apiKey) return { ok: false, error: "No API key saved yet." };
  try {
    const res = await fetchImpl(`${JEV_API_URL}/v1/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      let detail = "";
      try {
        const body = (await res.json()) as { detail?: unknown };
        const d = body?.detail as { message?: string } | string | undefined;
        detail = typeof d === "string" ? d : (d?.message ?? "");
      } catch {}
      return { ok: false, error: res.status === 401 || res.status === 403 ? `Key rejected${detail ? `: ${detail}` : ""}` : `HTTP ${res.status}${detail ? `: ${detail}` : ""}` };
    }
    const body = (await res.json()) as { models?: Array<{ name?: string }> };
    const balanceHeaders: Record<string, string> = {};
    res.headers.forEach((value, name) => {
      if (BALANCE_HEADER.test(name) && !/^(cf-|x-typesafe-request)/i.test(name)) balanceHeaders[name] = value;
    });
    return {
      ok: true,
      models: (body.models ?? []).map((m) => String(m.name)).filter(Boolean),
      ...(Object.keys(balanceHeaders).length ? { balanceHeaders } : {}),
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export default defineMainModule({
  id: MODULE_ID,
  activate(ctx) {
    const dir = ctx.paths.moduleData();
    const configPath = join(dir, "config.json");
    const usagePath = join(dir, "usage.jsonl");
    const events = createEventLog(join(dir, "events.jsonl"));
    const scan = new SessionScanService(join(dir, "scan-cache.json"), join(ctx.paths.piAgentDir, "sessions"));

    const read = (): JevSettings => {
      try {
        return existsSync(configPath) ? normalizeSettings(JSON.parse(readFileSync(configPath, "utf8"))) : { ...DEFAULT_SETTINGS };
      } catch (err) {
        ctx.log.warn("[jev] unreadable config.json, using defaults", err);
        return { ...DEFAULT_SETTINGS };
      }
    };
    const write = (s: JevSettings): void => {
      mkdirSync(dir, { recursive: true });
      writeFileSync(configPath, JSON.stringify(s, null, 2), { encoding: "utf8", mode: 0o600 });
      try {
        chmodSync(configPath, 0o600);
      } catch {
        // chmod is a no-op on Windows.
      }
    };
    const readUsage = (): UsageRecord[] => {
      // Pi sessions append to this file all day; trimLog is a cheap size check unless the file is over the limit.
      trimLog(usagePath);
      try {
        return existsSync(usagePath) ? parseUsageLog(readFileSync(usagePath, "utf8")) : [];
      } catch {
        return [];
      }
    };

    // Keep the log bounded: drop the oldest half when it grows past 2 MB.
    trimLog(usagePath);

    // Pi sessions inherit this process's environment when they are spawned.
    process.env[JEV_ENV.config] = configPath;
    process.env[JEV_ENV.usage] = usagePath;
    ctx.onDispose(() => {
      delete process.env[JEV_ENV.config];
      delete process.env[JEV_ENV.usage];
    });

    ctx.ipc.handle(JevMethods.getSettings, (): JevSettingsView => toView(read()));
    ctx.ipc.handle(JevMethods.saveSettings, (patch: JevSettingsPatch): JevSettingsView => {
      const next = applyPatch(read(), patch ?? {});
      write(next);
      return toView(next);
    });
    ctx.ipc.handle(JevMethods.testKey, (): Promise<TestKeyResult> => testKey(read().apiKey));
    ctx.ipc.handle(JevMethods.getUsage, (): UsageSummary => summarizeUsage(readUsage(), read()));
    ctx.ipc.handle(JevMethods.logEvent, (event: unknown): void => {
      events.append(event);
    });
    ctx.ipc.handle(JevMethods.getInsights, async (opts?: { force?: boolean }): Promise<JevInsights> => {
      const impact = summarizeImpact(readUsage(), events.read(), read());
      // A cold scan can take a while: wait briefly, then hand back what we have (the scan keeps running and is cached).
      const pending = scan.get(opts?.force === true).catch(() => null);
      const timeout = new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), SCAN_WAIT_MS).unref?.();
      });
      return { impact, scan: (await Promise.race([pending, timeout])) ?? scan.peek() };
    });
    ctx.ipc.handle(JevMethods.clearUsage, (): UsageSummary => {
      writeFileSync(usagePath, "", "utf8");
      events.clear();
      return summarizeUsage([], read());
    });
  },
});
