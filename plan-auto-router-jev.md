# Auto Router Using Jev

Add Auto (Jev) router model option to message prompter model picker. Jev dynamically classifies each task into optimal model tiers for both main session turns and delegated subagents when selected.

## Approach
- Add synthetic `Auto (Jev)` model (`jev/auto`) to model catalog and composer picker with custom icon.
- Add Jev routing engine (`modules/jev/src/router.ts`) and IPC method `routeTask` that classifies tasks into `fast`, `balanced`, or `heavy` tiers and maps them to active candidate models.
- Intercept composer prompt dispatch: when `Auto (Jev)` is selected, route prompt with Jev, switch Pi session model to chosen model, and notify UI while preserving `Auto (Jev)` tab selection.
- Propagate session auto-router mode to Pi subagent extension via bridge events; route subagent tasks through Jev when active.

## Decisions

> [!CHOICE] Routing Strategy
> **Question**: How should Jev route among user models?
> - (x) **Tier-based mapping**: Jev classifies task difficulty (fast/balanced/heavy) and maps to user's enabled models [Recommended]
> - ( ) **Dynamic candidate list**: Jev classifies directly against the names and descriptions of currently enabled models

<!-- MORE -->

## Changes

| File | Change |
|---|---|
| `packages/protocol/src/ipc.ts` | `[MODIFY]` Add `AUTO_JEV_MODEL_ID` and router type contracts |
| `modules/jev/src/shared.ts` | `[MODIFY]` Add `JevMethods.routeTask`, router questions and types |
| `modules/jev/src/router.ts` | `[NEW]` Pure task tier classifier and candidate model selector |
| `modules/jev/src/main.ts` | `[MODIFY]` Register `JevMethods.routeTask` IPC handler with usage logging |
| `modules/jev/agent/extensions/jev.ts` | `[MODIFY]` Export task routing questions and subagent helper |
| `apps/desktop/src/main/services/models.ts` | `[MODIFY]` Include `Auto (Jev)` in catalog response |
| `apps/desktop/src/renderer/components/ProviderIcon.tsx` | `[MODIFY]` Render Jev router icon for provider `jev` |
| `apps/desktop/src/renderer/components/Composer.tsx` | `[MODIFY]` Ensure `Auto (Jev)` is visible in dropdown and styled |
| `apps/desktop/src/renderer/store/session-store.ts` | `[MODIFY]` Handle `jev/auto` selection without failing Pi RPC, route prompt on send, notify bridge |
| `apps/desktop/resources/bridge/studio-bridge.ts` | `[MODIFY]` Handle `hive:auto-router` state events across bridge |
| `C:/Users/Adiel/.pi/agent/extensions/subagent/index.ts` | `[MODIFY]` Listen for auto-router state and route subagent tasks via Jev when enabled |
| `modules/jev/src/router.test.ts` | `[NEW]` Unit tests for task tiering and model candidate selection |

## Risks
- If TypeSafe API key is missing or invalid when Auto (Jev) is selected, routing will gracefully fall back to the default/previous model without blocking prompt dispatch.
- Subagent processes spawned with custom models must exist in user's Pi models store; fallback models are preserved if routed model fails.

## Verify
- `npx vitest run modules/jev/src`
- `npm run typecheck`
- Launch desktop app and verify `Auto (Jev)` appears in composer model picker, selects cleanly, and routes prompts.
