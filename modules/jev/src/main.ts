/**
 * Main half: owns the settings file (API key included), exposes it to the renderer without the key, publishes
 * the file paths to Pi sessions through this process's environment, and reads the usage log the Pi extension
 * appends to. The Jev API itself is called from the Pi extension; main only calls it to test a key.
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { defineMainModule } from "@hive/module-sdk/main";
import {
  applyPatch,
  DEFAULT_SETTINGS,
  JEV_API_URL,
  JEV_ENV,
  JevMethods,
  MODULE_ID,
  normalizeSettings,
  summarizeUsage,
  toView,
  type JevSettings,
  type JevSettingsPatch,
  type JevSettingsView,
  type TestKeyResult,
  type UsageRecord,
  type UsageSummary,
} from "./shared.ts";

const MAX_LOG_BYTES = 2 * 1024 * 1024;
const BALANCE_HEADER = /balance|credit|quota|remaining|limit|usage|spend|billing/i;

export function parseUsageLog(text: string): UsageRecord[] {
  const out: UsageRecord[] = [];
  for (const line of text.split("\n")) {
    if (!line) continue;
    try {
      const r = JSON.parse(line) as UsageRecord;
      if (typeof r.ts === "number" && typeof r.feature === "string") {
        out.push({
          ts: r.ts,
          feature: r.feature,
          model: String(r.model ?? ""),
          inputTokens: Number(r.inputTokens) || 0,
          outputTokens: Number(r.outputTokens) || 0,
          ms: Number(r.ms) || 0,
          ok: r.ok !== false,
          error: typeof r.error === "string" ? r.error : undefined,
        });
      }
    } catch {
      // Torn line from a concurrent append: skip it.
    }
  }
  return out;
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
      try {
        return existsSync(usagePath) ? parseUsageLog(readFileSync(usagePath, "utf8")) : [];
      } catch {
        return [];
      }
    };

    // Keep the log bounded: drop the oldest half when it grows past 2 MB.
    try {
      if (existsSync(usagePath) && statSync(usagePath).size > MAX_LOG_BYTES) {
        const lines = readFileSync(usagePath, "utf8").split("\n").filter(Boolean);
        writeFileSync(usagePath, `${lines.slice(Math.floor(lines.length / 2)).join("\n")}\n`, "utf8");
      }
    } catch {}

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
    ctx.ipc.handle(JevMethods.clearUsage, (): UsageSummary => {
      writeFileSync(usagePath, "", "utf8");
      return summarizeUsage([], read());
    });
  },
});
