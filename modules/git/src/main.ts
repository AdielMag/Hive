/**
 * Main-process half: git operations for the active workspace, exposed as `mod:git:<method>`.
 * Commit-message generation runs the Pi CLI, so it needs `ctx.pi()`.
 */
import { defineMainModule } from "@hive/module-sdk/main";
import * as git from "./service.ts";
import { GitMethods as M, MODULE_ID, type GitDiffOptions } from "./shared.ts";

export default defineMainModule({
  id: MODULE_ID,
  activate(ctx) {
    const h = ctx.ipc.handle;
    h(M.status, (cwd: string) => git.getGitStatus(cwd));
    h(M.branches, (cwd: string) => git.getGitBranches(cwd));
    h(M.checkout, (cwd: string, branch: string) => git.gitCheckout(cwd, branch));
    h(M.createBranch, (cwd: string, branch: string) => git.gitCreateBranch(cwd, branch));
    h(M.deleteBranch, (cwd: string, branch: string, force?: boolean) => git.gitDeleteBranch(cwd, branch, force));
    h(M.log, (cwd: string, maxCount?: number) => git.getGitLog(cwd, maxCount));
    h(M.branchDetails, (cwd: string) => git.getGitBranchDetails(cwd));
    h(M.graph, (cwd: string, maxCount?: number) => git.getGitGraph(cwd, maxCount));
    h(M.stage, (cwd: string, filePath: string) => git.stageFile(cwd, filePath));
    h(M.stageAll, (cwd: string) => git.stageAll(cwd));
    h(M.unstage, (cwd: string, filePath: string) => git.unstageFile(cwd, filePath));
    h(M.unstageAll, (cwd: string) => git.unstageAll(cwd));
    h(M.discard, (cwd: string, filePath: string) => git.discardFile(cwd, filePath));
    h(M.discardAll, (cwd: string) => git.discardAll(cwd));
    h(M.commit, (cwd: string, message: string, amend?: boolean) => git.gitCommit(cwd, message, amend));
    h(M.diff, (cwd: string, options?: GitDiffOptions) => git.getGitDiff(cwd, options));
    h(M.fetch, (cwd: string) => git.gitFetch(cwd));
    h(M.pull, (cwd: string) => git.gitPull(cwd));
    h(M.push, (cwd: string) => git.gitPush(cwd));
    h(M.generateCommitMessage, (cwd: string, model?: string) => {
      const pi = ctx.pi();
      if (pi === null) throw new Error("Pi CLI not available to generate commit message");
      return git.generateCommitMessage(cwd, pi, model);
    });
  },
});
