# Scoped Workspaces and Tab Performance Optimization

Eliminate cross-project tab switching hiccups by removing blocking filesystem scans and redundant session deserialization, and transition Hive to scoped project workspaces where each project maintains its own isolated tab strip, split layout, and active session state.

## Approach
- Fix file indexing freeze: lazily fetch directory listings in Command Palette only when open/active, cache listings per project, and avoid blocking sync crawls.
- Fix tab switch lag: eliminate redundant session file reads and JSON re-parsing on tab switch when the transcript is already resident in memory.
- Prevent RPC hydration storms: cache model catalog and session metadata across tab switches so switching tabs is instant.
- Scoped project workspaces: filter visible tabs and pane layout by `activeProject.id`, persisting per-project active tabs and split pane layouts.
- Seamless project navigation: title bar ProjectPicker and left-rail switchers smoothly transition between project workspaces with zero tab collision.

## Decisions

> [!CHOICE] Empty workspace behavior
> **Question**: When switching to a project that currently has no open tabs, what should be displayed?
> - (x) **Project Hub (WelcomeView)**: show project details, recent catalog sessions, and "Start new session" button [Recommended]
> - ( ) **Auto-create session**: immediately open a blank session tab for that project

<!-- MORE -->

## Changes

| File | Change |
|---|---|
| `apps/desktop/src/renderer/features/commands/CommandPalette.tsx` | `[MODIFY]` Make `listFiles` lazy (only load when palette is open/searching) and cache results by project path |
| `apps/desktop/src/renderer/store/session-store.ts` | `[MODIFY]` Only read session file on tab switch if transcript is not in memory; memoize/skip redundant model hydration |
| `apps/desktop/src/renderer/store/pane-layout-store.ts` | `[MODIFY]` Maintain per-project pane layouts (`layoutsByProject`) so switching projects restores that project's exact split layout |
| `apps/desktop/src/renderer/components/WorkbenchLayout.tsx` | `[MODIFY]` Scope visible tabs and pane sync to `activeProject.id` |
| `apps/desktop/src/renderer/components/TabStrip.tsx` | `[MODIFY]` Render tabs for the active workspace; adapt "New Session" (`+`) to current project |
| `apps/desktop/src/renderer/components/ProjectPicker.tsx` | `[MODIFY]` Switch active workspace to selected project, restoring that project's last active tab or Project Hub |
| `apps/desktop/src/renderer/store/session-store.test.ts` | `[MODIFY]` Add tests for scoped workspace switching, memory-cached tab switching, and project isolation |

## Risks
- Switching between projects with many tabs: state transitions must stay synchronous in React to prevent tab strip flickering; mitigated by caching layouts and transcripts per project in memory.

## Verify
- Open sessions in Project A and Project B; switch between tabs in Project A: verify instantaneous switch with no RPC storm or disk read.
- Switch between Project A and Project B: verify tab bar displays only that project's tabs and restores the last active session.
- Close Command Palette and switch projects: verify no filesystem crawl is triggered in the main process.
- Open Command Palette in a project: verify files load on-demand smoothly.
