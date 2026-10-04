import type { ModuleHost } from "@hive/module-sdk/renderer";
import { MODULE_ID as GIT_MODULE_ID, createGitApi, type GitApi } from "@hive-module/git/shared";

let api: GitApi | null = null;

export function setBranchesHost(host: ModuleHost | null): void {
  api = host ? createGitApi((method, ...args) => host.ipc.invokeOf(GIT_MODULE_ID, method, ...args)) : null;
}

export function gitApi(): GitApi {
  if (!api) throw new Error("branches module is not active");
  return api;
}
