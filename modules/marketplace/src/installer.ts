import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { PiRuntimeInfo } from "@hive/module-sdk/main";
import { normalizeSource, type MarketplaceInstallResult } from "./shared.ts";

const INSTALL_TIMEOUT_MS = 5 * 60_000;

/** Sources Pi can install directly. Anything else (e.g. plain MCP registry names) is rejected up front. */
export function isInstallableSource(source: string): boolean {
  return /^(npm|git):[^\s-]/.test(source.trim());
}

/** Sources of the user-scope packages Pi has configured (`packages` in Pi's settings.json). */
export async function readInstalledSources(piAgentDir: string): Promise<string[]> {
  let raw: string;
  try {
    raw = await readFile(join(piAgentDir, "settings.json"), "utf8");
  } catch {
    return [];
  }
  try {
    const packages: unknown = (JSON.parse(raw) as { packages?: unknown }).packages;
    if (!Array.isArray(packages)) return [];
    return packages
      .map((p) => (typeof p === "string" ? p : (p as { source?: unknown })?.source))
      .filter((s): s is string => typeof s === "string")
      .map(normalizeSource);
  } catch {
    return [];
  }
}

/** Runs `pi install <source>` with the Pi install Hive found. No shell, so the source is passed verbatim. */
export function installPackage(pi: PiRuntimeInfo, source: string): Promise<MarketplaceInstallResult> {
  return new Promise((resolve) => {
    let output = "";
    let settled = false;
    const finish = (result: MarketplaceInstallResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const child = spawn(pi.nodePath, [pi.cliPath, "install", source], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const collect = (chunk: Buffer) => {
      output = (output + chunk.toString()).slice(-4000);
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);

    const timer = setTimeout(() => {
      child.kill();
      finish({ ok: false, message: "Install timed out after 5 minutes" });
    }, INSTALL_TIMEOUT_MS);

    child.on("error", (err) => finish({ ok: false, message: err.message }));
    child.on("close", (code) => {
      if (code === 0) return finish({ ok: true, message: `Installed ${source}` });
      const lines = output.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      finish({ ok: false, message: lines.at(-1) ?? `pi install exited with code ${code}` });
    });
  });
}
