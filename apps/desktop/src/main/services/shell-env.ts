/**
 * GUI-launched apps inherit a stale or minimal PATH: macOS Finder/Dock gives `/usr/bin:/bin:...`, Linux
 * desktop launchers skip ~/.bashrc, and on Windows a long-running Explorer (or an app started before an
 * installer ran) misses newly added entries. This reads the PATH the user's terminal would see and merges
 * it into process.env so Pi, its tools, git and the terminal all resolve the same binaries.
 */
import { execFileSync } from "node:child_process";

const SENTINEL = "__HIVE_ENV__";

function windowsRegistryPath(): string | null {
  const read = (key: string): string[] => {
    try {
      const out = execFileSync("reg.exe", ["query", key, "/v", "Path"], { encoding: "utf8", timeout: 4000, windowsHide: true });
      const m = /Path\s+REG_(?:EXPAND_)?SZ\s+(.*)/i.exec(out);
      if (!m?.[1]) return [];
      return m[1]
        .trim()
        .replace(/%([^%]+)%/g, (all, name: string) => process.env[name] ?? process.env[name.toUpperCase()] ?? all)
        .split(";");
    } catch {
      return [];
    }
  };
  const machine = read("HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment");
  const user = read("HKCU\\Environment");
  const all = [...machine, ...user].filter(Boolean);
  return all.length ? all.join(";") : null;
}

function loginShellPath(): string | null {
  const shell = process.env.SHELL || (process.platform === "darwin" ? "/bin/zsh" : "/bin/bash");
  try {
    // -i -l: load the same rc/profile files as a terminal. `env` output is shell-agnostic (works for fish too).
    const out = execFileSync(shell, ["-ilc", `echo ${SENTINEL}; /usr/bin/env; echo ${SENTINEL}`], {
      encoding: "utf8",
      timeout: 5000,
      env: { ...process.env, DISABLE_AUTO_UPDATE: "true", ZSH_TMUX_AUTOSTARTED: "true", ZSH_TMUX_AUTOSTART: "false" },
      stdio: ["ignore", "pipe", "ignore"],
    });
    const block = out.split(SENTINEL)[1] ?? "";
    const line = block.split("\n").find((l) => l.startsWith("PATH="));
    return line ? line.slice(5).trim() : null;
  } catch {
    return null;
  }
}

/** Fresh entries first (they reflect the user's current setup), then anything only the process had. */
export function mergePathLists(fresh: string, current: string, sep: string): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of [...fresh.split(sep), ...current.split(sep)]) {
    const e = entry.trim();
    const key = sep === ";" ? e.toLowerCase().replace(/[\\/]+$/, "") : e.replace(/\/+$/, "");
    if (!e || seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out.join(sep);
}

/** Merge the user's real PATH into process.env. Returns true when PATH changed. */
export function refreshProcessPath(): boolean {
  const win = process.platform === "win32";
  const fresh = win ? windowsRegistryPath() : loginShellPath();
  if (!fresh) return false;
  const key = win ? (Object.keys(process.env).find((k) => k.toLowerCase() === "path") ?? "Path") : "PATH";
  const current = process.env[key] ?? "";
  const merged = mergePathLists(fresh, current, win ? ";" : ":");
  if (merged === current) return false;
  process.env[key] = merged;
  return true;
}
