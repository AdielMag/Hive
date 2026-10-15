# Per-session git worktrees

Each Hive session currently runs Pi with `cwd = project root`, so parallel sessions edit the same tree and misattribute each other's changes. Give every session its own git worktree and branch, and show worktree, branch and base branch in the sidebar and the session view. Roughly 10 files, in two stages: backend first, then UI.

## Approach
- `MainSessionManager.startSession` creates `git worktree add <path> -b hive/<slug> <base>` and passes that path as Pi's `cwd`.
- Worktree info (`worktreePath`, `branch`, `baseBranch`, `baseCommit`) is persisted per session in `SessionMetaEntry` and exposed through `SessionCatalogItem`.
- Sidebar row gets a `branch <- base` chip; `SessionView` gets a thin header with branch, base, ahead/behind and dirty count.
- Checkpoints and title generation use the session's effective cwd (the worktree) instead of `projectPath`.
- Non-git projects, or a failed `git worktree add`, fall back to today's behaviour (project root, no chip).

## Decisions

> [!CHOICE] Worktree location
> **Question**: Where do session worktrees live?
> - (x) **Inside repo**: `<root>/.hive-worktrees/<slug>`, gitignored; maps back to the project by path prefix [Recommended]
> - ( ) **Outside repo**: sibling dir; keeps the repo clean but needs `projectId` stored for catalog lookup

> [!CHOICE] Default behaviour
> **Question**: Is a worktree created for every new session?
> - (x) **On by default**: "Work in main tree" toggle in the new-session UI opts out [Recommended]
> - ( ) **Opt-in**: toggle to create a worktree; collisions stay possible by default

> [!CHOICE] Base branch
> **Question**: Which branch does a new worktree fork from?
> - (x) **Current HEAD of main tree**: no extra UI; user can override in the new-session popover [Recommended]
> - ( ) **Always the default branch**: predictable, but ignores the branch you are on

> [!WARNING]
> Checkpoints (`services/checkpoints`), `generateSessionTitle` and `ipc/checkpoints.ts` key off `projectPath`. Missing one means it snapshots the wrong tree.

<!-- MORE -->

## Changes
| File | Change |
|---|---|
| `apps/desktop/src/main/services/worktrees.ts` | `[NEW]` `createWorktree`, `removeWorktree`, `worktreeStatus` (ahead/behind/dirty), `listOrphans`, via `execFile git` |
| `packages/protocol/src/projects.ts` | `[MODIFY]` add `SessionWorktree` type; add optional `worktree` to `SessionMetaEntry` and `SessionCatalogItem` |
| `packages/protocol/src/ipc.ts` | `[MODIFY]` `StartSessionRequest.useWorktree?`, `baseBranch?`; `StartSessionResult.worktree?`; new channels `worktreeStatus`, `worktreeRemove`, `worktreeMerge` |
| `apps/desktop/src/main/session-manager.ts` | `[MODIFY]` create worktree in `startSession` (`:50-77`), pass as `cwd`, store on `ActiveSession` |
| `apps/desktop/src/main/ipc/sessions.ts` | `[MODIFY]` persist worktree meta; whitelist in `sanitizeSessionMeta` (`:64-72`); new worktree IPC handlers |
| `apps/desktop/src/main/catalog.ts` | `[MODIFY]` map worktree cwd back to the project (`:48-67`), attach worktree meta |
| `apps/desktop/src/main/services/checkpoints/*`, `ipc/checkpoints.ts` | `[MODIFY]` use effective cwd |
| `apps/desktop/src/preload/index.ts` | `[MODIFY]` expose new IPC |
| `apps/desktop/src/renderer/store/session-store.ts` | `[MODIFY]` pass `useWorktree`/`baseBranch` (`:1247`), keep worktree on tab and optimistic catalog item (`:1810-1822`) |
| `apps/desktop/src/renderer/components/Sidebar.tsx` | `[MODIFY]` branch chip in `renderSession` (`:205-270`) and tooltip |
| `apps/desktop/src/renderer/components/WorktreeBar.tsx` | `[NEW]` header: branch <- base, ahead/behind, dirty, open folder, Merge / Discard |
| `apps/desktop/src/renderer/components/SessionView.tsx` | `[MODIFY]` render `WorktreeBar` above `Transcript` |
| `apps/desktop/src/renderer/components/TabStrip.tsx` | `[MODIFY]` branch in tab tooltip |
| `.gitignore` handling | `[MODIFY]` add `.hive-worktrees/` to `.git/info/exclude` on first use (no tracked-file edit) |

## Stages
1. **Backend:** protocol types, `worktrees.ts`, `startSession`, meta persistence, catalog mapping, checkpoint cwd. Unit tests against a temp git repo.
2. **UI:** sidebar chip, `WorktreeBar`, new-session toggle and base picker, tab tooltip.
3. **Lifecycle:** Merge, Discard, remove-on-archive prompt, orphan cleanup at startup.

## Risks
- Per-worktree `node_modules`: link or install; start with a symlink to the root `node_modules`, make it configurable.
- Slug collisions: slug = sanitized title + short session id; `git worktree add` failure falls back to the project root and shows a toast.
- Dirty main tree: new worktree forks from the commit, not from uncommitted changes. Show a note in the new-session UI when the main tree is dirty.
- Windows paths: long paths under `.hive-worktrees`; keep slugs short.

## Verify
- `npm test` (new `worktrees.test.ts` against a temp repo: create, status, remove, orphan listing)
- `npm run typecheck`
- Manual: start two sessions on one project, edit the same filename in each, confirm separate trees, the branch chip in both the sidebar and the header, and that archive prompts for cleanup.
