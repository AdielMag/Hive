# Redesign the GitHub Actions panel UI

The panel is three dropdowns plus a flat text list. Replace it with a visual, scannable layout: a run-history strip, filter chips, status-striped run cards grouped by day, and a job pipeline with duration bars. UI only; the store, main process and API contract stay as they are. About 8 files, all under `modules/actions/src/ui/`.

## Approach
- **Header summary**: repo name, live counts (running, failed, passed) and a history strip of the last ~24 runs as small colored bars. Clicking a bar jumps to that run.
- **Chips instead of dropdowns**: status becomes a segmented control (All, Running, Failed, Passed). Branch is a toggle chip. Workflow is a searchable popover menu with the workflow name on the chip.
- **Run cards**: a colored status stripe, a status disc, a bold title, and chips for workflow and number, branch, event, and actor (initial avatar). Running cards get a shimmering progress line. Rows are grouped under Today, Yesterday and date headings. Hover reveals icon actions (re-run, cancel, open).
- **Run detail**: jobs shown as a vertical pipeline of nodes with a bar per job scaled to the longest job, steps collapsed under each job, and failed steps highlighted.
- **States**: designed empty, error, loading (skeleton cards) and token states with an icon and a clear call to action. Dispatch becomes a slide-down card.
- Keep the existing theme variables (`--accent-base`, `--success`, `--danger`, `--warning`, `--bg-card`) so it matches the Git panel. Respect `prefers-reduced-motion` and keep focus rings visible.

## Decisions

> [!CHOICE] Scope of the redesign
> **Question**: How far should this go?
> - (x) **UI only**: restyle and restructure the renderer, no data changes [Recommended]
> - ( ) **UI plus logs**: also add in-app step logs, which needs a new API call and a token scope

> [!CHOICE] Avatars
> **Question**: How should actors be shown?
> - (x) **Initial discs**: a colored letter disc derived from the username, with no network requests [Recommended]
> - ( ) **GitHub avatars**: load `github.com/<user>.png`, which may be blocked by the app's CSP

<!-- MORE -->

## Changes

| File | Change |
|---|---|
| `src/ui/ActionsPanel.tsx` | `[MODIFY]` slim down to layout and composition; use store selectors instead of the whole store |
| `src/ui/Header.tsx` | `[NEW]` repo title, stat pills, tool buttons |
| `src/ui/HistoryStrip.tsx` | `[NEW]` run-history bars |
| `src/ui/FilterBar.tsx` | `[NEW]` status segments, branch chip, workflow popover |
| `src/ui/RunCard.tsx` | `[NEW]` run card and hover actions |
| `src/ui/RunDetail.tsx` | `[NEW]` job pipeline, duration bars, steps |
| `src/ui/DispatchForm.tsx`, `TokenCard.tsx`, `EmptyState.tsx` | `[NEW]` extracted and restyled |
| `src/ui/StatusIcon.tsx` | `[MODIFY]` filled disc variant |
| `src/ui/actions.css` | `[MODIFY]` rewrite styles |
| `src/ui/group-runs.ts` | `[NEW]` pure day grouping, with a unit test |

## Risks
- The list keeps "Load more" paging. Grouping must not reshuffle rows during polling, so groups are derived from `createdAt` only.
- The store keeps the list visible while filters change instead of blanking it (small `setFilters` change).

## Verify
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run check:modules`
- Manual: open the panel on a repo with runs; check a running, a failed and a queued run, filters, expand, dispatch, and narrow and wide panel widths.
