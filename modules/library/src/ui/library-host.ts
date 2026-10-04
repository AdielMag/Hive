import type { ModuleHost } from "@hive/module-sdk/renderer";

let current: ModuleHost | null = null;

export function setLibraryHost(host: ModuleHost | null): void {
  current = host;
}

export function libraryHost(): ModuleHost {
  if (!current) throw new Error("library module is not active");
  return current;
}
