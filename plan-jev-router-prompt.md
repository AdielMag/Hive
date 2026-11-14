# Configurable Jev Router Model and Prompt

Tier model pins already exist (Settings > Accounts > Jev > "Auto (Jev) routing"). Still hard-coded: the Jev classifier model the router calls (`settings.model`, `jev-latest`, no UI) and the router prompt (`ROUTER_QUESTIONS`, duplicated in `src/router.ts` and `agent/extensions/jev.ts`). Make both editable in the routing card. Small-medium, all in `modules/jev`.

## Approach
- Add to `RouterSettings`: `jevModel: string | null` (null = global Jev model) and `prompt` overrides (tier + reasoning instructions, per-option criteria; each null = built-in default).
- New pure `buildRouterQuestions(prompt)` in `router.ts` merges overrides onto the defaults; `main.ts` `routeTask` uses it plus `jevModel`. Mirror in the extension's `loadRouterPrefs` / `routeTaskWithJev` so subagents match (parity test extended).
- Routing card gets a "Jev model" text field and a collapsible "Router prompt" editor: textareas prefilled with defaults, "modified" marker, per-field and "Reset all" buttons.
- Defaults reproduce today's behaviour exactly; blank text = default. Overrides are length-capped (instructions 2k, each criterion 1k chars).

## Decisions

> [!CHOICE] Jev model scope
> **Question**: Where should the Jev model be configurable?
> - (x) **Router override + global field**: `router.jevModel` for routing, and expose the global `model` (ask_jev, compaction) in the Jev card [Recommended]
> - ( ) **Global only**: one model field for everything Jev does
> - ( ) **Router only**: just `router.jevModel`, leave global hidden

> [!CHOICE] Prompt editing depth
> **Question**: How much of the prompt is editable?
> - (x) **Instructions + per-option criteria**: tier (fast/balanced/heavy) and reasoning (off/low/high) text, fixed option sets [Recommended]
> - ( ) **Instructions only**: two textareas, criteria stay built-in
> - ( ) **Raw JSON**: edit the whole questions object; most power, easiest to break routing

<!-- MORE -->

## Changes
| File | Change |
|---|---|
| `modules/jev/src/shared.ts` | `[MODIFY]` `RouterPromptOverrides` type, `RouterSettings.jevModel/prompt`, defaults, normalize (trim, cap, blank to null), patch merge |
| `modules/jev/src/router.ts` | `[MODIFY]` `DEFAULT_ROUTER_QUESTIONS` + `buildRouterQuestions(prompt)`; keep `ROUTER_QUESTIONS` export as the default |
| `modules/jev/src/main.ts` | `[MODIFY]` `routeTask` sends `prefs.jevModel ?? settings.model` and `buildRouterQuestions(prefs.prompt)`; usage records log the model used |
| `modules/jev/agent/extensions/jev.ts` | `[MODIFY]` `loadRouterPrefs` reads `jevModel`/`prompt`; `routeTaskWithJev` builds questions and overrides model |
| `modules/jev/src/ui/JevSettings.tsx` | `[MODIFY]` Jev model field(s), collapsible prompt editor with reset |
| `modules/jev/src/ui/jev.css` | `[MODIFY]` textarea / modified-marker styles |
| `modules/jev/src/router-settings.test.ts`, `router.test.ts`, `jev-core.test.ts` | `[MODIFY]` normalize, build-questions merge, parity of mirrored builder, model override sent |

## Details
- Option keys (`fast/balanced/heavy`, `off/low/high`) stay fixed: `resolveRouterDecision` depends on them.
- `eval/run-router-eval.ts` keeps defaults but accepts an optional `--settings` path so a custom prompt can be benchmarked.

## Verify
- `npx vitest run modules/jev`
- `npm run typecheck`
- Manual: set Jev model to `jev-latest` explicitly and edit heavy criteria; send a task with Auto (Jev); usage log shows router call with that model; Reset all restores defaults.
