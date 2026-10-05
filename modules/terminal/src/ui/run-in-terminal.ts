import type { ModuleHost } from "@hive/module-sdk/renderer";
import { TERMINAL_PANEL_ID } from "../shared.ts";

export interface RunInTerminalArgs {
  command: string;
  /** Used only when a new shell has to be created. */
  cwd?: string;
}

/**
 * `terminal.run` command: show the panel, reuse the active shell (or create one) and type `command` + Enter.
 * Other modules / core call this through `host.commands.run("terminal.run", { command, cwd })`.
 * The registry (and xterm with it) is loaded lazily, the first time a command actually runs.
 */
export async function runInTerminal(host: ModuleHost, args: unknown): Promise<void> {
  const { command, cwd } = (args ?? {}) as Partial<RunInTerminalArgs>;
  if (typeof command !== "string" || !command.trim()) return;

  host.panels.open("right", TERMINAL_PANEL_ID);
  const { runCommand } = await import("./terminal-registry.ts");
  await runCommand(host, command, cwd);
}
