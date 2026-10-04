# Milestone 4 handoff (TL;DR)

Parent plan: `docs/planning/lean-core-modules.md` (§5 table, §6 coupling, §7 M4). M1–M3 are merged to `main` and pushed (v0.13.x line). **No M4 code has been written yet.** This file is research only.

## State
- Branch `feat/modules-m4`, created from `main` @ `b6bffe1`. Work here, merge to `main` with `--no-ff` when green, then **delete the branch (local and remote)**. The user asked for this.
- Pushing to `main` triggers `release.yml`. Every `feat`/`fix` push cuts a release and installed apps auto-update. Tell the user before pushing.
- Not confirmed: the Release workflow result for `b6bffe1`. Check with `curl "https://api.github.com/repos/AdielMag/Hive/actions/runs?per_page=3&branch=main"`. There is no `gh` CLI.
- Other sessions edit this checkout (they own `modules/plan-previewer`, `modules/bash-guard`, the pane/split layout and the subagent viewer). Before every commit run `git status`. Stage explicit paths only.

## Scope
Extract four modules, in this order (each depends on the previous):

| id | tier | requires | contributes |
|---|---|---|---|
| `diff-viewer` | recommended | – | tab kinds `diff`, `file` (`DiffViewerTab`, `FileViewerTab`) |
| `files` | recommended | diff-viewer | left panel `files` (`Mod+Shift+E`), command `view.files`, `file.open` |
| `git` | recommended | diff-viewer | left panel `git` (`Mod+Shift+G`), AI feature `gitCommit`, sync-badge, titleMenu "Source Control" |
| `branches` | bonus | git | left panel `branches` |

Also: first-run picker check, just-in-time install toasts, and the interim-leakage fixes at the bottom. Upgrade migration already exists (`main/modules/host.ts` ~L59-78: existing state → all modules on, no picker).

## Coupling map (verified by reading code)
Paths below are under `apps/desktop/src/` unless noted.

**Tab kinds `file` / `diff` are core today**
- `packages/protocol/src/projects.ts:66` `CORE_TAB_KINDS = ["session","file","diff","subagent"]`. `TabItem` has `fileContent`, `fileLanguage`, `diffStaged`, `diffContent` (L89-94). Move the kinds to the module and store the payload in `tab.data`. Remove `file` and `diff` from `CoreTabKind`.
- `renderer/components/WorkbenchPane.tsx:15-16,82-85` lazy-renders the two viewers. Delete these branches. The generic `ModuleTabView` branch below them covers module kinds.
- `renderer/components/TabStrip.tsx:425-428` has hard-coded icons. Move them to the `tabKinds` contribution `icon`.
- `renderer/store/session-store.ts`: `openFileTab` (~L1165-1205), `openDiffTab` (~L1210-1250) and the `switchTab` special case (~L1348) all go. Callers use `host.tabs.open({kind, filePath, data, reuse})`.
- Persisted tabs from old versions carry `kind:"file"|"diff"` plus the old fields. Check how tabs are persisted and that they still open, via a `data` fallback or by dropping stale content and refetching.
- Callers of `openFileTab`: `FilesPanel.tsx:32` and `renderer/features/commands/CommandPalette.tsx:233` (quick-open). Make the palette call a `file.open` command, `COMMANDS_BY_ID.get("file.open")?.run({path, projectId, name})`, owned by `diff-viewer`. Hide the palette's Files section when the command is absent.

