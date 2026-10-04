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
} as const;

export const TerminalEvents = {
  data: "data",
  exit: "exit",
} as const;

export interface TerminalSessionInfo {
  id: string;
  shell: string;
  cwd: string;
}

export interface TerminalCreateOptions {
  cwd?: string;
  shell?: string;
  cols?: number;
  rows?: number;
}
