import { platform } from "node:os";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";

/** Minimal `which`: first PATH entry containing `exe`. */
function onPath(exe: string): boolean {
  const dirs = (process.env.PATH ?? process.env.Path ?? "").split(delimiter).filter(Boolean);
  return dirs.some((d) => existsSync(join(d, exe)));
}

export interface TerminalSessionInfo {
  id: string;
  shell: string;
  cwd: string;
}

interface ActiveSession {
  id: string;
  shell: string;
  cwd: string;
  process: ChildProcess;
}

export class TerminalManager {
  private sessions = new Map<string, ActiveSession>();
  private nextId = 1;

  public getDefaultShell(): { shell: string; args: string[] } {
    const isWin = platform() === "win32";
    if (isWin) {
      if (onPath("pwsh.exe")) {
        return { shell: "pwsh.exe", args: ["-NoLogo"] };
      }
      if (onPath("powershell.exe")) {
        return { shell: "powershell.exe", args: ["-NoLogo"] };
      }
      const cmd = process.env.COMSPEC || "cmd.exe";
      return { shell: cmd, args: [] };
    }
    const sh = process.env.SHELL || (platform() === "darwin" ? "/bin/zsh" : "/bin/bash");
    return { shell: sh, args: ["-i"] };
  }

  public createTerminal(
    options: { cwd?: string; shell?: string; cols?: number; rows?: number } = {},
    onData: (id: string, data: string) => void,
    onExit: (id: string, exitCode: number) => void,
  ): TerminalSessionInfo {
    const id = `term_${this.nextId++}_${Date.now()}`;
    const defaultInfo = this.getDefaultShell();
    const shell = options.shell || defaultInfo.shell;
    const args = defaultInfo.args;
    const cwd = options.cwd || process.cwd();

    const env = {
      ...process.env,
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
      COLUMNS: String(options.cols || 80),
      LINES: String(options.rows || 24),
    };

    const child = spawn(shell, args, {
      cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    child.stdout?.on("data", (chunk: Buffer) => {
      onData(id, chunk.toString("utf8"));
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      onData(id, chunk.toString("utf8"));
    });

    child.on("close", (code) => {
      this.sessions.delete(id);
      onExit(id, code ?? 0);
    });

    child.on("error", (err) => {
      onData(id, `\r\n\x1b[31m[Terminal Process Error: ${err.message}]\x1b[0m\r\n`);
      this.sessions.delete(id);
      onExit(id, 1);
    });

    const session: ActiveSession = {
      id,
      shell,
      cwd,
      process: child,
    };

    this.sessions.set(id, session);

    return {
      id,
      shell,
      cwd,
    };
  }

  public write(id: string, data: string): void {
    const session = this.sessions.get(id);
    if (!session || !session.process.stdin || session.process.killed) return;

    try {
      session.process.stdin.write(data);
    } catch (e) {
      // Process might have closed
    }
  }

  public resize(_id: string, _cols: number, _rows: number): void {
    // child_process pipe doesn't support SIGWINCH ioctl on Windows without conpty, safely no-op
  }

  public kill(id: string): void {
    const session = this.sessions.get(id);
    if (!session) return;

    try {
      session.process.kill();
    } catch (e) {
      // Ignore kill error
    }

    this.sessions.delete(id);
  }

  public list(): TerminalSessionInfo[] {
    return Array.from(this.sessions.values()).map((s) => ({
      id: s.id,
      shell: s.shell,
      cwd: s.cwd,
    }));
  }

  public disposeAll(): void {
    for (const [id] of this.sessions) {
      this.kill(id);
    }
    this.sessions.clear();
  }
}

export const terminalManager = new TerminalManager();
