import * as pty from "@lydell/node-pty";
import { existsSync, statSync } from "node:fs";
import { homedir, platform, release } from "node:os";
import { basename, delimiter, dirname, join } from "node:path";
import type {
  TerminalAttachResult,
  TerminalCreateOptions,
  TerminalSessionInfo,
  TerminalShellOption,
} from "./shared.ts";

export type { TerminalSessionInfo } from "./shared.ts";

/** Scrollback kept per session so a reloaded renderer can replay it. */
const SCROLLBACK_CHARS = 256 * 1024;
/** Output is coalesced for this long (or until FLUSH_CHARS) before it is sent over IPC. */
const FLUSH_MS = 8;
const FLUSH_CHARS = 64 * 1024;

const isWin = platform() === "win32";

/** First PATH entry containing `exe`, as a full path (or null). */
function findOnPath(exe: string): string | null {
  const dirs = (process.env.PATH ?? process.env.Path ?? "").split(delimiter).filter(Boolean);
  for (const d of dirs) {
    const full = join(d, exe);
    if (existsSync(full)) return full;
  }
  return null;
}

interface ShellSpec extends TerminalShellOption {
  shell: string;
  args: string[];
}

function windowsBuild(): number | undefined {
  if (!isWin) return undefined;
  const build = Number(release().split(".")[2]);
  return Number.isFinite(build) ? build : undefined;
}

interface ActiveSession {
  id: string;
  shell: string;
  shellLabel: string;
  cwd: string;
  title: string;
  pty: pty.IPty;
  /** Rolling tail of all output. */
  scrollback: string;
  /** Total chars ever produced / emitted. */
  produced: number;
  pending: string;
  timer: ReturnType<typeof setTimeout> | null;
  killed: boolean;
}

type DataSink = (id: string, data: string, seq: number) => void;
type ExitSink = (id: string, exitCode: number, signal?: number) => void;

export class TerminalManager {
  private sessions = new Map<string, ActiveSession>();
  private sinks = new Map<string, { onData: DataSink; onExit: ExitSink }>();
  private nextId = 1;

  /** Installed shells, default first. */
  public discoverShells(): ShellSpec[] {
    const out: ShellSpec[] = [];
    const add = (id: string, label: string, shell: string | null, args: string[] = []) => {
      if (shell) out.push({ id, label, shell, args, isDefault: false });
    };

    if (isWin) {
      add("pwsh", "PowerShell 7", findOnPath("pwsh.exe"), ["-NoLogo"]);
      add("powershell", "Windows PowerShell", findOnPath("powershell.exe"), ["-NoLogo"]);
      add("cmd", "Command Prompt", process.env.COMSPEC || findOnPath("cmd.exe") || "cmd.exe");
      // Git Bash: <git>\bin\bash.exe (never System32\bash.exe, which is the WSL launcher).
      const git = findOnPath("git.exe");
      const candidates = [
        git ? join(dirname(dirname(git)), "bin", "bash.exe") : "",
        join(process.env.ProgramFiles ?? "C:\\Program Files", "Git", "bin", "bash.exe"),
        join(process.env.LOCALAPPDATA ?? "", "Programs", "Git", "bin", "bash.exe"),
      ];
      add("git-bash", "Git Bash", candidates.find((c) => c && existsSync(c)) ?? null, ["--login", "-i"]);
      add("wsl", "WSL", findOnPath("wsl.exe"));
    } else {
      const loginArgs = platform() === "darwin" ? ["-l"] : [];
      const seen = new Set<string>();
      const addUnix = (path: string | undefined) => {
        if (!path || seen.has(path) || !existsSync(path)) return;
        seen.add(path);
        const name = basename(path);
        add(name, name, path, ["bash", "zsh", "fish", "sh"].includes(name) ? loginArgs : []);
      };
      addUnix(process.env.SHELL);
      addUnix(platform() === "darwin" ? "/bin/zsh" : "/bin/bash");
      for (const p of ["/bin/zsh", "/bin/bash", "/usr/bin/fish", "/bin/sh"]) addUnix(p);
    }

    if (out.length === 0) out.push({ id: "default", label: "Shell", shell: isWin ? "cmd.exe" : "/bin/sh", args: [], isDefault: false });
    out[0]!.isDefault = true;
    return out;
  }

  public listShells(): TerminalShellOption[] {
    return this.discoverShells().map(({ id, label, isDefault }) => ({ id, label, isDefault }));
  }

  public getDefaultShell(): { shell: string; args: string[] } {
    const { shell, args } = this.discoverShells()[0]!;
    return { shell, args };
  }

