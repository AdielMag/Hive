/**
 * Main-process half: GitHub Actions REST access for the active project's repo, exposed as `mod:actions:<method>`.
 * The renderer resolves the repo once (`repo`) and passes `{ owner, repo }` to the other calls.
 */
import { defineMainModule } from "@hive/module-sdk/main";
import { createGithubClient } from "./service/github.ts";
import { resolveRemote } from "./service/remote.ts";
import { createTokenProvider } from "./service/token.ts";
import { ActionsMethods as M, MODULE_ID, type ActionsRepo, type ActionsResult, type RepoRef, type RunsQuery } from "./shared.ts";

export default defineMainModule({
  id: MODULE_ID,
  activate(ctx) {
    const tokens = createTokenProvider(() => ctx.paths.moduleData());
    const github = createGithubClient({ getToken: async () => (await tokens.resolve()).token });
    const h = ctx.ipc.handle;

    h(M.repo, async (cwd: string): Promise<ActionsResult<ActionsRepo>> => {
      const found = await resolveRemote(cwd);
      if (found.kind === "no_remote") return { ok: false, code: "no_remote", message: "This project has no git remote." };
      if (found.kind === "not_github") return { ok: false, code: "not_github", message: `Not a GitHub repository (${found.url}).` };
      const { source } = await tokens.resolve();
      return { ok: true, data: { owner: found.slug.owner, repo: found.slug.repo, branch: found.branch, tokenSource: source } };
    });
    h(M.runs, (repo: RepoRef, query: RunsQuery) => github.runs(repo, query ?? {}));
    h(M.jobs, (repo: RepoRef, runId: number) => github.jobs(repo, runId));
    h(M.workflows, (repo: RepoRef) => github.workflows(repo));
    h(M.setToken, (token: string) => {
      if (typeof token !== "string" || !token.trim()) throw new Error("Token is empty");
      tokens.save(token);
    });
    h(M.clearToken, () => tokens.clear());
  },
});