**Viewers depend on core-only APIs. Add generic SDK hooks, not feature code.**
- `FileViewerTab` uses `HighlightedLines`, `useHighlight`, `languages.ts`, `Markdown` and `useAppearance().editor.wrapCode`. `host.ui.Markdown`, `host.ui.CodeBlock` and `host.hooks.useTheme()` exist. Still missing is a highlighted-source view with line numbers, so add `host.ui.HighlightedSource` (or extend `CodeBlock`).
- The viewers use the `.viewer*` CSS in `renderer/components/code/code.css` (~L376-456). Move it to `modules/diff-viewer/src/ui/*.css`. `DiffView.tsx` and its Diff CSS (~L328) are also used by the transcript's inline diffs, so they **stay core**. Expose them as `host.ui.DiffView`.
- "Ask Pi" in both viewers does `setPromptText` plus `newSessionTab(projectId)`. Add `host.sessions.newSession(projectId?)`. `host.sessions.setPrompt` and `host.tabs.close` already exist.
- The model chip uses a hand-built "session" `ResolvedFeatureModel`. Use `host.hooks.useFeatureModel("session")` or add an `activeSessionModel` hook.
- **`DiffViewerTab` calls git** (`window.studio.stageFile/unstageFile/getGitDiff`, L62-67) and patches the tab with `useSessionStore.setState`. `diff-viewer` must not depend on `git`, because the plan has `git` requiring `diff-viewer`. Fix: `diff-viewer` exposes a slot (e.g. `diff.actions`, props `{tab, host}`). The `git` module fills it with the Stage/Unstage button and refreshes via `host.tabs.update`. `diff-viewer` keeps the Ask-Pi and copy actions.

**Files**
- `window.studio.readFile` / `readMediaFile` are used by `Composer.tsx` (L133-218) for attachments and drag-drop. `listFiles` is used by `CommandPalette.tsx:76` and `FilesPanel.tsx:15`. `runFile` / `IPC.filesRun` has **no renderer caller** (dead). Recommendation: keep `filesList/Read/ReadMedia` IPC in core (`main/services/files.ts`, `ipc/workspace.ts`). The `files` module is then UI-only (panel plus `file.open` plumbing). Delete or move `runWithInterpreter`/`filesRun`. Do not break attachments.
- `FilesPanel`'s Run button already uses the `terminal.run` command with a graceful fallback (done in M3). Keep that.

**Git**
- Main: `main/services/git.ts` (341 lines) with `git.test.ts`, and `main/ipc/workspace.ts` L12-37 (`IPC.git*` handlers). Also `preload/index.ts`, the `IPC.git*` entries and `StudioApi` git methods in `packages/protocol/src/ipc.ts`. `gitGenerateCommitMessage` needs `ctx.pi` (use `MainModuleContext.pi()`). Move all of it to `modules/git/src/{main,service,shared}`, with module-scoped IPC via `ctx.ipc.handle`. Core's `registerWorkspaceIpc` is left with files only.
- Renderer: `GitPanel.tsx` (1192 lines) and `store/git-store.ts` (`startGitStatusWatcher` is called from `WorkbenchLayout.tsx:36,96`; the rail badge logic is at L102-160). `git-store.test.ts` (committed by another session) moves with it.
- The rail sync badge (ahead/behind) needs a generic hook. Add `PanelContribution.badge?: ComponentType<{host}>` or `useBadge(host)` and render it in `ModuleRailButton`. Also support a dynamic `title`.
- `GitPanel` uses `feature-models-store` and `AiModelChip` for AI commit messages. Declare the `gitCommit` AI feature via the existing `aiFeatures` contribution.
- `BranchesPanel.tsx` (608 lines) uses `git-store` and git IPC. It should import from `@hive-module/git/shared` (method names and types) and share the store through `git/shared`, or have `git` expose the store through a command. Boundary rule: modules may import another module's `shared.ts` only. `scripts/check-module-boundaries.mjs` enforces it.

**Core shell cleanup once these are out** (same pattern as terminal/limits/analytics/tools)
- `store/layout-persist.ts` L1,15: `CoreLeftPanel` becomes `"projects"` only, and `VALID_LEFT_PANELS` becomes `["projects"]`.
- `features/commands/registry.ts` L116-118 (`view.files/git/branches`): remove. Declare them in manifests with `keys` and also as renderer commands. Update `commands.test.ts` (~L158-160) and `layout-persist.test.ts`.
- `components/AppTitleBar.tsx` L50-51 and L99-100: remove the shortcuts and menu items, and contribute them through `titleMenu`.
- `components/WorkbenchLayout.tsx`: remove the rail buttons (L149-165), the lazy `GitPanel`/`BranchesPanel`/`FilesPanel` imports (L18,45-46) and `LeftPanelContent` (L247). Left panels then come only from `ModulePanelView`.
- Static manifest `hive.contributes` can list only `leftPanels`, `rightPanels`, `tabKinds` and `commands`. Declare these so the disabled-module placeholders and "Enable X" command stubs work.
- Run `npm install` after creating each `modules/<id>/` so the `@hive-module/<id>` link exists, then `node scripts/gen-modules.mjs`.

