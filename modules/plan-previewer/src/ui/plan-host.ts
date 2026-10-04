/** The ModuleHost handed to this module at activation; the plan UI reaches core only through it. */
import type { ModuleHost } from "@hive/module-sdk/renderer";

let current: ModuleHost | null = null;

export function setPlanHost(host: ModuleHost | null): void {
  current = host;
}

export function planHost(): ModuleHost {
  if (!current) throw new Error("plan-previewer module is not active");
  return current;
}
