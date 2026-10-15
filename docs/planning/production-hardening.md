# Hive roadmap: checkpoints, then production hardening

Hygiene batch is done (see Phase 0). Next comes per-turn file checkpoints, your top pick. After that, a hardening pass to bring Hive to daily-driver production quality. Feature work comes last. Each phase ships on its own.

## Approach
- **Phase 1, checkpoints.** A shadow git repo per project snapshots the files before every prompt. Undo turn, Edit/Retry can also restore files, and you can see per-turn diffs. Full plan: `docs/planning/checkpoints.md`.
- **Phase 2, hardening.** An Electron e2e smoke suite in CI, local crash logging, lint ratchet to zero `any`, splitting `session-store.ts`, and tests for the untested packages.
- **Phase 3, features.** Hunk staging with review-then-accept, worktree sessions, budget alerts, session search.
- Every phase ends green: typecheck, lint (0 errors), unit tests, the e2e smoke test, and a reviewer pass.

## Decisions

> [!CHOICE] After checkpoints
> **Question**: What comes right after checkpoints ship?
> - (x) **Hardening first**: e2e plus crash logs catch regressions before more features land [Recommended]
> - ( ) **Interleave**: one hardening item per feature
> - ( ) **Features first**: hunk staging and worktrees next, hardening later

> [!CHOICE] Code signing
> **Question**: Sign the Windows/macOS binaries?
> - (x) **Not now**: personal use; SHA-256 verified updates cover tampering [Recommended]
> - ( ) **Yes**: about $100–400/yr for certificates, removes SmartScreen/Gatekeeper prompts

<!-- MORE -->

## Phase 0: hygiene (done, uncommitted)
| File | Change |
|---|---|
| `apps/desktop/src/main/services/updater.ts` | `[MODIFY]` Accepts only this repo's release URLs. Verifies the installer's SHA-256 against `SHA256SUMS.txt` before running it; on a mismatch it deletes the file. No checksum: falls back to the browser |
| `apps/desktop/src/main/services/update-check.ts` | `[MODIFY]` Adds `isTrustedDownloadUrl`, `isReleasePageUrl`, `checksumLocation`, `expectedSha256` (+ tests) |
| `.github/workflows/release.yml` | `[MODIFY]` Publishes `SHA256SUMS.txt`. Verify now runs on ubuntu+windows and adds lint and `check:modules` |
| `.github/workflows/ci.yml` | `[MODIFY]` Adds `check:modules` |
| `apps/desktop/src/main/window.ts` | `[MODIFY]` `sandbox: true` (smoke-tested: preload works, UI renders) |
| `apps/desktop/src/main/safe-url.ts` | `[NEW]` `isSafeExternalUrl`, also used by `auth.ts` `openExternal` |
| `eslint.config.js` | `[MODIFY]` `@eslint/js` + `typescript-eslint` recommended, `exhaustive-deps` as a warning, `no-explicit-any` as a warning (ratchet) |
| misc | `[MODIFY]` 13 lint fixes. Untracked `*.tsbuildinfo` and `test-capture.png`. Moved 5 root plans into `docs/planning/` |

## Phase 1: checkpoints
See `docs/planning/checkpoints.md`.

## Phase 2: hardening
| Item | Detail |
|---|---|
| E2E smoke | Playwright `_electron` with `packages/test-provider` and a temp `HIVE_USER_DATA`. Flow: open project, send prompt, see the streamed reply, Retry, then restore a checkpoint. Runs in CI on windows+ubuntu (xvfb) |
| Crash logging | `process.on("uncaughtException"/"unhandledRejection")` in main, `render-process-gone`, a rotating log in userData, and a "Copy diagnostics" button in Settings |
| Lint ratchet | Clear the 207 `any`s. Hotspots: `session-store.ts`, `modules/actions/src/github.ts`, `modules/plan-previewer/src/service.ts`. Then set `no-explicit-any` to `error`. Review the 21 `exhaustive-deps` warnings one by one (some are deliberate cache busters) |
| Split `session-store.ts` | 2.4k lines become zustand slices: tabs, transcript, composer/prompt, rewind, reload. Behavior stays identical; the existing tests must pass unchanged |
| Missing tests | `packages/protocol`, `packages/module-sdk`, modules `diff-viewer`, `branches`, `theme-studio` |
| Lean-core finish | Move the file/diff tabs out of core into `modules/diff-viewer`, as already planned |
| CI | macOS in the PR matrix, nightly only (cost) |

## Phase 3: features (ranked)
1. **Hunk staging + review-then-accept diffs.** Uses the checkpoint diffs; per-hunk Keep/Revert.
2. **Worktree sessions.** Parallel agents, one branch each, merged back from the Branches module.
3. **Budget alerts.** A limits/analytics threshold triggers a notification or pauses the session.
4. **Session search.** Full text across every local session file.
5. **Composer model router.** Jev v2, already planned.

## Risks
- `sandbox: true` was smoke-tested only at launch. Drag-drop and attachments still need a manual check (`webUtils` is supported in sandboxed preloads).
- An old release without `SHA256SUMS.txt` makes the updater fall back to the browser (by design).

## Verify
- `npm run typecheck && npm run check:modules && npm run lint && npm test && npm run build` passes today: 0 lint errors, 1227 tests.
