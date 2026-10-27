/**
 * Pi CLI + Pi extension update check/install. Latest versions come from the npm registry.
 * - Pi CLI: `npm install -g @earendil-works/pi-coding-agent@latest` (into the prefix Pi lives in).
 * - Extensions (pi-antigravity): `npm install <pkg>@latest` inside `<piAgentDir>/npm`, where Pi keeps
 *   its `npm:` packages (see `packages` in settings.json).
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { compareVersions } from "@hive/pi-adapter";
import type { PiExtensionUpdate, PiUpdateInfo } from "@hive/protocol";

const PACKAGE = "@earendil-works/pi-coding-agent";
/** Pi extensions Hive keeps up to date alongside Pi itself. */
const EXTENSIONS = ["pi-antigravity", "@gotgenes/pi-anthropic-auth"];
const TIMEOUT_MS = 10_000;
const NPM_TIMEOUT_MS = 5 * 60 * 1000;
export const EXT_NAME_REGEX = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

const readVersion = (pkgJsonPath: string): string | undefined => {
  try {
    return (JSON.parse(readFileSync(pkgJsonPath, "utf8")) as { version?: string }).version;
  } catch {
    return undefined;
  }
};

async function latestOnNpm(pkg: string): Promise<string> {
  const res = await fetch(`https://registry.npmjs.org/${pkg.replace("/", "%2F")}/latest`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`npm registry returned ${res.status}`);
  const latestVersion = ((await res.json()) as { version?: string }).version;
  if (!latestVersion) throw new Error("npm registry response has no version");
  return latestVersion;
}

const errMsg = (err: unknown): string => (err instanceof Error ? (err.name === "TimeoutError" ? "request timed out" : err.message) : String(err));

function runNpm(args: string[], cwd?: string, timeoutMs = NPM_TIMEOUT_MS): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    let output = "";
    let settled = false;
    const child = spawn(process.platform === "win32" ? "npm.cmd" : "npm", args, {
      cwd,
      shell: process.platform === "win32",
      windowsHide: true,
    });
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        child.kill();
      } catch {}
      resolve({ ok: false, output: `npm timed out after ${Math.round(timeoutMs / 1000)}s` });
    }, timeoutMs);

    const collect = (d: Buffer) => {
      output = (output + d.toString()).slice(-2000);
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: false, output: `Could not run npm: ${err.message}` });
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        ok: code === 0,
        output: output.trim().split(/\r?\n/).slice(-3).join("\n") || `npm exited with code ${code}`,
      });
    });
  });
}

export class PiUpdaterService {
  constructor(
    private readonly getPackageRoot: () => string | undefined,
    private readonly getAgentDir: () => string = () => process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent"),
  ) {}

  private currentVersion(): string | undefined {
    const root = this.getPackageRoot();
    return root ? readVersion(join(root, "package.json")) : undefined;
  }

  /** Where Pi installs its `npm:` extension packages. */
  private extensionsDir(): string {
    return join(this.getAgentDir(), "npm");
  }

  private getTrackedExtensions(): string[] {
    try {
      const pkgPath = join(this.extensionsDir(), "package.json");
      if (existsSync(pkgPath)) {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { dependencies?: Record<string, string> };
        const deps = Object.keys(pkg.dependencies ?? {}).filter((d) => EXT_NAME_REGEX.test(d));
        if (deps.length > 0) {
          // Merge detected dependencies with standard ones, keeping order and uniqueness
          return Array.from(new Set([...deps, ...EXTENSIONS]));
        }
      }
    } catch {
      // ignore read error and fall back
    }
    return EXTENSIONS;
  }

