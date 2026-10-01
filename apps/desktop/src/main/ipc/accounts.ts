import { IPC } from "@pi-studio/protocol";
import type { AppContext } from "../context.ts";
import { handle } from "./util.ts";

type Force = { force?: boolean } | undefined;

/** Accounts, models, updates and the insights (quota + usage) windows. */
export function registerAccountIpc(ctx: AppContext): void {
  handle(IPC.authGetAccounts, () => ctx.auth?.getAccounts() ?? []);
  handle(IPC.authSaveApiKey, ({ providerId, apiKey }: { providerId: string; apiKey: string }) =>
    ctx.auth?.saveApiKey(providerId, apiKey),
  );
  handle(IPC.authLogout, ({ providerId }: { providerId: string }) => ctx.auth?.logout(providerId));
  handle(IPC.authLoginOAuth, ({ providerId }: { providerId: string }) =>
    ctx.auth?.loginOAuth(providerId) ?? { success: false, error: "Auth not initialized" },
  );

  handle(IPC.updaterCheck, () => ctx.updater.checkForUpdates());
  handle(IPC.updaterApply, ({ downloadUrl }: { downloadUrl?: string }) => ctx.updater.applyUpdate(downloadUrl));

  handle(IPC.modelsGetCatalog, () => ctx.models.getModelsCatalog());
  handle(IPC.modelsSaveEnabled, ({ enabledModels }: { enabledModels: string[] }) =>
    ctx.models.saveEnabledModels(enabledModels),
  );
  handle(IPC.settingsGetCompaction, () => ctx.models.getCompactionSettings());
  handle(IPC.settingsSaveCompaction, (settings: { enabled: boolean; reserveTokens: number; keepRecentTokens: number }) =>
    ctx.models.saveCompactionSettings(settings),
  );

  handle(IPC.quotaGet, (opts: Force) => ctx.quota.getSnapshot(opts?.force));
  handle(IPC.usageGet, (opts: Force) => ctx.usage.getReport(opts?.force));
}
