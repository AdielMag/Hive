/**
 * Main-process half: owns the PTY-less shell sessions. Everything is killed when the module is disabled
 * or the app quits.
 */
import { defineMainModule } from "@hive/module-sdk/main";
import { TerminalManager } from "./service.ts";
import { MODULE_ID, TerminalEvents, TerminalMethods, type TerminalCreateOptions } from "./shared.ts";

export default defineMainModule({
  id: MODULE_ID,
  activate(ctx) {
    const terminals = new TerminalManager();

    ctx.ipc.handle(TerminalMethods.create, (options?: TerminalCreateOptions) =>
      terminals.createTerminal(
        options,
        (id, data) => ctx.ipc.emit(TerminalEvents.data, { id, data }),
        (id, exitCode) => ctx.ipc.emit(TerminalEvents.exit, { id, exitCode }),
      ),
    );
    ctx.ipc.handle(TerminalMethods.write, ({ id, data }: { id: string; data: string }) => terminals.write(id, data));
    ctx.ipc.handle(TerminalMethods.resize, ({ id, cols, rows }: { id: string; cols: number; rows: number }) =>
      terminals.resize(id, cols, rows),
    );
    ctx.ipc.handle(TerminalMethods.kill, ({ id }: { id: string }) => terminals.kill(id));
    ctx.ipc.handle(TerminalMethods.list, () => terminals.list());

    return () => terminals.disposeAll();
  },
});
