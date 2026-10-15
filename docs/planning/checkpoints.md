# Per-turn file checkpoints

Every user turn gets a file checkpoint in a shadow git repo, enabling "N files changed" diffs, per-turn undo, and restoring files alongside chat rewind. Never modifies the user's real `.git` or index.

## Approach
- **Shadow git repo per project** in `<userData>/hive/checkpoints/<hash>.git`. `GIT_WORK_TREE=cwd`, `-c core.autocrlf=false`, `.gitignore` respected, built-in excludes for `node_modules`, `dist`, `.venv`.
- **Zero latency on prompt send:** snapshot triggers when user sends a prompt, runs concurrently with model token generation. A lightweight `tool_call` gate in the bridge waits if the snapshot is still in-flight when the first tool fires.
- **Per-turn UI in Transcript:** "N files changed" chip with interactive diff viewer, "Undo turn" button, and Edit/Retry prompt confirmation asking "Also restore files to before this turn?".
- **Safety first:** every restore creates an automatic safety snapshot first so restore is itself undoable.

## Decisions

> [!CHOICE] Large binary handling
> **Question**: How should shadow checkpoints handle large binary files (>8MB or media extensions)?
> - (x) **Skip binaries & mark partial**: Don't snapshot files >8MB or known binaries (videos, zip, weights); mark turn "partial snapshot" [Recommended]
> - ( ) **Snapshot everything**: Snapshot all files regardless of size/type (uses more disk in shadow repo)

> [!CHOICE] Edit/Retry file restore default
> **Question**: When clicking Edit or Retry on an earlier message, how should file restoration behave?
> - (x) **Prompt each time**: Dialog asks "[Restore files & chat] vs [Rewind chat only]" [Recommended]
> - ( ) **Always restore files**: Automatically restore files without extra modal prompt
> - ( ) **Chat-only by default**: Rewind chat only, requiring explicit toggle to revert files

<!-- MORE -->

## Architecture & Implementation Steps

### 1. Shadow Repo Engine (`apps/desktop/src/main/services/checkpoints/shadow-repo.ts`)
- Manages isolated shadow git bare repo per workspace cwd.
- Methods: `open()`, `snapshot()`, `changedFiles(treeA, treeB)`, `diffText()`, `restore(tree, paths)`, `safetySnapshot()`.
- Windows safe: `core.longpaths=true`, `core.quotepath=false`, `core.autocrlf=false`.
- Excludes: copies `.git/info/exclude` + project `.gitignore` + global excludes (`node_modules`, `dist`, `.venv`, `.git`).

### 2. Checkpoint Service & Lifecycle (`apps/desktop/src/main/services/checkpoints/service.ts`)
- Project-level async mutex to serialize snapshots on concurrent session tabs.
- `onPromptSent(sessionId, userTs)` -> queues "before" snapshot.
- `onTurnSettled(sessionId, userTs)` -> captures "after" snapshot, calculates changed file set.
- `bindEntryId(sessionId, userTs, entryId)` -> maps runtime timestamp to persistent session entry leaf.
- Automatic disk GC: max 1GB per project, purges checkpoints older than 30 days.

### 3. Studio Bridge Wiring (`packages/protocol` & `studio-bridge.ts`)
- Protocol: `checkpoint_request`, `checkpoint_done`, `checkpoint_bind` IPC / bridge messages.
- Bridge `message_end` sends prompt start event.
- Bridge `tool_call` handler blocks on pending snapshot promise (timeout 15s) so filesystem edits by tools/bash are guaranteed captured in the "after" diff.

### 4. IPC & Preload APIs (`packages/protocol/src/ipc.ts`, `apps/desktop/src/main/ipc/checkpoints.ts`)
- Channels:
  - `checkpoints:list(sessionId)` -> list turn snapshots
  - `checkpoints:diff(turnId, filePath?)` -> diff contents
  - `checkpoints:restore(sessionId, turnId, mode: "turn" | "rewind")` -> execute restore with safety snapshot
- Expose via `window.studio.checkpoints.*`.

### 5. Transcript UI & Rewind Integration
- `Transcript.tsx`: render "N files changed" chip under completed assistant turns.
- Clicking opens diff viewer (`openModuleTab({ kind: "diff", ... })`).
- "Undo turn" button with conflict warning if user edited files since turn settled.
- `session-store.ts`: update `rewindToUserMessage` to accept `{ restoreFiles?: boolean }`.

## Changes
| File | Change |
|---|---|
| `apps/desktop/src/main/services/checkpoints/shadow-repo.ts` | `[NEW]` Low-level shadow git operations |
| `apps/desktop/src/main/services/checkpoints/shadow-repo.test.ts` | `[NEW]` Vitest tests with real git & temp directories |
| `apps/desktop/src/main/services/checkpoints/service.ts` | `[NEW]` Checkpoint lifecycle, lock & index management |
| `apps/desktop/src/main/services/checkpoints/service.test.ts` | `[NEW]` Unit tests for turn snapshots, GC, safety checkpoints |
| `packages/protocol/src/bridge.ts` | `[MODIFY]` Add checkpoint bridge message schemas |
| `packages/protocol/src/ipc.ts` | `[MODIFY]` Add IPC channel definitions & StudioApi interfaces |
| `apps/desktop/resources/bridge/studio-bridge.ts` | `[MODIFY]` Tool-call synchronization gate & event emitting |
| `apps/desktop/src/main/ipc/checkpoints.ts` | `[NEW]` IPC handlers |
| `apps/desktop/src/main/ipc/index.ts` | `[MODIFY]` Register checkpoints IPC handlers |
| `apps/desktop/src/preload/index.ts` | `[MODIFY]` Expose checkpoint APIs to renderer |
| `apps/desktop/src/renderer/store/session-store.ts` | `[MODIFY]` Wire file restoration into `rewindToUserMessage` |
| `apps/desktop/src/renderer/components/Transcript.tsx` | `[MODIFY]` Add turn file diff chip & Undo button |

## Risks
- **Very large untracked folders:** `add -A` on a repo with huge data directories could stall git. Mitigated by `10,000` file cap and 8MB per-file cutoff.
- **Windows file locks:** Running dev servers (e.g. `vite`) might lock generated output files during restore. Mitigated by per-file try/catch with clear error reporting and graceful partial restore.

## Verify
- `npm run test`: unit test suite verifying git creation, tree generation, diffing, and restoration in temporary directories.
- Manual verification: start a prompt that edits files via bash and edit tool -> observe diff chip -> click "Undo turn" -> confirm file state restored to pre-prompt disk state.
