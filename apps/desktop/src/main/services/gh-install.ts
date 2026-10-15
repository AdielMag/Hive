/**
 * Locates and verifies the user's GitHub CLI (`gh`) install.
 * Checks PATH, standard OS package manager locations, and environment overrides.
 */
import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { dirname, delimiter, join } from "node:path";
import type { GhLocateResult } from "@hive/protocol";
import { appendToProcessPath } from "../paths.ts";
import { refreshProcessPath } from "./shell-env.ts";

export interface GhInstallOptions {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  execSync?: typeof execFileSync;
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

export class GhInstallService {
  private pathRefreshed = false;

  constructor(private readonly options: GhInstallOptions = {}) {}

  private get env(): NodeJS.ProcessEnv {
    return this.options.env ?? process.env;
  }

  private get platform(): NodeJS.Platform {
    return this.options.platform ?? process.platform;
  }

  private get exec(): typeof execFileSync {
    return this.options.execSync ?? execFileSync;
  }

  private candidateNames(): string[] {
    return this.platform === "win32" ? ["gh.exe", "gh.cmd", "gh.bat"] : ["gh"];
  }

  private standardSearchLocations(): string[] {
    const list: string[] = [];
    const env = this.env;

    if (this.platform === "win32") {
      const progFiles = env["ProgramFiles"] ?? "C:\\Program Files";
      const progFilesX86 = env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
      const localAppData = env["LOCALAPPDATA"] ?? "";
      const userProfile = env["USERPROFILE"] ?? "";
      const choco = env["ChocolateyInstall"] ?? "C:\\ProgramData\\chocolatey";

      list.push(
        join(progFiles, "GitHub CLI", "gh.exe"),
        join(progFilesX86, "GitHub CLI", "gh.exe"),
      );
      if (localAppData) {
        list.push(
          join(localAppData, "Programs", "GitHub CLI", "gh.exe"),
          join(localAppData, "Microsoft", "WinGet", "Links", "gh.exe"),
        );
      }
      if (userProfile) {
        list.push(join(userProfile, "scoop", "shims", "gh.exe"));
      }
      list.push(join(choco, "bin", "gh.exe"));
    } else if (this.platform === "darwin") {
      list.push("/opt/homebrew/bin/gh", "/usr/local/bin/gh", "/usr/bin/gh");
    } else {
      list.push("/usr/bin/gh", "/usr/local/bin/gh", "/snap/bin/gh");
    }

    return list;
  }

  locate(): GhLocateResult {
    const searched: string[] = [];
    const env = this.env;
    const isWin = this.platform === "win32";

    // 1. Explicit override
    const explicit = env.HIVE_GH_CLI ?? env.GH_PATH;
    if (explicit) {
      searched.push(explicit);
      if (isFile(explicit)) {
        const probed = this.probeVersion(explicit);
        if (probed) return { ok: true, version: probed, path: explicit };
      }
    }

    // 2. PATH entries
    const pathKey = isWin ? (Object.keys(env).find((k) => k.toLowerCase() === "path") ?? "Path") : "PATH";
    const pathVal = env[pathKey] ?? "";
    const names = this.candidateNames();

    for (const segment of pathVal.split(delimiter)) {
      const dir = segment.trim();
      if (!dir) continue;
      for (const name of names) {
        const candidate = join(dir, name);
        searched.push(candidate);
        if (existsSync(candidate) && isFile(candidate)) {
          const probed = this.probeVersion(candidate);
          if (probed) return { ok: true, version: probed, path: candidate };
        }
      }
    }

    // 3. Known fallback locations
    for (const candidate of this.standardSearchLocations()) {
      if (!searched.includes(candidate)) searched.push(candidate);
      if (existsSync(candidate) && isFile(candidate)) {
        const probed = this.probeVersion(candidate);
        if (probed) {
          // Ensure directory is in PATH for child processes
          try {
            appendToProcessPath(dirname(candidate));
          } catch {
            /* ignore */
          }
          return { ok: true, version: probed, path: candidate };
        }
      }
    }

    // 4. Try bare `gh` execution as final check (in case shell handles shims)
    try {
      const probed = this.probeVersion(isWin ? "gh.exe" : "gh");
      if (probed) return { ok: true, version: probed, path: isWin ? "gh.exe" : "gh" };
    } catch {
      /* ignore */
    }

    return {
      ok: false,
      error: "GitHub CLI (`gh`) was not found on your system. Hive requires GitHub CLI to run GitHub commands and operate correctly.",
      searched,
    };
  }

  relocate(): GhLocateResult {
    if (!this.pathRefreshed) {
      this.pathRefreshed = true;
      try {
        refreshProcessPath();
      } catch {
        /* ignore */
      }
    }
    return this.locate();
  }

  private probeVersion(binPath: string): string | null {
    try {
      const out = this.exec(binPath, ["--version"], {
        encoding: "utf8",
        timeout: 4000,
        windowsHide: true,
      });
      const match = /gh\s+version\s+([0-9]+\.[0-9]+\.[0-9]+)/i.exec(out);
      return match?.[1] ?? out.split("\n")[0]?.trim() ?? "unknown";
    } catch {
      return null;
    }
  }
}
