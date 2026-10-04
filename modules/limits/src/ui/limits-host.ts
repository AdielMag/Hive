import type { ModuleHost } from "@hive/module-sdk/renderer";

let current: ModuleHost | null = null;

export function setLimitsHost(host: ModuleHost | null): void {
  current = host;
}

export function limitsHost(): ModuleHost {
  if (!current) throw new Error("limits module is not active");
  return current;
}
