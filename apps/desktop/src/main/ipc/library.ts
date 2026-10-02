import { existsSync } from "node:fs";
import { extname, isAbsolute } from "node:path";
import { shell } from "electron";
import { IPC, type LibrarySetFieldRequest } from "@pi-studio/protocol";
import type { AppContext } from "../context.ts";
import { piAgentDir } from "../paths.ts";
import { isInside, libraryRoots, listLibrary, setFrontmatterField } from "../services/library.ts";
import { handle } from "./util.ts";

const opts = () => ({ agentDir: piAgentDir() });

/** Paths the renderer may reveal/open: anything inside a discovery root (library files, skill folders). */
function isLibraryPath(path: string, cwd?: string): boolean {
  if (typeof path !== "string" || !isAbsolute(path) || !existsSync(path)) return false;
  return libraryRoots(cwd || undefined, opts()).some((r) => isInside(path, r.dir));
}

/** Skills & subagents library (discovery + frontmatter edits). */
export function registerLibraryIpc(_ctx: AppContext): void {
  handle(IPC.libraryList, ({ cwd }: { cwd?: string } = {}) => listLibrary(cwd || undefined, opts()));
  handle(IPC.librarySetField, (req: LibrarySetFieldRequest) => setFrontmatterField(req, opts()));
  handle(IPC.libraryReveal, ({ path, cwd }: { path: string; cwd?: string }) => {
    if (!isLibraryPath(path, cwd)) throw new Error("Not a skill or agent path");
    shell.showItemInFolder(path);
  });
  handle(IPC.libraryOpenPath, async ({ path, cwd }: { path: string; cwd?: string }) => {
    // shell.openPath launches executables/scripts (.bat, .ps1, .sh...) found in skill folders,
    // so only markdown definitions may be handed to the OS default app.
    if (extname(path).toLowerCase() !== ".md" || !isLibraryPath(path, cwd)) {
      return { ok: false, error: "Only skill or agent markdown files can be opened" };
    }
    const err = await shell.openPath(path);
    return err ? { ok: false, error: err } : { ok: true };
  });
}
