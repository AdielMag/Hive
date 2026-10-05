/**
 * Main-process half: owns the PTY-backed shell sessions. Everything is killed when the module is disabled
 * or the app quits.
 */
import { defineMainModule } from "@hive/module-sdk/main";
import { TerminalManager } from "./service.ts";
import {
  MODULE_ID,
  TerminalEvents,
  TerminalMethods,
  type TerminalCreateOptions,
  type TerminalDataEvent,
  type TerminalExitEvent,
} from "./shared.ts";

export default defineMainModule({
  id: MODULE_ID,
  activate(ctx) {
    const terminals = new TerminalManager();

    ctx.ipc.handle(TerminalMethods.create, (options?: TerminalCreateOptions) =>
      terminals.createTerminal(
        options,
        (id, data, seq) => ctx.ipc.emit(TerminalEvents.data, { id, data, seq } satisfies TerminalDataEvent),
        (id, exitCode, signal) => ctx.ipc.emit(TerminalEvents.exit, { id, exitCode, signal } satisfies TerminalExitEvent),
      ),
    );
    ctx.ipc.handle(TerminalMethods.write, ({ id, data }: { id: string; data: string }) => terminals.write(id, data));
    ctx.ipc.handle(TerminalMethods.resize, ({ id, cols, rows }: { id: string; cols: number; rows: number }) =>
      terminals.resize(id, cols, rows),
    );
    ctx.ipc.handle(TerminalMethods.kill, ({ id }: { id: string }) => terminals.kill(id));
    ctx.ipc.handle(TerminalMethods.list, () => terminals.list());
    ctx.ipc.handle(TerminalMethods.attach, ({ id }: { id: string }) => terminals.attach(id));
    ctx.ipc.handle(TerminalMethods.shells, () => terminals.listShells());
    ctx.ipc.handle(TerminalMethods.rename, ({ id, title }: { id: string; title: string }) => terminals.rename(id, title));

    return () => terminals.disposeAll();
  },
});
