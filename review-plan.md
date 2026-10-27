# Hive deep review: stability, safety and UX fix pass

Five parallel reviews of the main process, the renderer store, UX flows and all 17 modules found about 90 verified issues. This plan fixes the High and Medium ones in 6 workstreams. Each workstream owns its own files, so they run in parallel in isolated worktrees and merge cleanly.

## Approach
- **Data safety first.** Checkpoint "rewind" can delete files that were never snapshotted (videos, files over 8 MB). The plan-previewer server lets any web page read and write local files. File IPC accepts any path.
- **No more stuck states.** A failed send loses the user's text. A Pi crash leaves "Working..." forever. Settings, Git and Limits can freeze in a busy state. Loading spinners never clear.
- **Performance.** Long sessions do O(n^2) work while streaming. The file tree blocks the main process. Limits does a forced refresh after every message. Git polls without `--no-optional-locks`.
- **UX polish.** Confirm before destructive actions, show errors as toasts instead of `console.error`, make the empty-models and missing-`gh` cases recoverable, add keyboard and a11y fixes, and use design tokens instead of hardcoded colors.
- **Then** run typecheck, lint, CSS lint and tests, a per-file Jev risk pass, and a reviewer on the high-risk diffs.

## Decisions

> [!CHOICE] Missing GitHub CLI (`gh`)
> **Question**: Today a missing `gh` blocks the whole app. What should happen?
> - (x) **Make it optional**: add a "Continue without GitHub" button; Actions and AI commit features show an inline hint [Recommended]
> - ( ) **Keep blocking**: only add "Locate gh..." and error handling

> [!CHOICE] Closing a tab with a running agent
> **Question**: Closing a tab silently kills the running Pi session. Change it?
> - (x) **Confirm first**: one dialog when it is running or has an unsent draft, and one for bulk closes [Recommended]
> - ( ) **Keep as is**: close immediately

> [!CHOICE] bash-guard strictness
> **Question**: The guard misses `rm -r <dir>`, `git restore`, reading `~/.pi/agent/auth.json` and `.npmrc`, and a slow regex can hang it. How far should the fix go?
> - (x) **Tighten**: cap input length (perf), add secret paths and git discard commands, ask on recursive `rm` outside build dirs [Recommended]
> - ( ) **Perf only**: fix the regex hang and leave the rules alone

<!-- MORE -->

## Workstreams (file ownership is exclusive)

### W1: Data safety and security (main process)
| File | Change |
|---|---|
| `apps/desktop/src/main/services/checkpoints/shadow-repo.ts` | `[MODIFY]` `planRestore` deletes only paths known to the shadow index or snapshot tree, never skipped or untracked-at-snapshot files; add a git timeout |
| `apps/desktop/src/main/services/checkpoints/service.ts` | `[MODIFY]` persist skipped files, enforce `maxProjectStorageBytes` by pruning old turns |
| `apps/desktop/src/main/services/session-manager.ts` | `[MODIFY]` `onTurnSettled` uses the Pi session id (not `sess_N`), `.catch` on the void checkpoint calls, block a double start on the same `sessionPath`, default RPC timeouts |
| `apps/desktop/src/main/bridge-server/index.ts` | `[MODIFY]` per-socket auth and line splitter; reset on close |
| `apps/desktop/src/main/ipc/workspace.ts`, `ipc/catalog.ts` | `[MODIFY]` path containment: project roots, worktrees, linked folders, Pi sessions dir (realpath) |
| `apps/desktop/src/main/services/models.ts` | `[MODIFY]` `saveEnabledModels` uses `readSettingsForWrite` (no settings wipe) |
| `apps/desktop/src/main/window.ts` (or the browser session setup) | `[MODIFY]` deny-by-default permission handler on `persist:hive-browser` |
| `modules/plan-previewer/src/service.ts`, `bin/plan-previewer.js` | `[MODIFY]` reject browser `Origin`, drop `ACAO:*`, require JSON, keep unconsumed feedback across re-runs, error out when Hive is unreachable, require `filePath`, `fs.watch` error handler and debounce |

### W2: Pi process lifecycle and main-process perf
| File | Change |
|---|---|
| `packages/pi-adapter/src/rpc-connection.ts` | `[MODIFY]` default send timeout, `close` instead of `exit` (stderr drained), null-record guard, drain also listens for close, log protocol errors |
| `apps/desktop/src/main/index.ts` | `[MODIFY]` on quit, stop with a short grace and await the tree kill |
| `apps/desktop/src/main/services/files.ts` | `[MODIFY]` async `listDirectory`, larger ignore list, entry cap, lazy deeper levels; clean up temp attachments |
| `apps/desktop/src/main/services/updater.ts`, `pi-updater.ts` | `[MODIFY]` fetch and npm timeouts |
| `apps/desktop/src/main/modules/host.ts` | `[MODIFY]` fix cycle-id parsing; one hung module no longer blocks all IPC |

