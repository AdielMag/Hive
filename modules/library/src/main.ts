import { existsSync } from "node:fs";
import { extname, isAbsolute } from "node:path";
import { shell } from "electron";
import { defineMainModule } from "@hive/module-sdk/main";
import { isInside, libraryRoots, listLibrary, setFrontmatterField } from "./service.ts";
import { LibraryMethods, MODULE_ID, type LibrarySetFieldRequest } from "./shared.ts";

export default defineMainModule({
  id: MODULE_ID,
  activate(ctx) {
    const opts = () => ({ agentDir: ctx.paths.piAgentDir });

    const isLibraryPath = (path: string, cwd?: string): boolean => {
      if (typeof path !== "string" || !isAbsolute(path) || !existsSync(path)) return false;
      return libraryRoots(cwd || undefined, opts()).some((r) => isInside(path, r.dir));
    };

    ctx.ipc.handle(LibraryMethods.list, ({ cwd }: { cwd?: string } = {}) =>
      listLibrary(cwd || undefined, opts()),
    );

    ctx.ipc.handle(LibraryMethods.setField, (req: LibrarySetFieldRequest) =>
      setFrontmatterField(req, opts()),
    );

    ctx.ipc.handle(LibraryMethods.reveal, ({ path, cwd }: { path: string; cwd?: string }) => {
      if (!isLibraryPath(path, cwd)) throw new Error("Not a skill or agent path");
      shell.showItemInFolder(path);
      return true;
    });

    ctx.ipc.handle(LibraryMethods.openPath, async ({ path, cwd }: { path: string; cwd?: string }) => {
      if (extname(path).toLowerCase() !== ".md" || !isLibraryPath(path, cwd)) {
        return { ok: false, error: "Only skill or agent markdown files can be opened" };
      }
      const err = await shell.openPath(path);
      return err ? { ok: false, error: err } : { ok: true };
    });
  },
});
