/**
 * Contract between the terminal module's main and renderer halves (`mod:terminal:<method>` / events).
 */
export const MODULE_ID = "terminal";
export const TERMINAL_PANEL_ID = "terminal";

export const TerminalMethods = {
  create: "create",
  write: "write",
  resize: "resize",
  kill: "kill",
  list: "list",
  /** Flush pending output and return the scrollback so a (re)mounted renderer can replay it. */
  attach: "attach",
  shells: "shells",
  rename: "rename",
} as const;

export const TerminalEvents = {
  data: "data",
  exit: "exit",
} as const;

export interface TerminalSessionInfo {
  id: string;
  shell: string;
  shellLabel: string;
  cwd: string;
  title: string;
  /** Windows build number (ConPTY reflow differs between builds); undefined elsewhere. */
  windowsBuild?: number;
}

export interface TerminalCreateOptions {
  cwd?: string;
  /** Id from `shells` (e.g. "pwsh", "git-bash"). Wins over `shell`. */
  shellId?: string;
  /** Raw executable path/name, used when `shellId` is not given. */
  shell?: string;
  cols?: number;
  rows?: number;
}

export interface TerminalShellOption {
  id: string;
  label: string;
  isDefault: boolean;
}

export interface TerminalAttachResult {
  info: TerminalSessionInfo;
  /** Up to ~256 KB of the most recent output. */
  scrollback: string;
  /** Cumulative char count of everything emitted so far; drop `data` events whose `seq` is <= this. */
  seq: number;
}

export interface TerminalDataEvent {
  id: string;
  data: string;
  /** Cumulative char count after this chunk. */
  seq: number;
}

export interface TerminalExitEvent {
  id: string;
  exitCode: number;
  signal?: number;
}
