# Reload button in the status bar

Add a bottom-bar button that runs Pi's `/reload` (new extensions, skills, prompts, MCP config) for the active session. The bridge already has a `reload` action, but it is never called, and it would time out today: `ctx.reload()` tears down the old extension runtime and its bridge socket. So the work is: make the action reliable, add the button, then refresh every view that caches registry-derived data (context breakdown, tools breakdown, status bar, models).

## Approach
- **Bridge fix:** the main process resolves a `reload` action when the new runtime reconnects (`hello`, then its first `registry`), instead of waiting for a `command_result` the dead runtime can never send. Errors thrown before shutdown still reject, 30s timeout.
- **Button:** icon-only `RefreshCw` in `StatusBar` (spins while reloading, tooltip "Reload Pi: extensions, skills, prompts, MCP"). Disabled when no live session or while the agent is running.
- **Store action `reloadPi()`:** clears that tab's extension status and widgets, runs the action, then refreshes dependent state (below).
- **Dependent views:** a `reloadEpoch` counter in the session store is the single "reload happened" signal. Context breakdown, tools breakdown, status bar, and model picker re-derive from it.
- Also add a "Reload Pi" command to the command palette.

## Decisions

> [!CHOICE] Reload scope
> **Question**: Which sessions does the button reload?
> - (x) **Active session only**: matches `/reload` in the CLI, no surprise for background runs [Recommended]
> - ( ) **All live sessions**: every tab picks up new skills at once, but may interrupt background runs

> [!CHOICE] While the agent is running
> **Question**: Can the user reload mid-run?
> - (x) **Disabled with tooltip**: reloading mid-turn can swap tools under a running call [Recommended]
> - ( ) **Abort then reload**: one click, but it kills the run

<!-- MORE -->

## What goes stale after a reload

| View / state | Why it goes stale | Fix |
|---|---|---|
| Context window panel and composer ring | Tool and skill list (system-prompt residual split) plus AGENTS.md sizes; `contextFilesCache` has a 15s TTL | Registry arrives via bridge; export `invalidateContextFiles()` and call it; `refreshStats(key)` for the new context total |
| Tools breakdown panel | Registry updates itself, but the MCP catalog loads once on mount | Expose `reloadEpoch` on `ActiveSessionContext`; `ToolsPanel` re-runs `refreshMcp()` when it changes |
| Transcript skill annotations | Reads `registry.skills` | Automatic once the new registry lands |
| Status bar (`McpChip`, extension statuses) | Removed extensions never send `setStatus(undefined)` | Clear the tab's `extensionStatus` and `extensionWidgets` before reloading; new runtime repopulates |
| Model picker | Extensions can add or remove providers | Extract the `get_available_models` fetch from `hydrateSession` into `refreshModels(key)` and call it |
| Registry store | Hash dedupe could skip a resend | New runtime has a fresh hash, so it always resends; verify in test |
| Background tabs | Keep the old runtime | Out of scope (see decision); their badge is unchanged |

## Changes
| File | Change |
|---|---|
| `apps/desktop/src/main/bridge-server/index.ts` | `[MODIFY]` reload pending resolves on `hello` then `registry`; 30s timeout |
| `apps/desktop/src/main/services/session-manager.ts` | `[MODIFY]` pass the longer timeout for `reload` |
| `apps/desktop/resources/bridge/studio-bridge.ts` | `[MODIFY]` reload handler: do not send a result after `ctx.reload()`; keep the error path |
| `apps/desktop/src/renderer/store/session-store.ts` | `[MODIFY]` `reloadPi()`, `isReloading`, `reloadEpoch`, `refreshModels()` |
| `apps/desktop/src/renderer/components/StatusBar.tsx` | `[MODIFY]` reload button |
| `apps/desktop/src/renderer/styles/shell.css` | `[MODIFY]` spin state for `.statusbar__btn` |
| `apps/desktop/src/renderer/components/ContextBreakdownView.tsx` | `[MODIFY]` export `invalidateContextFiles()`; refetch on `reloadEpoch` |
| `apps/desktop/src/renderer/modules/host.tsx` | `[MODIFY]` pass `reloadEpoch` into `useActiveSession()` |
| `packages/module-sdk/src/renderer.ts` | `[MODIFY]` add `reloadEpoch` to `ActiveSessionContext` |
| `modules/tools/src/ui/ToolsPanel.tsx` | `[MODIFY]` refresh MCP catalog on `reloadEpoch` |
| `apps/desktop/src/renderer/features/commands/registry.ts` | `[MODIFY]` "Reload Pi" command |
| `apps/desktop/src/main/bridge-server/*.test.ts`, `session-store` tests | `[NEW]` coverage below |

## Risks
- `ctx.reload()` semantics in RPC mode: code after it runs in the pre-reload runtime, so nothing after it may touch the socket. Covered by resolving on reconnect.
- If the new runtime fails to load (broken extension), no `hello` arrives: the timeout surfaces the error in the existing session error banner and the button re-enables.
- Cost: reload does not invalidate the provider prompt cache beyond what changed tools or prompts cause; the model-switch cache bar is unaffected.

## Verify
- `npm test` (add tests: bridge-server resolves reload on hello plus registry, rejects on timeout; `reloadPi` clears statuses and bumps `reloadEpoch`; registry store replaces tools on resend).
- `npx tsc -b` and `npm run lint`.
- Manual: with a session open, add a skill folder under `~/.pi/agent/skills`, click reload, confirm it appears in the Tools breakdown, the context panel's system split changes, and the MCP chip updates. Confirm the button is disabled while a run is streaming.
