import type { ModuleHost } from "@hive/module-sdk/renderer";

let current: ModuleHost | null = null;

export function setBrowserHost(host: ModuleHost | null): void {
  current = host;
}

export function browserHost(): ModuleHost {
  if (!current) throw new Error("browser module is not active");
  return current;
}