### W3: Renderer store and streaming perf
| File | Change |
|---|---|
| `renderer/store/session-store.ts` | `[MODIFY]` restore the draft and show an error on a failed send, steer or follow-up; re-queue held messages; stop orphan Pi when the tab closed during start; clear `running`/`streaming` on crash; abort and rewind append to the draft; capture mode before the await; clean per-key maps on close; `stopSubagent` and `deleteSessionFile` return results |
| `renderer/components/ContextBreakdownView.tsx` | `[MODIFY]` cheap token numbers; lazy breakdown keyed on revision; compaction error toast |
| `renderer/components/Transcript.tsx`, `StatusBar.tsx` | `[MODIFY]` shared memoized timeline; append only the streaming item |
| `ModePicker.tsx`, `ThinkingPicker.tsx`, `features/commands/CommandPalette.tsx` | `[MODIFY]` narrow store selectors |

### W4: UX flows and UI polish (components only)
| File | Change |
|---|---|
| `SessionsPanel.tsx` | `[MODIFY]` delete confirm and toast; keyboard-focusable rows |
| `TabStrip.tsx`, `WorkbenchPane.tsx` | `[MODIFY]` confirm close when running or drafted; tabs focusable with arrow keys |
| `App.tsx` | `[MODIFY]` `gh` optional, error handling on Check and Locate, copy-button labels |
| `SettingsModal.tsx`, `KeyboardSettings.tsx` | `[MODIFY]` try/finally on account actions, Retry state, `askChoice` instead of `confirm()`, reset recording on unmount |
| `Composer.tsx` | `[MODIFY]` IME guard, Send disabled during reload, attachment error toasts, empty-catalog link to Settings, Disable All semantics, inline model dropdown keyboard support |
| `ModelsSettingsContent.tsx`, `MergeConflictDialog.tsx`, `WorktreeBar.tsx`, `ModulesSettings.tsx`, `ProjectSettingsModal.tsx`, `SubagentViewer.tsx`, `WelcomeView.tsx`, `SessionErrorBanner.tsx` | `[MODIFY]` items 6-22 from the UX review, tokens instead of hardcoded colors |
| `styles/mention-textarea.css` | `[MODIFY]` CSS-motion lint fix |

### W5: Git, files, terminal, branches and diff modules
- git: fix stuck `loading` on a superseded refresh, surface real errors (not "not a repo"), `runGit` throws stderr or stdout, commit-message timeout and stdin error handler, `--no-optional-locks`, `StageButton` uses the tab cwd, untracked-file diff via `--no-index`.
- diff-viewer: Ask Pi calls `newSession` before `setPrompt`; cap the embedded diff size.
- files: toasts for errors, shell-quoted "Run in Terminal", refresh on focus.
- terminal: restart shows the error and keeps the tab; `.catch` on writes.
- branches: set the manual branch only after a successful checkout; add a merge-abort action.

### W6: Other modules
- actions: `fetchImpl` when a token exists, `gh` spawn timeout, login disposer, try/catch in the store.
- limits: throttle event-driven refresh to 60s and non-forced; render error and retry; mark cached values.
- analytics: lazy scan on first open; "heuristic only" badge when AI insights fail; `insights.css` lint fix.
- library: no silent `rm -rf` fallback; directory-aware confirm copy; load generation guard.
- marketplace: show network errors; install copy says "Staged in composer"; ignore stale responses.
- tools: read `mcp-cache.json`.
- browser: block `file:`, `chrome:` and `edge:` in the omnibox; crashed-guest view.
- bash-guard: per the decision above.
- jev: async session parse; cache insights.

## Risks
- Path containment (W1) can block a legitimate path. It must include worktrees, linked folders and the sessions dir.
- Timeline memo (W3) can cause transcript regressions. Covered by the existing `ToolBatchGroup` and session-store tests plus manual streaming.

## Verify
- `node node_modules/typescript/bin/tsc` typecheck chain, eslint, `npm run lint:css`, vitest unit (the worktree has no `node_modules/.bin`, so call the binaries directly).
- Jev risk score per changed file; reviewer on any rated high.
- Manual: rewind a turn with a large binary in the project; send while Pi is dead; close a tab mid-run; stream a long session.
