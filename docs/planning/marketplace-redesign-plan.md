# Marketplace redesign: richer entries, faster, nicer view

The marketplace module shows bare name, version and one-line description, and it refetches on every tab switch. This plan adds real metadata to each entry, caches and debounces search, and turns the list into a card grid. Medium size: 5 files in `modules/marketplace/`, no new dependencies.

## Approach
- **More data per entry**: keywords, last-updated time, npm quality/popularity score, maintainer count, repository link, license when present, MCP transports and status, Claude plugin category.
- **Faster**: in-memory cache per source and query (5 min TTL), in-flight request dedupe, Claude catalog fetched once and filtered locally, search debounced at 300 ms with stale responses dropped, cards memoized and rendered 24 at a time with "Show more".
- **Nicer view**: responsive card grid, source-kind badge, score bar, keyword chips, relative "updated 3d ago", skeleton loader, clear empty and error states, short "Staged" state on install instead of a long sentence.
- **Install flow unchanged**: still stages `/install <source>` in the composer.

## Decisions

> [!CHOICE] Popularity signal
> **Question**: Where do the popularity numbers come from for Pi packages?
> - (x) **npm search score**: quality and popularity already in the search response, no extra requests [Recommended]
> - ( ) **Weekly downloads**: one extra request per package from api.npmjs.org, slower first paint, scoped packages need one call each

> [!CHOICE] Card layout
> **Question**: How dense should the list be in the settings panel?
> - (x) **Responsive grid**: 1 to 2 columns depending on panel width, description clamped to 3 lines [Recommended]
> - ( ) **Compact rows**: one entry per row with metadata columns, more entries visible at once

<!-- MORE -->

## Changes
| File | Change |
|---|---|
| `modules/marketplace/src/shared.ts` | `[MODIFY]` add optional `keywords`, `updatedAt`, `license`, `score`, `maintainers`, `repository`, `category`, `transports`, `status` to `MarketplacePackage` |
| `modules/marketplace/src/service.ts` | `[MODIFY]` map the new fields for npm, Claude and MCP; add TTL cache and in-flight dedupe; fetch Claude catalog once |
| `modules/marketplace/src/ui/MarketplacePanel.tsx` | `[MODIFY]` debounced search, card grid, memoized `MarketplaceCard`, incremental rendering, skeleton and empty states, install state |
| `modules/marketplace/src/service.test.ts` | `[MODIFY]` tests for field mapping, cache hit, in-flight dedupe, Claude local filter |
| `modules/marketplace/src/renderer.tsx` | no change |

Data mapping:
- **Pi (npm search)**: `score.final`, `score.detail.quality`, `score.detail.maintenance`, `date`, `keywords`, `publisher`, `maintainers.length`, `links.repository`.
- **Claude plugins**: `category`, `keywords`, `tags`, `homepage`, `author`.
- **MCP registry**: `_meta` updated time, `status`, `remotes[].type` and `packages[].registryType` as transports.

Fields a source does not provide are hidden, not shown as "unknown".

## Risks
- Cached results can be up to 5 min old. A manual Retry button bypasses the cache.
- npm search `score` is npm's own ranking, not a download count. The label says "Score", not "Downloads".

## Verify
- `npm test` in `modules/marketplace` (new cache and mapping tests)
- Typecheck and lint for the module
- Manual: open Settings > Marketplace, switch the three tabs twice (second switch should be instant), type a query and confirm one request after 300 ms, check the cards show keywords and "updated" text, install a card and confirm the composer gets `/install npm:...`, turn off network and confirm the error state with Retry.
