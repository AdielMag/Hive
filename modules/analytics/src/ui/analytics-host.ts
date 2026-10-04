import type { ModuleHost } from "@hive/module-sdk/renderer";

let current: ModuleHost | null = null;

export function setAnalyticsHost(host: ModuleHost | null): void {
  current = host;
}

export function analyticsHost(): ModuleHost {
  if (!current) throw new Error("analytics module is not active");
  return current;
}
