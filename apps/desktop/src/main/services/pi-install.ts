/**
 * Locating the user's Pi from the app's point of view: honours a location picked in the UI, retries with
 * the user's real shell PATH when the inherited one is too thin, and can be re-run after the user
 * installs Pi without restarting by hand.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { locatePi, packageRootFrom } from "@hive/pi-adapter/node";
import type { PiLocateResult } from "@hive/protocol";
import { refreshProcessPath } from "./shell-env.ts";

export class PiInstallService {
  private readonly file: string;
  private pathRefreshed = false;

  constructor(userData: string) {
    this.file = join(userData, "pi-studio", "pi-location.json");
  }

  configuredPath(): string | undefined {
    try {
      const v = (JSON.parse(readFileSync(this.file, "utf8")) as { path?: unknown }).path;
      return typeof v === "string" && v ? v : undefined;
    } catch {
      return undefined;
    }
  }

  saveConfiguredPath(path: string): void {
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify({ path }, null, 2));
  }

  private refreshPathOnce(force = false): void {
    if (this.pathRefreshed && !force) return;
    this.pathRefreshed = true;
    refreshProcessPath();
  }

  /**
   * Startup lookup. macOS GUI launches never have the shell PATH, so refresh it up front there (Pi's own
   * tools need it too); elsewhere only when the first attempt fails.
   */
  locate(): PiLocateResult {
    if (process.platform === "darwin") this.refreshPathOnce();
    const first = locatePi({ configuredPath: this.configuredPath() });
    if (first.ok) return first;
    this.refreshPathOnce();
    return locatePi({ configuredPath: this.configuredPath() });
  }

  /** "Check again": always re-read the PATH, since the user may have just installed Pi or Node. */
  relocate(): PiLocateResult {
    this.refreshPathOnce(true);
    return locatePi({ configuredPath: this.configuredPath() });
  }

  /** Validate a user-picked location; persisted only if it resolves to a working Pi. */
  tryPath(path: string): PiLocateResult {
    this.refreshPathOnce();
    if (!packageRootFrom(path)) {
      return {
        ok: false,
        error: `No Pi install found at ${path}. Pick Pi's cli.js, its package folder, or the folder that contains the \`pi\` command.`,
        searched: [path],
      };
    }
    const result = locatePi({ configuredPath: path });
    if (result.ok) this.saveConfiguredPath(path);
    return result;
  }
}
