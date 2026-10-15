# GitHub Actions module

New optional module `actions` (tier: bonus) that shows the GitHub Actions runs of the active project's repo, like the Actions tab on github.com: running, queued, completed, with history, jobs, and steps. About 10 new files under `modules/actions/`, plus regenerated module indexes. No core changes.

## Approach
- Main half calls the GitHub REST API (`/repos/{owner}/{repo}/actions/...`) with `fetch`. Repo `owner/name` is parsed from `git remote get-url origin` in the project cwd.
- Renderer half is a left panel: filters (status, workflow, branch), run list with live status icons, drill-down into jobs and steps. Click opens the run on github.com.
- Auto-refresh every 5s while any run is queued or in progress, every 60s otherwise. Pauses when panel is closed.
- Token resolved in order: `GITHUB_TOKEN`/`GH_TOKEN` env, token saved in the panel, `git credential fill` for github.com (reuses Git Credential Manager). Without a token, public repos still work, with rate limits.
- Rail badge shows count of running runs, red dot if the latest run on the current branch failed.

## Decisions

> [!CHOICE] Where it lives
> **Question**: How should the Actions view open?
> - (x) **Left panel**: matches Git and Branches, rail icon plus `view.actions` command [Recommended]
> - ( ) **Workbench tab**: more room for logs, but more wiring

> [!CHOICE] Scope of v1
> **Question**: What does v1 include?
> - (x) **Read-only**: list, history, jobs, steps, open in browser [Recommended]
> - ( ) **Read plus actions**: also re-run, cancel, and view logs in-app (needs a token with `actions:write`)

> [!CHOICE] Token storage
> **Question**: Where do we persist a user-entered token?
> - (x) **Module data dir (plain file)**: simple, same trust level as Pi credentials in `~/.pi/agent` [Recommended]
> - ( ) **OS keychain**: safer, but the module SDK does not expose Electron `safeStorage`, so it needs a core change

<!-- MORE -->

## Changes

| File | Purpose |
|---|---|
| `modules/actions/package.json` | `hive` manifest: id `actions`, title "GitHub Actions", tier `bonus`, requires `git`, left panel `actions`, command `view.actions` |
| `src/shared.ts` | `MODULE_ID`, method names, types (`ActionsRun`, `ActionsJob`, `ActionsStep`, `ActionsRepoInfo`), typed client |
| `src/main.ts` | `defineMainModule`; handlers `repo`, `runs`, `jobs`, `workflows`, `setToken`, `clearToken` |
| `src/service/github.ts` | REST client: pagination, `ETag`/`If-None-Match` caching, rate-limit and 401/404 error mapping |
| `src/service/remote.ts` | Parse GitHub remote URLs (https, ssh, enterprise-free) into `owner/repo` |
| `src/service/token.ts` | Token resolution chain and persisted token file |
| `src/renderer.tsx` | `defineRendererModule`; left panel, command, title menu entry |
| `src/ui/ActionsPanel.tsx`, `RunRow.tsx`, `RunDetail.tsx` | UI: filters, run list, jobs and steps tree, empty/error/no-token states |
| `src/ui/actions-store.ts` | zustand store with polling and refresh |
| `src/ui/actions.css` | styles using the same theme variables as the git panel |
| `src/service/*.test.ts`, `src/ui/actions-store.test.ts` | unit tests for remote parsing, run normalisation, token chain, polling |

Then run `npm run gen:modules` so the generated manifest indexes pick it up.

## Risks
> [!WARNING]
> Unauthenticated GitHub API is limited to 60 requests/hour. Polling at 5s would exhaust it in minutes, so without a token polling backs off to 60s and uses ETags (304s do not count against the limit). Private repos need a token.

- Non-GitHub remotes (GitLab etc.) show an "Not a GitHub repo" empty state.
- Module boundaries: may only import `git/shared`, enforced by `npm run check:modules`.

## Verify
- `npm run gen:modules`, `npm run check:modules`, `npm run typecheck`, `npm run lint`, `npm test`.
- Manual: open the Hive repo itself (`AdielMag/Hive`), confirm runs and statuses match github.com.
