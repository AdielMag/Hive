import type { ModuleHost } from "@hive/module-sdk/renderer";
import { TERMINAL_PANEL_ID, TerminalMethods, type TerminalSessionInfo } from "../shared.ts";

export interface RunInTerminalArgs {
  command: string;
  /** Used only when a new shell has to be created. */
  cwd?: string;
}

/**
 * `terminal.run` command: show the panel, reuse the first shell (or create one) and type `command` + Enter.
 * Other modules / core call this through `host.commands.run("terminal.run", { command, cwd })`.
 */
export async function runInTerminal(host: ModuleHost, args: unknown): Promise<void> {
  const { command, cwd } = (args ?? {}) as Partial<RunInTerminalArgs>;
  if (typeof command !== "string" || !command.trim()) return;

  host.panels.open("right", TERMINAL_PANEL_ID);
  const terms = await host.ipc.invoke<TerminalSessionInfo[]>(TerminalMethods.list);
  let id = terms[0]?.id;
  if (!id) {
    const created = await host.ipc.invoke<TerminalSessionInfo>(TerminalMethods.create, { cwd });
    id = created.id;
  }
  await host.ipc.invoke(TerminalMethods.write, { id, data: command + "\r" });
}
