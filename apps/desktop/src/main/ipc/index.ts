import type { AppContext } from "../context.ts";
import { registerAccountIpc } from "./accounts.ts";
import { registerAiIpc } from "./ai.ts";
import { registerAppIpc } from "./app.ts";
import { registerLibraryIpc } from "./library.ts";
import { registerModulesIpc } from "./modules.ts";
import { registerSessionIpc } from "./sessions.ts";
import { registerWorkspaceIpc } from "./workspace.ts";

/** Registers every IPC domain. Each module owns one slice of the `IPC` channel map. */
export function registerIpc(ctx: AppContext): void {
  registerAppIpc(ctx);
  registerSessionIpc(ctx);
  registerWorkspaceIpc(ctx);
  registerAccountIpc(ctx);
  registerLibraryIpc(ctx);
  registerAiIpc(ctx);
  registerModulesIpc(ctx);
}
