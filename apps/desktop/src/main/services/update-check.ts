/**
 * Electron-free release lookup used by the app updater (kept separate so it can be unit-tested).
 *
 * Strategy:
 *  1. GitHub REST API `/repos/{repo}/releases/latest` (gives assets + notes), retried once.
 *  2. Fallback: the public `github.com/{repo}/releases/latest` page redirect (no API rate limit),
 *     which yields the tag; asset URLs are derived from the electron-builder artifact names.
 *
 * Never throws: a failed lookup returns `{ error }` so the UI can say "couldn't check" instead of
 * falsely claiming the app is up to date.
 */
import { compareVersions } from "@hive/pi-adapter";

export interface UpdateInfo {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion?: string;
  releaseUrl?: string;
  downloadUrl?: string;
  notes?: string;
  /** Set when the release lookup failed; `hasUpdate` is then false but unknown, not "up to date". */
  error?: string;
}

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
}

interface LatestRelease {
  tag: string;
  htmlUrl: string;
  notes?: string;
  assets?: ReleaseAsset[];
}

export interface CheckOptions {
  repo: string;
  currentVersion: string;
  platform: NodeJS.Platform;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;

function describeError(err: unknown): string {
  if (err instanceof Error) return err.name === "TimeoutError" ? "request timed out" : err.message;
  return String(err);
}

async function fromApi(opts: CheckOptions, f: typeof fetch, timeoutMs: number): Promise<LatestRelease> {
  const res = await f(`https://api.github.com/repos/${opts.repo}/releases/latest`, {
    headers: { "User-Agent": `Hive/${opts.currentVersion}`, Accept: "application/vnd.github.v3+json" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`GitHub API returned ${res.status}`);
  const data = (await res.json()) as { tag_name?: string; html_url?: string; body?: string; assets?: ReleaseAsset[] };
  if (!data.tag_name) throw new Error("GitHub API response has no tag");
  return { tag: data.tag_name, htmlUrl: data.html_url ?? `https://github.com/${opts.repo}/releases/tag/${data.tag_name}`, notes: data.body, assets: data.assets };
}

async function fromReleasePage(opts: CheckOptions, f: typeof fetch, timeoutMs: number): Promise<LatestRelease> {
  const res = await f(`https://github.com/${opts.repo}/releases/latest`, {
    method: "HEAD",
    headers: { "User-Agent": `Hive/${opts.currentVersion}` },
    signal: AbortSignal.timeout(timeoutMs),
  });
  // `fetch` follows redirects; the final URL is .../releases/tag/vX.Y.Z
  const finalUrl = res.url || res.headers.get("location") || "";
  const match = /\/releases\/tag\/([^/?#]+)/.exec(finalUrl);
  if (!match) throw new Error(`release page returned ${res.status} without a tag`);
  const tag = decodeURIComponent(match[1]!);
  return { tag, htmlUrl: `https://github.com/${opts.repo}/releases/tag/${tag}` };
}

/** Release asset (written by release.yml) listing `sha256sum` hashes of every installer. */
export const CHECKSUMS_ASSET = "SHA256SUMS.txt";

/** Only binaries attached to this repo's GitHub releases may be downloaded and run. */
export function isTrustedDownloadUrl(url: string, repo: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.host === "github.com" && u.pathname.startsWith(`/${repo}/releases/download/`) && !u.pathname.includes("..");
  } catch {
    return false;
  }
}

/** A GitHub release page of this repo (safe to open in the browser). */
export function isReleasePageUrl(url: string, repo: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.host === "github.com" && u.pathname.startsWith(`/${repo}/releases`);
  } catch {
    return false;
  }
}

/** `SHA256SUMS.txt` next to a release asset, plus the asset's file name. */
export function checksumLocation(downloadUrl: string): { checksumsUrl: string; assetName: string } {
  const u = new URL(downloadUrl);
  const slash = u.pathname.lastIndexOf("/");
  const assetName = decodeURIComponent(u.pathname.slice(slash + 1));
  u.pathname = `${u.pathname.slice(0, slash + 1)}${CHECKSUMS_ASSET}`;
  u.search = "";
  u.hash = "";
  return { checksumsUrl: u.toString(), assetName };
}

/** Expected lowercase hex SHA-256 for `assetName` from `sha256sum` output (`<hash>  <name>` or `<hash> *<name>`). */
export function expectedSha256(checksums: string, assetName: string): string | undefined {
  for (const line of checksums.split(/\r?\n/)) {
    const m = /^([0-9a-fA-F]{64})\s+\*?(.+?)\s*$/.exec(line);
    if (m && m[2] === assetName) return m[1]!.toLowerCase();
  }
  return undefined;
}

/** Pick the platform installer from release assets, or derive it from the known artifact names. */
export function pickDownloadUrl(release: LatestRelease, repo: string, platform: NodeJS.Platform): string {
  const assets = release.assets;
  if (assets?.length) {
    let asset: ReleaseAsset | undefined;
    if (platform === "win32") {
      // Prefer the NSIS installer over the portable build.
      asset = assets.find((a) => /setup.*\.exe$/i.test(a.name)) ?? assets.find((a) => a.name.endsWith(".exe") && !/portable/i.test(a.name));
    } else if (platform === "darwin") {
      asset = assets.find((a) => a.name.endsWith(".dmg") || a.name.endsWith(".zip"));
    } else {
      asset = assets.find((a) => a.name.endsWith(".AppImage"));
    }
    return asset?.browser_download_url ?? release.htmlUrl;
  }
  // No asset list (page fallback): Windows installer name is deterministic (nsis.artifactName).
  if (platform === "win32") {
    const version = release.tag.replace(/^v/, "");
    return `https://github.com/${repo}/releases/download/${release.tag}/Hive-Setup-${version}.exe`;
  }
  return release.htmlUrl;
}

export async function checkLatestRelease(opts: CheckOptions): Promise<UpdateInfo> {
  const f = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const errors: string[] = [];
  let release: LatestRelease | undefined;

  for (const attempt of [
    () => fromApi(opts, f, timeoutMs),
    () => fromApi(opts, f, timeoutMs),
    () => fromReleasePage(opts, f, timeoutMs),
  ]) {
    try {
      release = await attempt();
      break;
    } catch (err) {
      errors.push(describeError(err));
    }
  }

  if (!release) {
    return { hasUpdate: false, currentVersion: opts.currentVersion, error: `Couldn't reach GitHub releases (${errors.at(-1) ?? "unknown error"})` };
  }

  const latestVersion = release.tag.replace(/^v/, "");
  return {
    hasUpdate: compareVersions(latestVersion, opts.currentVersion) > 0,
    currentVersion: opts.currentVersion,
    latestVersion,
    releaseUrl: release.htmlUrl,
    downloadUrl: pickDownloadUrl(release, opts.repo, opts.platform),
    notes: release.notes,
  };
}
