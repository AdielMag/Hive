import type { ModuleHost } from "@hive/module-sdk/renderer";
import { createGitApi, type GitApi } from "../shared.ts";

let current: ModuleHost | null = null;
let api: GitApi | null = null;

export function setGitHost(host: ModuleHost | null): void {
  current = host;
  api = host ? createGitApi((method, ...args) => host.ipc.invoke(method, ...args)) : null;
}

export function gitHostOrNull(): ModuleHost | null {
  return current;
}

export function gitHost(): ModuleHost {
  if (!current) throw new Error("git module is not active");
  return current;
}

export function gitApi(): GitApi {
  if (!api) throw new Error("git module is not active");
  return api;
}
