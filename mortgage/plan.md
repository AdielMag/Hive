# Disable AI providers (Models + AI Providers tabs)

Add one shared "provider enabled" checkbox. It appears on each provider in Settings → Models and Settings → AI Providers. A disabled provider's models disappear from the Composer model picker, the AI-tool model picker, the "Specific Model..." dropdowns and the Library picker. Medium change: one new IPC pair, one store slice, and a pure filter used by every picker.

## Approach
- Store a `disabledProviders: string[]` list. It rides along in `getModelsCatalog()` and is saved through a new `models:save-disabled-providers` IPC.
- Session store gets `disabledProviders` + `setProviderDisabled(provider, disabled)`. Both settings tabs read and write that one slice, so they stay in sync.
- New pure helper `filterDisabledProviders(models, disabled)` in `renderer/lib/`. Composer, `ModelPickerPopover`, the `ModelsSettingsContent` "Specific Model..." selects and `host.models.catalog()` (Library picker) all call it.
- AI Providers tab lists the union of the 3 login providers and every provider found in the model catalog. That brings `zai` and `openrouter` in, with a checkbox only and no login UI.
- Per-model `enabledModels` is never touched. Disabling is reversible: re-enabling restores the old selection.

## Decisions

> [!CHOICE] Where to persist the disabled list
> **Question**: Which file holds `disabledProviders`?
> - (x) **Hive data dir** (`disabled-providers.json`): Hive-only, can't confuse Pi CLI with an unknown settings key [Recommended]
> - ( ) **Pi `settings.json`**: shared with Pi CLI, but Pi may reject or strip an unknown key

> [!CHOICE] Session already using a disabled provider's model
> **Question**: What happens to open sessions on a model from a provider you just disabled?
> - (x) **Keep running, hide from pickers**: no surprise mid-session switch; the model just can't be re-picked [Recommended]
> - ( ) **Force-switch to another model**: strict, but silently changes a live session

<!-- MORE -->

## Changes
| File | Change |
|---|---|
| `packages/protocol/src/ipc.ts` | `[MODIFY]` add `IPC.modelsSaveDisabledProviders`, `disabledProviders` on `ModelsCatalogResponse`, `saveDisabledProviders` on the studio API type |
| `apps/desktop/src/main/services/models.ts` | `[MODIFY]` read/write `disabled-providers.json`; return it from `getModelsCatalog()`; add `saveDisabledProviders()` |
| `apps/desktop/src/main/ipc/accounts.ts` | `[MODIFY]` register the new handler |
| `apps/desktop/src/preload/index.ts` | `[MODIFY]` expose `saveDisabledProviders` |
| `apps/desktop/src/renderer/lib/provider-filter.ts` | `[NEW]` `filterDisabledProviders`, `isProviderDisabled` |
| `apps/desktop/src/renderer/store/session-store.ts` | `[MODIFY]` `disabledProviders` state, load in `loadModelsCatalog`, `setProviderDisabled` action |
| `apps/desktop/src/renderer/components/Composer.tsx` | `[MODIFY]` filter `baseModels` |
| `apps/desktop/src/renderer/components/ModelPickerPopover.tsx` | `[MODIFY]` filter `visibleModels` |
| `apps/desktop/src/renderer/components/ModelsSettingsContent.tsx` | `[MODIFY]` per-provider checkbox in each section header; dim disabled sections and chips; "Specific Model..." selects and active count exclude disabled providers |
| `apps/desktop/src/renderer/components/SettingsModal.tsx` | `[MODIFY]` `AccountsTab`: checkbox on each card; extra cards for catalog providers not in `getAuthAccounts()` |
| `apps/desktop/src/renderer/modules/host.tsx` | `[MODIFY]` `host.models.catalog()` returns filtered list |
| `apps/desktop/src/main/services/models.test.ts` | `[MODIFY]` catalog returns disabled list; save/load round-trip; corrupt file tolerated |
| `apps/desktop/src/renderer/lib/provider-filter.test.ts` | `[NEW]` filter cases (hide, restore, unknown provider) |

## Risks
- Pickers fall back to "all models" when the enabled-keys filter leaves nothing. The provider filter runs before that fallback, otherwise a disabled provider would reappear.
- If every provider is disabled, pickers are empty. Show an "All providers disabled, enable one in Settings" hint instead of a blank list.
- This is UI-level only. Pi itself still sees the provider's credentials; a model in an already-open session keeps working.
- `host.models.catalog()` is not reactive. The Library picker reads it at render, which is fine because the settings modal blocks the picker while open.

## Verify
- `npm test` (new unit tests) and the desktop typecheck.
- Manual: disable `openrouter` in Models, then check the Composer picker, the git-commit AI chip picker and "Specific Model..." select. All should drop its models.
- Manual: tick the same provider in AI Providers and confirm Models reflects it, and vice versa. Restart the app and confirm it persists.
- Manual: re-enable and confirm the previously chosen per-model checkboxes are intact.
