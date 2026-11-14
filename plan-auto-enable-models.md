# Auto-show newly discovered models (Gemini and others)

Hive already learns new models automatically (pi-antigravity calls `fetchAvailableModels` and writes `~/.pi/agent/models-store.json`), but `Composer.tsx` hides any model not listed in `settings.json -> enabledModels`. So every new Gemini model has to be ticked by hand. Fix: Hive remembers which models it has already seen, and auto-adds genuinely new ones to `enabledModels`. Small change (~4 files plus tests).

## Approach
- New ledger `hive-seen-models.json` (Hive data dir) records every `provider/id` Hive has seen.
- `ModelsService.getModelsCatalog()` diffs the catalog against the ledger. New keys from eligible providers get appended to `enabledModels`, then the ledger is updated. On first run it only seeds the ledger, so nothing floods in.
- Models you untick stay off: they are already in the ledger, so they never count as "new" again.
- Live sessions report their `get_available_models` list through a new IPC `modelsSyncDiscovered`, so a model discovered mid-session shows up without restarting Hive.
- Refresh the stale `FALLBACK_MODELS` Gemini entries.

## Decisions

> [!CHOICE] Which providers auto-enable new models
> **Question**: New models from which providers should appear automatically?
> - (x) **All except aggregators (openrouter)**: Gemini/Antigravity, Anthropic, zai, ollama auto-show; openrouter's 480+ churn stays manual [Recommended]
> - ( ) **All providers**: simplest, but openrouter will flood the picker
> - ( ) **Gemini only (antigravity + google)**: narrowest, other providers stay manual

> [!CHOICE] User control
> **Question**: Add a toggle in Settings > Models?
> - (x) **Yes, "Auto-enable new models" switch (default on)**: easy opt-out [Recommended]
> - ( ) **No toggle**: always on

<!-- MORE -->

## Changes
| File | Change |
|---|---|
| `apps/desktop/src/main/services/models.ts` | `[MODIFY]` seen-models ledger, `autoEnableNewModels()`, call it from `getModelsCatalog()`, new `syncDiscoveredModels(keys)`, toggle get/set, refresh `FALLBACK_MODELS` |
| `packages/protocol/src/ipc.ts` | `[MODIFY]` `IPC.modelsSyncDiscovered`, add `autoEnableNewModels` to `ModelsCatalogResponse`, plus the API typing |
| `apps/desktop/src/main/ipc/accounts.ts` + `apps/desktop/src/preload/index.ts` | `[MODIFY]` wire up the new IPC and the toggle save |
| `apps/desktop/src/renderer/store/session-store.ts` | `[MODIFY]` `refreshModels` / `hydrateSession`: when additions are found, call `syncDiscoveredModels` and adopt the returned `enabledModels` |
| `apps/desktop/src/renderer/components/ModelsSettingsContent.tsx` | `[MODIFY]` toggle switch (if chosen) |
| `apps/desktop/src/main/services/models.test.ts` | `[MODIFY]` tests: first-run seeding, new key auto-enabled, unticked stays off, openrouter skipped, empty `enabledModels` left empty (empty already means "show all") |

## Notes
- Right now the live Antigravity catalog (checked Nov 14) returns only `gemini-3.8-flash`, `gemini-4-argon-disabled`, `claude-opus-4-6`, `claude-sonnet-4-6` and `gpt-oss-120b`. Anything Google adds later will show up automatically after this change.
- Writes to `settings.json` go through the existing `readSettingsForWrite` and atomic rename, so a corrupt file is never overwritten.

## Verify
- `pnpm vitest run apps/desktop/src/main/services`
- `pnpm -r typecheck`
- Manual: delete one antigravity key from the ledger, restart Hive, and check that it appears in the picker.
