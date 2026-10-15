# Separate Pi CLI and Extensions in Settings Updates

Settings → Updates currently bundles Pi CLI and all extensions into a single card and a single update action. This splits them into dedicated cards for Pi CLI and Pi Extensions, and allows viewing and updating each extension independently.

## Approach
- Split `PiUpdateCard` in `SettingsModal.tsx` into two distinct cards: `PiCliUpdateCard` and `PiExtensionsUpdateCard`.
- Extend `PiUpdaterService.install(target?: string)` to support targeting `"cli"`, `"extensions"`, or an individual extension name (while retaining default all-update behavior).
- Pass `target` through IPC (`IPC.piUpdateApply`), preload (`applyPiUpdate(target)`), and protocol interfaces.
- Update `update-store.ts` to track `installingTarget`, separate results (`piCliResult`, `piExtResult`), and update `piInfo` selectively per target.
- Render each extension as its own row with current/latest versions and an individual update button, plus an "Update all" button when multiple extensions have pending updates.

## Decisions

> [!CHOICE] Extension update granularity
> **Question**: Should users be able to update individual extensions independently?
> - (x) **Individual + Update all**: Update any extension on its own, with an "Update all" shortcut when multiple updates exist [Recommended]
> - ( ) **All extensions only**: One update button for all extensions as a bulk group

<!-- MORE -->

## Changes

| File | Change |
|---|---|
| `packages/protocol/src/ipc.ts` | `[MODIFY]` Update `applyPiUpdate(target?: string)` signature |
| `apps/desktop/src/preload/index.ts` | `[MODIFY]` Forward `target` argument in `applyPiUpdate` |
| `apps/desktop/src/main/ipc/accounts.ts` | `[MODIFY]` Receive `target` in `IPC.piUpdateApply` handler |
| `apps/desktop/src/main/services/pi-updater.ts` | `[MODIFY]` Support target-specific installation (`"cli"`, `"extensions"`, or extension name) in `install(target?)` |
| `apps/desktop/src/main/services/pi-updater.test.ts` | `[MODIFY]` Add test cases for targeted CLI and extension updates |
| `apps/desktop/src/renderer/store/update-store.ts` | `[MODIFY]` Track `installingTarget`, separate CLI/extension results, and apply selective `piInfo` updates |
| `apps/desktop/src/renderer/components/SettingsModal.tsx` | `[MODIFY]` Replace `PiUpdateCard` with `PiCliUpdateCard` and `PiExtensionsUpdateCard` |

## Verify
- `npm test -- apps/desktop/src/main/services/pi-updater.test.ts`
- `npm run check` or `npm run build` / typecheck
- Confirm Settings → Updates shows separate Hive, Pi CLI, and Pi Extensions cards with working individual update buttons.
