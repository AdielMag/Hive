/**
 * Find the user's installed Pi (plan decision D3: use the installed `pi`, same version as the
 * terminal). Resolution order:
 *   1. HIVE_PI_CLI (cli.js, package root, or an install dir) [+ HIVE_NODE]
 *   2. A location the user picked in Hive ("Locate Pi…")
 *   3. `pi` launchers on PATH (project-local node_modules/.bin entries are skipped)
 *   4. Known install locations: the Pi installer, npm global prefixes (incl. custom `prefix` in .npmrc),
 *      Homebrew, nvm / nvm-windows, fnm, volta, asdf, mise, n, scoop, pnpm and bun globals.
 * GUI apps often start with a minimal PATH (macOS Finder, or a PATH captured before Pi was installed),
 * which is why step 4 is broad. Pi is spawned as `<node> <cli.js>` without a shell, so paths with
 * spaces are safe.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { homedir as osHomedir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import type { PiInstallInfo, PiLocateResult } from "@hive/protocol";
import { MIN_PI_VERSION, TESTED_MAX_PI_VERSION, compareVersions, piSupport } from "../version.ts";

const PACKAGE_NAME = "@earendil-works/pi-coding-agent";
const PACKAGE_SEGMENTS = ["node_modules", "@earendil-works", "pi-coding-agent"] as const;
/** Pi's own engines requirement (package.json "engines"). */
const MIN_NODE_VERSION = "22.19.0";