  private async checkExtension(name: string): Promise<PiExtensionUpdate | undefined> {
    const currentVersion = readVersion(join(this.extensionsDir(), "node_modules", name, "package.json"));
    if (!currentVersion) return undefined; // not installed: nothing to update
    try {
      const latestVersion = await latestOnNpm(name);
      return { name, hasUpdate: compareVersions(latestVersion, currentVersion) > 0, currentVersion, latestVersion };
    } catch (err) {
      return { name, hasUpdate: false, currentVersion, error: `Couldn't reach the npm registry (${errMsg(err)})` };
    }
  }

  async check(): Promise<PiUpdateInfo> {
    const currentVersion = this.currentVersion();
    const extensionsToCheck = this.getTrackedExtensions();
    const extensions = (await Promise.all(extensionsToCheck.map((n) => this.checkExtension(n)))).filter((e): e is PiExtensionUpdate => !!e);
    const extUpdate = extensions.some((e) => e.hasUpdate);
    if (!currentVersion) return { hasUpdate: extUpdate, error: "Pi CLI was not detected", extensions };
    try {
      const latestVersion = await latestOnNpm(PACKAGE);
      const cliHasUpdate = compareVersions(latestVersion, currentVersion) > 0;
      return { hasUpdate: cliHasUpdate || extUpdate, cliHasUpdate, currentVersion, latestVersion, extensions };
    } catch (err) {
      return { hasUpdate: extUpdate, currentVersion, error: `Couldn't reach the npm registry (${errMsg(err)})`, extensions };
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

  async install(target?: string): Promise<{ success: boolean; message: string }> {
    const info = await this.check();
    const messages: string[] = [];
    let success = true;

    const shouldUpdateCli = !target || target === "all" || target === "cli";
    const shouldUpdateExtensions = !target || target === "all" || target === "extensions" || (target !== "cli");

    if (shouldUpdateCli && info.cliHasUpdate) {
      const args = ["install", "-g", `${PACKAGE}@latest`];
      const prefix = this.prefix();
      if (prefix) {
        if (process.platform === "win32" && /\s/.test(prefix)) {
          args.push(`--prefix="${prefix}"`);
        } else {
          args.push("--prefix", prefix);
        }
      }
      const res = await runNpm(args);
      success &&= res.ok;
      messages.push(res.ok ? `Pi CLI updated to ${info.latestVersion ?? "latest"}.` : `Pi CLI: ${res.output}`);
    }

    if (shouldUpdateExtensions) {
      const dir = this.extensionsDir();
      for (const ext of info.extensions ?? []) {
        if (!ext.hasUpdate) continue;
        if (target && target !== "all" && target !== "extensions" && target !== ext.name) continue;
        if (!existsSync(dir)) {
          success = false;
          messages.push(`${ext.name}: ${dir} not found`);
          continue;
        }
        if (!EXT_NAME_REGEX.test(ext.name)) {
          success = false;
          messages.push(`Refused to install invalid extension name: ${ext.name}`);
          continue;
        }
        const res = await runNpm(["install", `${ext.name}@latest`], dir);
        success &&= res.ok;
        messages.push(res.ok ? `${ext.name} updated to ${ext.latestVersion}.` : `${ext.name}: ${res.output}`);
      }
    }

    if (!messages.length) {
      if (target === "cli") {
        if (info.error) return { success: false, message: info.error };
        return { success: true, message: "Pi CLI is already up to date." };
      }
      if (target === "extensions") {
        const extError = info.extensions?.find((e) => e.error)?.error;
        if (extError) return { success: false, message: extError };
        return { success: true, message: "Extensions are already up to date." };
      }
      if (target && target !== "all") {
        const ext = info.extensions?.find((e) => e.name === target);
        if (ext?.error) return { success: false, message: ext.error };
        return { success: true, message: `${target} is already up to date.` };
      }
      if (info.error) return { success: false, message: info.error };
      const extError = info.extensions?.find((e) => e.error)?.error;
      if (extError) return { success: false, message: extError };
      return { success: true, message: "Everything is already up to date." };
    }
    if (success) messages.push("Restart Hive to use the new versions.");
    return { success, message: messages.join("\n") };
  }
}