  private resolveShell(options: TerminalCreateOptions): ShellSpec {
    const shells = this.discoverShells();
    if (options.shellId) {
      const hit = shells.find((s) => s.id === options.shellId);
      if (hit) return hit;
    }
    if (options.shell) {
      const known = shells.find((s) => s.shell === options.shell);
      return known ?? { id: "custom", label: basename(options.shell), shell: options.shell, args: [], isDefault: false };
    }
    return shells[0]!;
  }

  public createTerminal(
    options: TerminalCreateOptions = {},
    onData: DataSink,
    onExit: ExitSink,
  ): TerminalSessionInfo {
    const id = `term_${this.nextId++}_${Date.now()}`;
    const spec = this.resolveShell(options);
    const cwd = options.cwd && isDir(options.cwd) ? options.cwd : homedir();
    const cols = clampDim(options.cols, 80);
    const rows = clampDim(options.rows, 24);

    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (typeof v === "string" && !k.startsWith("ELECTRON_") && k !== "NODE_OPTIONS") env[k] = v;
    }
    env.TERM = "xterm-256color";
    env.COLORTERM = "truecolor";
    env.TERM_PROGRAM = "Hive";

    const child = pty.spawn(spec.shell, spec.args, { name: "xterm-256color", cols, rows, cwd, env });

    const session: ActiveSession = {
      id,
      shell: spec.shell,
      shellLabel: spec.label,
      cwd,
      title: spec.label,
      pty: child,
      scrollback: "",
      produced: 0,
      pending: "",
      timer: null,
      killed: false,
    };
    this.sessions.set(id, session);
    this.sinks.set(id, { onData, onExit });

    child.onData((data) => {
      session.produced += data.length;
      session.scrollback = trimScrollback(session.scrollback + data);
      session.pending += data;
      if (session.pending.length >= FLUSH_CHARS) this.flush(session);
      else if (!session.timer) session.timer = setTimeout(() => this.flush(session), FLUSH_MS);
    });

    child.onExit(({ exitCode, signal }) => {
      this.flush(session);
      const wasKilled = session.killed;
      this.sessions.delete(id);
      const sink = this.sinks.get(id);
      this.sinks.delete(id);
      if (!wasKilled) sink?.onExit(id, exitCode, signal);
    });

    return this.info(session);
  }

  private info(s: ActiveSession): TerminalSessionInfo {
    return { id: s.id, shell: s.shell, shellLabel: s.shellLabel, cwd: s.cwd, title: s.title, windowsBuild: windowsBuild() };
  }

  private flush(s: ActiveSession): void {
    if (s.timer) {
      clearTimeout(s.timer);
      s.timer = null;
    }
    if (!s.pending) return;
    const data = s.pending;
    s.pending = "";
    this.sinks.get(s.id)?.onData(s.id, data, s.produced);
  }

  public write(id: string, data: string): void {
    const s = this.sessions.get(id);
    if (!s || typeof data !== "string") return;
    try {
      s.pty.write(data);
    } catch {
      // process already gone
    }
  }

  public resize(id: string, cols: number, rows: number): void {
    const s = this.sessions.get(id);
    if (!s) return;
    if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1) return;
    try {
      s.pty.resize(cols, rows);
    } catch {
      // process already gone
    }
  }

  public rename(id: string, title: string): void {
    const s = this.sessions.get(id);
    if (s && typeof title === "string" && title.trim()) s.title = title.trim().slice(0, 120);
  }

  public attach(id: string): TerminalAttachResult | null {
    const s = this.sessions.get(id);
    if (!s) return null;
    this.flush(s);
    return { info: this.info(s), scrollback: s.scrollback, seq: s.produced };
  }

  public kill(id: string): void {
    const s = this.sessions.get(id);
    if (!s) return;
    s.killed = true;
    if (s.timer) clearTimeout(s.timer);
    this.sessions.delete(id);
    this.sinks.delete(id);
    try {
      s.pty.kill();
    } catch {
      // already exited
    }
  }

  public list(): TerminalSessionInfo[] {
    return Array.from(this.sessions.values()).map((s) => this.info(s));
  }

  public disposeAll(): void {
    for (const id of [...this.sessions.keys()]) this.kill(id);
  }
}

function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function clampDim(n: number | undefined, fallback: number): number {
  return Number.isInteger(n) && (n as number) > 0 && (n as number) < 1000 ? (n as number) : fallback;
}

/** Keep the last SCROLLBACK_CHARS, starting at a line boundary so replay does not begin mid escape sequence. */
function trimScrollback(s: string): string {
  if (s.length <= SCROLLBACK_CHARS * 1.25) return s;
  let out = s.slice(-SCROLLBACK_CHARS);
  const nl = out.indexOf("\n");
  if (nl >= 0 && nl < 4096) out = out.slice(nl + 1);
  return out;
}

export const terminalManager = new TerminalManager();
