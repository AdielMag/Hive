/**
 * Pi CLI update check + install. Latest version comes from the npm registry; install runs
 * `npm install -g @earendil-works/pi-coding-agent@latest` (into the same prefix Pi currently lives in).
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { compareVersions } from "@hive/pi-adapter";
import type { PiUpdateInfo } from "@hive/protocol";

const PACKAGE = "@earendil-works/pi-coding-agent";
const TIMEOUT_MS = 10_000;

export class PiUpdaterService {
  constructor(private readonly getPackageRoot: () => string | undefined) {}

  private currentVersion(): string | undefined {
    const root = this.getPackageRoot();
    if (!root) return undefined;
    try {
      return (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version?: string }).version;
    } catch {
      return undefined;
    }
  }

  async check(): Promise<PiUpdateInfo> {
    const currentVersion = this.currentVersion();
    if (!currentVersion) return { hasUpdate: false, error: "Pi CLI was not detected" };
    try {
      const res = await fetch(`https://registry.npmjs.org/${PACKAGE.replace("/", "%2F")}/latest`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`npm registry returned ${res.status}`);
      const latestVersion = ((await res.json()) as { version?: string }).version;
      if (!latestVersion) throw new Error("npm registry response has no version");
      return { hasUpdate: compareVersions(latestVersion, currentVersion) > 0, currentVersion, latestVersion };
    } catch (err) {
      const msg = err instanceof Error ? (err.name === "TimeoutError" ? "request timed out" : err.message) : String(err);
      return { hasUpdate: false, currentVersion, error: `Couldn't reach the npm registry (${msg})` };
    }
  }

  /** Install prefix that owns the current Pi package, so we update in place. */
  private prefix(): string | undefined {
    const root = this.getPackageRoot();
    if (!root) return undefined;
    // <prefix>/node_modules/@scope/pkg (win) or <prefix>/lib/node_modules/@scope/pkg (posix)
    const nodeModules = dirname(dirname(root));
    if (basename(nodeModules) !== "node_modules") return undefined;
    const parent = dirname(nodeModules);
    return basename(parent) === "lib" && process.platform !== "win32" ? dirname(parent) : parent;
  }

  install(): Promise<{ success: boolean; message: string }> {
    return new Promise((resolve) => {
      const args = ["install", "-g", `${PACKAGE}@latest`];
      const prefix = this.prefix();
      if (prefix) args.push("--prefix", prefix);
      let output = "";
      const child = spawn(process.platform === "win32" ? "npm.cmd" : "npm", args, {
        shell: process.platform === "win32",
        windowsHide: true,
      });
      const collect = (d: Buffer) => {
        output = (output + d.toString()).slice(-2000);
      };
      child.stdout.on("data", collect);
      child.stderr.on("data", collect);
      child.on("error", (err) => resolve({ success: false, message: `Could not run npm: ${err.message}` }));
      child.on("close", (code) =>
        resolve(
          code === 0
            ? { success: true, message: "Pi updated. Restart Hive to use the new version." }
            : { success: false, message: output.trim().split(/\r?\n/).slice(-3).join("\n") || `npm exited with code ${code}` },
        ),
      );
    });
  }
}
