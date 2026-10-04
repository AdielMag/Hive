/**
 * Core module channels (list / enable / onboarding) plus the ONE generic handler every module method goes
 * through. The host rejects calls to unknown or disabled modules, so a disabled module has no reachable IPC.
 */
import { IPC } from "@hive/protocol";
import type { AppContext } from "../context.ts";
import { handle } from "./util.ts";

const isString = (v: unknown): v is string => typeof v === "string" && v.length > 0;

export function registerModulesIpc(ctx: AppContext): void {
  const host = ctx.modules;

  handle(IPC.modulesList, () => host.snapshot());

  handle(IPC.modulesSetEnabled, (moduleId: unknown, enabled: unknown) => {
    if (!isString(moduleId)) throw new Error("moduleId must be a string");
    return host.setEnabled(moduleId, enabled === true);
  });

  handle(IPC.modulesSetEnabledSet, (moduleIds: unknown) => {
    if (!Array.isArray(moduleIds) || !moduleIds.every(isString)) throw new Error("moduleIds must be a string array");
    return host.setEnabledSet(moduleIds);
  });

  handle(IPC.modulesMarkOnboarded, () => host.markOnboarded());

  handle(IPC.modulesInvoke, (moduleId: unknown, method: unknown, ...args: unknown[]) => {
    if (!isString(moduleId) || !isString(method)) throw new Error("moduleId and method must be strings");
    return host.invoke(moduleId, method, args);
  });
}