## Remaining M4 items
- **First-run picker** (`renderer/features/modules/OnboardingPicker.tsx`): verify it lists the new modules by tier and that Recommended is preselected. Check `presets.test.ts`.
- **Just-in-time install toasts**: command stubs ("X isn't installed. Enable") and `ModulePlaceholder` exist. Still missing: user actions that silently do nothing when a module is off (e.g. palette file-open, or a diff link when `diff-viewer` is off). Add a toast with an Enable action via `host.toast` / the registry helper.
- Update the milestone checkboxes and statuses in `lean-core-modules.md`.

## Known leftovers and gaps (not M4 blockers)
- Interim leakage: `store/feature-models-store.ts` `FeatureModelsConfig` hard-codes `gitCommit`/`usageAnalysis`, and `AiModelChip.tsx` and `ModelsSettingsContent.tsx` also hard-code them. Gate the Settings → Models blocks on `useContributions("aiFeatures")`. Do this while extracting `git`.
- Regression to fix: the browser module's storage reads dropped core's legacy `pi-studio.` key migration. Use `host.storage.get/set`.
- `Library` uses `ipc.invoke<any>`. CLI shim PATH is not auto-modified (`ModulesSettings` only shows a hint).
- Tiers are not yet user-confirmed (Plan Previewer, Terminal and Live limits are "recommended"; the rest are "bonus").
- Nothing so far has been clicked through in a real window. All checks were typecheck, unit tests, build and boot smoke.

## How to verify (all must pass before merging)
```
npm install && node scripts/gen-modules.mjs
npm run check:modules
npm run typecheck                                    # strict: unused imports/locals are errors
timeout 250 npx vitest run --project unit > /tmp/ut.log 2>&1; grep -E "Test Files|Tests |FAIL" /tmp/ut.log
timeout 200 npx vitest run --project contract > /tmp/ct.log 2>&1
npm run build
```
- Last green on `main`: 65 files / 466 unit tests, 2 contract tests.
- **Never pipe `npm test` or vitest through `tail`** (it hangs). Redirect to a file and grep it. If vitest hangs, kill the leaked `node ... vitest.mjs` process.
- **Boot smoke**: write a temp `scripts/_smoke.ps1` (do not commit it). It sets `HOME`/`USERPROFILE`/`HIVE_USER_DATA` to a temp dir and writes `<ud>/hive/modules.json` with `{"schema":1,"enabled":[...],"onboarded":true,"installedAssets":{}}`. It then runs `node_modules/electron/dist/electron.exe .` from `apps/desktop`, waits 12s, checks it is alive with no `rror|Cannot|failed` lines in `err.log`, and kills only its own child processes. Run it with `enabled=[]`, with each new module alone, and with everything on. **Never kill the user's installed `hive.exe`** (it holds port 3456).

## Practical tips
- Many files use CRLF. Edit scripts must normalize (`\r\n` → `\n`), edit, and restore. The `edit` tool is fine for small changes. A chained script that fails midway leaves partial state, so never re-run a script that already applied. `git checkout <file>` restores a corrupted file.
- `.tsbuildinfo` files and `package-lock.json` get modified by typecheck/build/install. Do not commit incidental changes. `git checkout --` them before a push, unless the lockfile legitimately changed because of new workspaces.
- Don't `git add -A`. Use explicit paths.
- Pattern to copy: `modules/terminal` (left/right panel plus commands with args), `modules/analytics` (tab kind plus status bar plus hooks), `modules/tools` (uses `useActiveSession`), `modules/theme-studio` (slots). Host implementation: `renderer/modules/host.tsx`. SDK types: `packages/module-sdk/src/renderer.ts`.
