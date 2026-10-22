# Project-Level and Total Scoping for Usage & Analytics

Enable filtering usage and cost telemetry per project and viewing workspace-wide totals across all projects in Usage & Analytics.

## Approach
- Add worktree-to-project normalization in `@hive/pi-adapter` so `.hive-worktrees` sessions correctly aggregate under their parent project.
- Extend `insights-store` and `UsageView` with a `focusProject` state alongside `focusSession`, supporting seamless switching between "All Projects" (Total) and individual projects.
- Add an interactive Project selector in the `UsageView` toolbar and make rows in the Projects breakdown table clickable to drill into project-specific metrics, charts, and sessions.
- Expose `useProjects` hook in `ModuleHost` so module tabs can access workspace project metadata, and allow `view.usage` to open with project scope.

<!-- MORE -->

## Changes

| File | Change |
|---|---|
| `packages/pi-adapter/src/usage.ts` | `[MODIFY]` Update `projectLabel` to resolve `.hive-worktrees/*` paths to the project root; export `filterBucketsByProject` |
| `packages/pi-adapter/test/usage.test.ts` | `[MODIFY]` Add tests for worktree project resolution and project bucket filtering |
| `packages/module-sdk/src/renderer.ts` | `[MODIFY]` Expose `useProjects(): Array<{ id: string; name: string; path: string }>` in `ModuleHost.hooks` |
| `apps/desktop/src/renderer/modules/host.tsx` | `[MODIFY]` Implement `useProjects` hook returning `useSessionStore.getState().projects` |
| `modules/analytics/src/ui/insights-store.ts` | `[MODIFY]` Add `focusProject` and `setFocusProject` to Zustand state |
| `modules/analytics/src/ui/UsageView.tsx` | `[MODIFY]` Add project selector in header, filter metrics/charts by `focusProject`, make project table rows clickable, update AI analysis context |
| `modules/analytics/src/renderer.tsx` | `[MODIFY]` Allow `view.usage` to receive `focusProject`, and mark Usage tab global (`projectId: ""`) so it persists across workspaces |
| `modules/analytics/src/ui/insights.css` | `[MODIFY]` Add styles for project dropdown menu, active filter chip, and clickable project table rows |

## Risks
- None. Session parsing remains cached and append-only; filtering is done in-memory on parsed buckets.

## Verify
- `node ./node_modules/vitest/vitest.mjs run --project unit packages/pi-adapter/test/usage.test.ts`
- `node ./node_modules/vitest/vitest.mjs run --project unit modules/analytics/src/ui/insights-analyzer.test.ts`
- Manual verification of project dropdown switching, "All Projects" total view, and clicking project rows in Breakdown table.
