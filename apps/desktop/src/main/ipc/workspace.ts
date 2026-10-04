import { IPC } from "@hive/protocol";
import type { AppContext } from "../context.ts";
import { listDirectory, readFileContent, readMediaFile } from "../services/files.ts";
import { handle } from "./util.ts";

/**
 * File access. The composer (attachments), the command palette (quick open) and the `files` / `diff-viewer`
 * modules all read files through these. Git lives in the `git` module (`mod:git:*`).
 */
export function registerWorkspaceIpc(_ctx: AppContext): void {
  handle(IPC.filesList, ({ dirPath }: { dirPath: string }) => listDirectory(dirPath));
  handle(IPC.filesRead, ({ filePath }: { filePath: string }) => readFileContent(filePath));
  handle(IPC.filesReadMedia, ({ filePath }: { filePath: string }) => readMediaFile(filePath));
}
