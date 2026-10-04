import { IPC } from "@hive/protocol";
import type { AppContext } from "../context.ts";
import * as git from "../services/git.ts";
import { listDirectory, readFileContent, readMediaFile, runWithInterpreter } from "../services/files.ts";
import { handle } from "./util.ts";

type Cwd = { cwd: string };
type CwdFile = { cwd: string; filePath: string };
type CwdBranch = { cwd: string; branch: string };

/** Git, files, and the integrated terminal. */
export function registerWorkspaceIpc(ctx: AppContext): void {
  handle(IPC.gitStatus, ({ cwd }: Cwd) => git.getGitStatus(cwd));
  handle(IPC.gitBranches, ({ cwd }: Cwd) => git.getGitBranches(cwd));
  handle(IPC.gitCheckout, ({ cwd, branch }: CwdBranch) => git.gitCheckout(cwd, branch));
  handle(IPC.gitCreateBranch, ({ cwd, branch }: CwdBranch) => git.gitCreateBranch(cwd, branch));
  handle(IPC.gitDeleteBranch, ({ cwd, branch, force }: CwdBranch & { force?: boolean }) =>
    git.gitDeleteBranch(cwd, branch, force),
  );
  handle(IPC.gitLog, ({ cwd, maxCount }: Cwd & { maxCount?: number }) => git.getGitLog(cwd, maxCount));
  handle(IPC.gitStage, ({ cwd, filePath }: CwdFile) => git.stageFile(cwd, filePath));
  handle(IPC.gitStageAll, ({ cwd }: Cwd) => git.stageAll(cwd));
  handle(IPC.gitUnstage, ({ cwd, filePath }: CwdFile) => git.unstageFile(cwd, filePath));
  handle(IPC.gitUnstageAll, ({ cwd }: Cwd) => git.unstageAll(cwd));
  handle(IPC.gitDiscard, ({ cwd, filePath }: CwdFile) => git.discardFile(cwd, filePath));
  handle(IPC.gitDiscardAll, ({ cwd }: Cwd) => git.discardAll(cwd));
  handle(IPC.gitCommit, ({ cwd, message, amend }: Cwd & { message: string; amend?: boolean }) =>
    git.gitCommit(cwd, message, amend),
  );
  handle(IPC.gitDiff, ({ cwd, options }: Cwd & { options?: { staged?: boolean; filePath?: string } }) =>
    git.getGitDiff(cwd, options),
  );
  handle(IPC.gitFetch, ({ cwd }: Cwd) => git.gitFetch(cwd));
  handle(IPC.gitPull, ({ cwd }: Cwd) => git.gitPull(cwd));
  handle(IPC.gitPush, ({ cwd }: Cwd) => git.gitPush(cwd));
  handle(IPC.gitGenerateCommitMessage, ({ cwd, model }: Cwd & { model?: string }) => {
    if (!ctx.pi.ok) throw new Error("Pi CLI not available to generate commit message");
    return git.generateCommitMessage(cwd, ctx.pi.info, model);
  });

  handle(IPC.filesList, ({ dirPath }: { dirPath: string }) => listDirectory(dirPath));
  handle(IPC.filesRead, ({ filePath }: { filePath: string }) => readFileContent(filePath));
  handle(IPC.filesReadMedia, ({ filePath }: { filePath: string }) => readMediaFile(filePath));
  handle(IPC.filesRun, ({ filePath, cwd }: CwdFile) => runWithInterpreter(filePath, cwd));

  handle(IPC.terminalCreate, (options?: { cwd?: string; shell?: string; cols?: number; rows?: number }) =>
    ctx.terminals.createTerminal(
      options,
      (id, data) => ctx.getWindow()?.webContents.send(IPC.evtTerminalData, { id, data }),
      (id, exitCode) => ctx.getWindow()?.webContents.send(IPC.evtTerminalExit, { id, exitCode }),
    ),
  );
  handle(IPC.terminalWrite, ({ id, data }: { id: string; data: string }) => ctx.terminals.write(id, data));
  handle(IPC.terminalResize, ({ id, cols, rows }: { id: string; cols: number; rows: number }) =>
    ctx.terminals.resize(id, cols, rows),
  );
  handle(IPC.terminalKill, ({ id }: { id: string }) => ctx.terminals.kill(id));
  handle(IPC.terminalList, () => ctx.terminals.list());
}
