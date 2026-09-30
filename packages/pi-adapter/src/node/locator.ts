/**
 * Find the user's installed Pi (plan decision D3: use the installed `pi`, same version as the
 * terminal). Resolution order:
 *   1. PI_STUDIO_PI_CLI (cli.js, package root, or an install dir) [+ PI_STUDIO_NODE]
 *   2. `pi` launchers on PATH (project-local node_modules/.bin entries are skipped)
 *   3. Known install locations (e.g. %LOCALAPPDATA%\pi-node\current on Windows)
 * Pi is spawned as `<node> <cli.js>` without a shell, so paths with spaces are safe.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { homedir as osHomedir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import type { PiInstallInfo, PiLocateResult } from "@pi-studio/protocol";
import { MIN_PI_VERSION, TESTED_MAX_PI_VERSION, compareVersions, piSupport } from "../version.ts";

const PACKAGE_NAME = "@earendil-works/pi-coding-agent";
const PACKAGE_SEGMENTS = ["node_modules", "@earendil-works", "pi-coding-agent"] as const;
/** Pi's own engines requirement (package.json "engines"). */
const MIN_NODE_VERSION = "22.19.0";

export interface LocateOptions {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  homedir?: string;
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function readPackage(root: string): { name?: string; version?: string } | null {
  try {
    return JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { name?: string; version?: string };
  } catch {
    return null;
  }
}

function isPiPackageRoot(root: string): boolean {
  return readPackage(root)?.name === PACKAGE_NAME;
}

/** Walk up from a file inside the package (e.g. dist/bundle/cli.js) to the package root. */
function packageRootAbove(path: string): string | null {
  let dir = dirname(path);
  for (let i = 0; i < 6; i++) {
    if (isPiPackageRoot(dir)) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/** Accepts cli.js, the package root, or an install dir containing node_modules/@earendil-works/... */
function packageRootFrom(input: string): string | null {
  const path = resolve(input);
  if (isPiPackageRoot(path)) return path;
  const nested = join(path, ...PACKAGE_SEGMENTS);
  if (isPiPackageRoot(nested)) return nested;
  if (isFile(path)) return packageRootAbove(path);
  return null;
}

function packageRootFromLauncher(launcher: string): string | null {
  let real = launcher;
  try {
    real = realpathSync(launcher);
  } catch {
    // keep the original path
  }
  // POSIX global installs symlink bin/pi -> .../pi-coding-agent/dist/bundle/cli.js
  const above = packageRootAbove(real);
  if (above) return above;
  const dir = dirname(launcher);
  for (const candidate of [join(dir, ...PACKAGE_SEGMENTS), join(dir, "..", "lib", ...PACKAGE_SEGMENTS)]) {
    if (isPiPackageRoot(candidate)) return resolve(candidate);
  }
  return null;
}

function pathDirs(env: NodeJS.ProcessEnv, platform: NodeJS.Platform): string[] {
  const raw = (platform === "win32" ? (env.Path ?? env.PATH) : env.PATH) ?? "";
  return raw
    .split(platform === "win32" ? ";" : delimiter)
    .map((d) => d.trim().replace(/^"(.*)"$/, "$1"))
    .filter(Boolean);
}

function launcherNames(platform: NodeJS.Platform): string[] {
  return platform === "win32" ? ["pi.cmd", "pi.exe", "pi.ps1", "pi"] : ["pi"];
}

function nodeBinaryName(platform: NodeJS.Platform): string {
  return platform === "win32" ? "node.exe" : "node";
}

function knownLocations(env: NodeJS.ProcessEnv, platform: NodeJS.Platform, home: string): string[] {
  if (platform === "win32") {
    const local = env.LOCALAPPDATA ?? join(home, "AppData", "Local");
    const roaming = env.APPDATA ?? join(home, "AppData", "Roaming");
    return [join(local, "pi-node", "current"), join(roaming, "npm"), "C:\\Program Files\\nodejs"];
  }
  // Each base is checked for node_modules/@earendil-works/pi-coding-agent.
  return [join(home, ".pi-node", "current"), join(home, ".local", "share", "pi"), "/opt/homebrew/lib", "/usr/local/lib", "/usr/lib"];
}

function nodeVersion(nodePath: string): string | null {
  try {
    return execFileSync(nodePath, ["--version"], { encoding: "utf8", timeout: 5000, windowsHide: true }).trim();
  } catch {
    return null;
  }
}

function findNode(
  preferredDir: string | null,
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
): { path: string; version: string } | { error: string } {
  const explicit = env.PI_STUDIO_NODE;
  const candidates: string[] = [];
  if (explicit) candidates.push(explicit);
  if (preferredDir) candidates.push(join(preferredDir, nodeBinaryName(platform)));
  for (const dir of pathDirs(env, platform)) candidates.push(join(dir, nodeBinaryName(platform)));
  let tooOld: string | null = null;
  for (const candidate of candidates) {
    if (!isFile(candidate)) continue;
    const version = nodeVersion(candidate);
    if (!version) continue;
    if (compareVersions(version, MIN_NODE_VERSION) >= 0) return { path: candidate, version };
    tooOld ??= `${candidate} is ${version}`;
    if (explicit && candidate === explicit) break;
  }
  return {
    error: tooOld
      ? `Pi needs Node.js ${MIN_NODE_VERSION}+, but ${tooOld}. Set PI_STUDIO_NODE to a newer node.`
      : "Node.js was not found. Pi needs Node.js 22.19+.",
  };
}

function finish(
  root: string,
  source: PiInstallInfo["source"],
  nodeDir: string | null,
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
  searched: string[],
): PiLocateResult {
  const version = readPackage(root)?.version ?? "0.0.0";
  const bundled = join(root, "dist", "bundle", "cli.js");
  const cliPath = existsSync(bundled) ? bundled : join(root, "dist", "cli.js");
  if (!existsSync(cliPath)) return { ok: false, error: `Pi at ${root} has no CLI entry (dist/bundle/cli.js)`, searched };
  const node = findNode(nodeDir, env, platform);
  if ("error" in node) return { ok: false, error: node.error, searched };
  return {
    ok: true,
    info: {
      version,
      nodePath: node.path,
      cliPath,
      packageRoot: root,
      source,
      support: piSupport(version),
      minVersion: MIN_PI_VERSION,
      testedMaxVersion: TESTED_MAX_PI_VERSION,
    },
  };
}

export function locatePi(options: LocateOptions = {}): PiLocateResult {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const home = options.homedir ?? osHomedir();
  const searched: string[] = [];

  const explicit = env.PI_STUDIO_PI_CLI;
  if (explicit) {
    searched.push(`PI_STUDIO_PI_CLI=${explicit}`);
    const root = packageRootFrom(explicit);
    if (!root) return { ok: false, error: `PI_STUDIO_PI_CLI does not point to a Pi install: ${explicit}`, searched };
    return finish(root, "env", null, env, platform, searched);
  }

  for (const dir of pathDirs(env, platform)) {
    if (/[\\/]node_modules[\\/]\.bin[\\/]?$/i.test(dir)) continue; // skip project-local shims
    for (const name of launcherNames(platform)) {
      const launcher = join(dir, name);
      if (!isFile(launcher)) continue;
      searched.push(launcher);
      const root = packageRootFromLauncher(launcher);
      if (root) return finish(root, "path", dir, env, platform, searched);
    }
  }

  for (const base of knownLocations(env, platform, home)) {
    searched.push(base);
    const root = join(base, ...PACKAGE_SEGMENTS);
    if (isPiPackageRoot(root)) return finish(root, "known-location", base, env, platform, searched);
  }

  return {
    ok: false,
    error: "Pi CLI was not found. Install it with `npm install -g @earendil-works/pi-coding-agent` or set PI_STUDIO_PI_CLI.",
    searched,
  };
}
