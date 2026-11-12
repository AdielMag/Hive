# Configurable Auto (Jev) Routing

Today the Auto (Jev) router is fully hard-coded: model tiers are guessed from model names/prices, the pool is "every enabled model", and the confidence/thinking policy is fixed. Add a `router` section to Jev settings and an "Auto (Jev) routing" card in Settings > Accounts > Jev so the user can steer it. Medium size, mostly `modules/jev`.

## Approach
- New `router` block in `JevSettings` (normalized, patchable): `useJev`, `tierModels` (pin a model per tier, null = automatic), `excluded` (models left out of the auto pool), `applyThinking`, `minConfidence` (promote unsure "fast" verdicts), `notify` (toast on route).
- New pure `pickRoutedModel()` in `router.ts` applies exclusions and pins before the existing `selectModelForTier` fallback; `main.ts` `routeTask` and `routeTaskLocally` use it, and `useJev: false` skips the API (offline heuristic only, zero cost).
- Settings card lists enabled models via `host.models.catalog()` + `enabledKeys()`: three tier dropdowns ("Automatic (currently X)" preview + models), a checklist to exclude models, and the switches/number field.
- Renderer (`session-store.ts`) honours the new `applyThinking` / `notify` flags returned on `RouteTaskResult`.

## Decisions

> [!CHOICE] Subagent routing
> **Question**: The subagent extension calls `routeTaskWithJev` from the Pi `jev.ts` extension, which does not exist, so subagents never auto-route today. Fix it in this change?
> - ( ) **Main session only**: settings apply to composer routing; subagent gap noted, separate task
> - (x) **Also add `routeTaskWithJev`**: export it from `modules/jev/agent/extensions/jev.ts`, reading the same settings file, so subagents honour pins/exclusions too [Recommended]

<!-- MORE -->

## Changes
| File | Change |
|---|---|
| `modules/jev/src/shared.ts` | `[MODIFY]` `RouterSettings` type, defaults, normalize/patch, `RouteTaskResult.applyThinking/notify` |
| `modules/jev/src/router.ts` | `[MODIFY]` `pickRoutedModel()`, configurable `minConfidence` in `resolveRouterDecision` |
| `modules/jev/src/main.ts` | `[MODIFY]` `routeTask` reads `settings.router` (useJev, pins, exclusions, threshold) |
| `modules/jev/src/ui/JevSettings.tsx` | `[MODIFY]` new "Auto (Jev) routing" card |
| `modules/jev/src/ui/jev.css` | `[MODIFY]` styles for tier selects + model checklist |
| `apps/desktop/src/renderer/store/session-store.ts` | `[MODIFY]` respect `applyThinking` / `notify` |
| `modules/jev/agent/extensions/jev.ts` | `[MODIFY]` only if subagent option chosen: export `routeTaskWithJev` |
| `modules/jev/src/router.test.ts`, `jev-core.test.ts` | `[MODIFY]` tests for pins, exclusions, threshold, settings normalize |

## Details
- Model keys stored as `provider/id`. A pin whose model is gone or excluded falls back to automatic selection (never fails a send).
- If exclusions empty the pool, ignore them rather than return nothing.
- Defaults reproduce current behaviour exactly (`useJev: true`, no pins, no exclusions, `applyThinking: true`, `minConfidence: 0.7`, `notify: true`).

## Verify
- `npx vitest run modules/jev`
- `npm run typecheck`
- Manual: pin "fast" to a model, send "git status" with Auto (Jev) selected, toast shows the pinned model.
