import type { ModuleHost } from "@hive/module-sdk/renderer";
import { createActionsApi, type ActionsApi } from "../shared.ts";

let current: ModuleHost | null = null;
let api: ActionsApi | null = null;

export function setActionsHost(host: ModuleHost | null): void {
  current = host;
  api = host ? createActionsApi((method, ...args) => host.ipc.invoke(method, ...args)) : null;
}

export function actionsHostOrNull(): ModuleHost | null {
  return current;
}

export function actionsHost(): ModuleHost {
  if (!current) throw new Error("actions module is not active");
  return current;
}

export function actionsApi(): ActionsApi {
  if (!api) throw new Error("actions module is not active");
  return api;
}
