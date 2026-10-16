# Session Worktree Git Integration & Top Bar Redesign

Sync Git Stages and Git Branches windows to the active session's worktree unless manually overridden, add an LLM-powered Auto Commit button for staged changes in the session top bar, remove Open Folder, and modernize the top bar visual design.

## Approach
- Expose the active session's `SessionWorktree` on `ActiveSessionContext` from `host.hooks.useActiveSession()`.
- Update `GitPanel` and `BranchesPanel` to automatically use `worktree.worktreePath` as their working directory when viewing a session with a worktree, reverting to `project.path` if no session tab is active or if the user manually selects a branch from the branch dropdown.
- In `WorktreeBar`, remove the "Open folder" button and add an "Auto commit" button that generates a commit message with the configured `gitCommit` LLM and commits all staged changes in the worktree.
- Overhaul `WorktreeBar` styling with an elevated modern pill layout: rounded branch chips, distinct status badges for staged/uncommitted/ahead changes, and sleek action buttons.

## Decisions

> [!CHOICE] Auto Commit Scope
> **Question**: If no changes are staged when clicking Auto Commit in the worktree top bar, should it stage all changes first or require staging?
> - (x) **Require staged changes**: only commit files explicitly staged, keeping button disabled when 0 staged [Recommended]
> - ( ) **Auto-stage all**: stage all modified/untracked changes if none are staged before generating commit

<!-- MORE -->

## Changes

| File | Change |
|---|---|
| `packages/module-sdk/src/renderer.ts` | `[MODIFY]` Add `worktree?: SessionWorktree` to `ActiveSessionContext` interface |
| `apps/desktop/src/renderer/modules/host.tsx` | `[MODIFY]` Populate `worktree` in `useActiveSession()` hook from `useSessionWorktree(activeTabId)` |
| `modules/git/src/ui/GitPanel.tsx` | `[MODIFY]` Use `worktree.worktreePath` as `effectiveCwd` when available; track `manualBranch` from dropdown checkout and reset on tab/worktree switch |
| `modules/branches/src/ui/BranchesPanel.tsx` | `[MODIFY]` Use `worktree.worktreePath` as `effectiveCwd` when available; track manual checkout and reset on tab/worktree switch |
| `apps/desktop/src/renderer/components/WorktreeBar.tsx` | `[MODIFY]` Remove Open Folder button, add LLM Auto Commit button for staged changes, poll git staged files, improve notices |
| `apps/desktop/src/renderer/styles/worktree.css` | `[MODIFY]` Modernize WorktreeBar design: 36px height, pill badges for branch & base, styled status chips (ahead, staged, dirty), refined action buttons |

## Risks
- Switching branches in the main tree while in a worktree: handled safely because git worktree maintains its own independent HEAD.
- Git module IPC availability in WorktreeBar: `window.studio.modules.invoke("git", ...)` is already established and handles `generateCommitMessage`, `status`, and `commit`.

## Verify
- `npm run typecheck -w @hive/desktop` and `npx tsc -p modules`
- `npm test`
- Manual checks:
  1. Open a session running in a worktree -> Git stages and Git branches show that worktree's branch and uncommitted changes.
  2. Switch to a session in main tree or close tab -> Git stages and branches show main project changes.
  3. Manually select branch in GitPanel dropdown -> views that branch; switching session tab resets back to that session's worktree.
  4. Worktree top bar: Open Folder button is gone; branch and status badges look polished.
  5. Stage files in worktree -> "Auto commit" button becomes enabled -> clicking it generates AI commit message and commits staged changes.