export interface LocateOptions {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  homedir?: string;
  /** Install the user picked in the app (cli.js, package root or install dir). */
  configuredPath?: string;
  /** Probe a node binary's version (injectable for tests). */
  nodeVersion?: (nodePath: string) => string | null;
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
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

/** Package root inside an install prefix: `<prefix>/node_modules/...` (Windows) or `<prefix>/lib/node_modules/...` (POSIX). */
function packageRootInPrefix(prefix: string): string | null {
  for (const candidate of [join(prefix, ...PACKAGE_SEGMENTS), join(prefix, "lib", ...PACKAGE_SEGMENTS)]) {
    if (isPiPackageRoot(candidate)) return resolve(candidate);
  }
  return null;
}

/** Accepts cli.js, the package root, a `pi` launcher, or an install dir/prefix. */
export function packageRootFrom(input: string): string | null {
  const path = resolve(input);
  if (isPiPackageRoot(path)) return path;
  const inPrefix = packageRootInPrefix(path);
  if (inPrefix) return inPrefix;
  if (isFile(path)) return packageRootFromLauncher(path);
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
  return packageRootInPrefix(dir) ?? packageRootInPrefix(join(dir, ".."));
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

/** Child dirs of `parent` (newest version first), each joined with `suffix`. */
function versionDirs(parent: string, ...suffix: string[]): string[] {
  try {
    return readdirSync(parent, { withFileTypes: true })
      .filter((e) => e.isDirectory() || e.isSymbolicLink())
      .map((e) => e.name)
      .sort((a, b) => compareVersions(b, a))
      .map((name) => join(parent, name, ...suffix));
  } catch {
    return [];
  }
}

function expandHome(p: string, env: NodeJS.ProcessEnv, home: string): string {
  return p
    .trim()
    .replace(/^~(?=$|[\\/])/, home)
    .replace(/\$\{([^}]+)\}|%([^%]+)%/g, (m, a?: string, b?: string) => env[(a ?? b)!] ?? m);
}

/** `prefix=` from the user's .npmrc (custom npm global prefix, e.g. ~/.npm-global). */
function npmrcPrefix(env: NodeJS.ProcessEnv, home: string): string | null {
  for (const file of [env.NPM_CONFIG_USERCONFIG, env.npm_config_userconfig, join(home, ".npmrc")]) {
    if (!file) continue;
    try {
      const line = readFileSync(file, "utf8")
        .split(/\r?\n/)
        .find((l) => /^\s*prefix\s*=/.test(l));
      if (line) return expandHome(line.split("=").slice(1).join("=").replace(/^["']|["']$/g, ""), env, home);
    } catch {
      // no npmrc
    }
  }
  return null;
}

/**
 * Install prefixes to probe for `node_modules/@earendil-works/pi-coding-agent`. Node binaries are looked
 * for in `<prefix>` and `<prefix>/bin`.
 */
export function knownPrefixes(env: NodeJS.ProcessEnv, platform: NodeJS.Platform, home: string): string[] {
  const out: string[] = [];
  const add = (...paths: (string | null | undefined)[]) => {
    for (const p of paths) if (p) out.push(p);
  };
  add(env.NPM_CONFIG_PREFIX, env.npm_config_prefix, npmrcPrefix(env, home));

  if (platform === "win32") {
    const local = env.LOCALAPPDATA ?? join(home, "AppData", "Local");
    const roaming = env.APPDATA ?? join(home, "AppData", "Roaming");
    const programFiles = env.ProgramFiles ?? "C:\\Program Files";
    add(join(local, "pi-node", "current"), join(roaming, "npm"), join(programFiles, "nodejs"));
    // nvm-windows: active symlink, then installed versions.
    add(env.NVM_SYMLINK, "C:\\nvm4w\\nodejs");
    add(...versionDirs(env.NVM_HOME ?? join(roaming, "nvm")));
    // fnm, volta, scoop, pnpm, bun.
    add(...versionDirs(join(env.FNM_DIR ?? join(roaming, "fnm"), "node-versions"), "installation"));
    add(join(local, "Volta", "tools", "image", "packages", "@earendil-works", "pi-coding-agent"));
    add(...versionDirs(join(local, "Volta", "tools", "image", "node")));
    add(join(home, "scoop", "persist", "nodejs", "bin"), join(home, "scoop", "apps", "nodejs", "current"));
    add(env.PNPM_HOME && join(env.PNPM_HOME, "global", "5"), join(local, "pnpm", "global", "5"));
  } else {
    add(join(home, ".pi-node", "current"), join(home, ".local", "share", "pi"));
    add(join(home, ".npm-global"), join(home, ".npm-packages"), join(home, ".local"));
    add("/opt/homebrew", "/usr/local", "/usr", "/home/linuxbrew/.linuxbrew");
    add(...versionDirs(join(env.NVM_DIR ?? join(home, ".nvm"), "versions", "node")));
    const fnmDirs = [env.FNM_DIR, join(home, ".local", "share", "fnm"), join(home, "Library", "Application Support", "fnm"), join(home, ".fnm")];
    for (const dir of fnmDirs) if (dir) add(...versionDirs(join(dir, "node-versions"), "installation"));
    const volta = env.VOLTA_HOME ?? join(home, ".volta");
    add(join(volta, "tools", "image", "packages", "@earendil-works", "pi-coding-agent"));
    add(...versionDirs(join(volta, "tools", "image", "node")));
    add(...versionDirs(join(env.ASDF_DATA_DIR ?? join(home, ".asdf"), "installs", "nodejs")));
    add(...versionDirs(join(env.MISE_DATA_DIR ?? join(home, ".local", "share", "mise"), "installs", "node")));
    add(env.N_PREFIX, join(home, "n"));
    add(env.PNPM_HOME && join(env.PNPM_HOME, "global", "5"), join(home, ".local", "share", "pnpm", "global", "5"), join(home, "Library", "pnpm", "global", "5"));
  }
  add(join(home, ".bun", "install", "global"));
  return [...new Set(out.map((p) => resolve(p)))];
}

function nodeVersion(nodePath: string): string | null {
  try {
    return execFileSync(nodePath, ["--version"], { encoding: "utf8", timeout: 5000, windowsHide: true }).trim();
  } catch {
    return null;
  }
}

interface Ctx {
  env: NodeJS.ProcessEnv;
  platform: NodeJS.Platform;
  home: string;
  probe: (nodePath: string) => string | null;
  searched: string[];
}

function findNode(preferredDirs: string[], { env, platform, home, probe }: Ctx): { path: string; version: string } | { error: string } {
  const explicit = env.HIVE_NODE ?? env.PI_STUDIO_NODE;
  const bin = nodeBinaryName(platform);
  const dirs = [...preferredDirs, ...pathDirs(env, platform)];
  for (const prefix of knownPrefixes(env, platform, home)) dirs.push(prefix, join(prefix, "bin"));
  const candidates = [...(explicit ? [explicit] : []), ...new Set(dirs.map((d) => join(d, bin)))];
  let tooOld: string | null = null;
  for (const candidate of candidates) {
    if (!isFile(candidate)) continue;
    const version = probe(candidate);
    if (!version) continue;
    if (compareVersions(version, MIN_NODE_VERSION) >= 0) return { path: candidate, version };
    tooOld ??= `${candidate} is ${version}`;
    if (explicit && candidate === explicit) break;
  }
  return {
    error: tooOld
      ? `Pi was found, but it needs Node.js ${MIN_NODE_VERSION}+ and ${tooOld}. Install a newer Node.js or set HIVE_NODE.`
      : `Pi was found, but Node.js was not. Pi needs Node.js ${MIN_NODE_VERSION}+ (or set HIVE_NODE).`,
  };
}

function finish(root: string, source: PiInstallInfo["source"], nodeDirs: string[], ctx: Ctx): PiLocateResult {
  const { searched } = ctx;
  const version = readPackage(root)?.version ?? "0.0.0";
  const bundled = join(root, "dist", "bundle", "cli.js");
  const cliPath = existsSync(bundled) ? bundled : join(root, "dist", "cli.js");
  if (!existsSync(cliPath)) return { ok: false, error: `Pi at ${root} has no CLI entry (dist/bundle/cli.js)`, searched };
  // The install that owns this package usually ships/uses a node next to it.
  const ownPrefix = resolve(root, "..", "..", "..");
  const node = findNode([...nodeDirs, ownPrefix, join(ownPrefix, "bin"), resolve(ownPrefix, "..", "bin")], ctx);
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
  const ctx: Ctx = { env, platform, home, probe: options.nodeVersion ?? nodeVersion, searched };

  const explicit = env.HIVE_PI_CLI ?? env.PI_STUDIO_PI_CLI;
  if (explicit) {
    searched.push(`HIVE_PI_CLI=${explicit}`);
    const root = packageRootFrom(explicit);
    if (!root) return { ok: false, error: `HIVE_PI_CLI does not point to a Pi install: ${explicit}`, searched };
    return finish(root, "env", [], ctx);
  }

  if (options.configuredPath) {
    searched.push(`Chosen in Hive: ${options.configuredPath}`);
    const root = packageRootFrom(options.configuredPath);
    if (root) return finish(root, "env", [], ctx);
  }

  for (const dir of pathDirs(env, platform)) {
    if (/[\\/]node_modules[\\/]\.bin[\\/]?$/i.test(dir)) continue; // skip project-local shims
    for (const name of launcherNames(platform)) {
      const launcher = join(dir, name);
      if (!isFile(launcher)) continue;
      searched.push(launcher);
      const root = packageRootFromLauncher(launcher);
      if (root) return finish(root, "path", [dir], ctx);
    }
  }

  for (const prefix of knownPrefixes(env, platform, home)) {
    if (!isDir(prefix)) continue;
    searched.push(prefix);
    const root = packageRootInPrefix(prefix);
    if (root) return finish(root, "known-location", [prefix, join(prefix, "bin")], ctx);
  }

  return {
    ok: false,
    error: "Pi CLI was not found. Install it with `npm install -g @earendil-works/pi-coding-agent`, then press Check again — or use Locate Pi… to point at it.",
    searched: searched.length ? searched : ["PATH and all known install locations (none exist on this machine)"],
  };
}
