# Hive product polish: one design system, every surface

I built the app from this worktree, drove it over CDP and captured 15 screens. Each surface was styled on its own, and that is why the app feels vibe coded. The CSS uses 18 font sizes (160 rules set text under 11px), 15 radius values, 44 uppercase labels, 79 monospace rules, 194 hard-coded hex colours, and the orange accent sits on almost every chip. The plan sets the tokens and shared parts first, then moves every surface onto them in 7 phases with one commit per phase. Behaviour stays the same; this is visual and UX only.

## Approach
- **Foundations first.** A fixed type scale (11/12/13/14/16/20), 4 radii, 3 control heights, sentence-case labels, Inter tabular numbers instead of mono, and a strict accent budget: primary action, selection, focus.
- **Shared primitives in `ui.css`**: button, icon button, badge, section header, empty state, segmented, input, kbd, menu. Module copies such as `gp-ib` and the per-module chips move onto them.
- **Then surfaces:** shell, session (empty state, composer, transcript), side panels, overlays.
- **Fix the visible bugs** found in the captures (list below).
- **Verify by screenshots:** run the CDP capture again after every phase, compare before and after, and run the taste-skill `lint --app`, `typecheck`, `lint`, `lint:css` and `test`.

## Decisions

> [!CHOICE] Visual direction
> **Question**: What should Hive feel like?
> - (x) **Calm pro tool**: neutral surfaces, accent only on the primary action and selection, dense and quiet (Linear/Zed class) [Recommended]
> - ( ) **Keep current character**: same warm, accent-heavy look, but fix consistency and bugs only

> [!CHOICE] Theme wash and grain
> **Question**: What happens to the gradient wash and film grain behind the frame?
> - (x) **Keep, calmer default**: the feature stays, the default intensity goes 0.45→0.25 and grain 0.25→0.1, and panels stay opaque [Recommended]
> - ( ) **Keep exactly as is**: don't touch the theme engine
> - ( ) **Flat by default**: the wash becomes opt-in and the default is a solid neutral frame

> [!CHOICE] Execution
> **Question**: How should the work run?
> - (x) **All 7 phases, one commit each**, with screenshots checked after every phase [Recommended]
> - ( ) **Phases 1–3 only first** (foundations, primitives, shell), then check in

<!-- MORE -->

## Bugs found in the captures

| Where | Bug |
|---|---|
| Branches panel header | "New branch" and "Push 2" wrap onto two lines |
| Branches log header | "COMMIT" and "AUTHOR" overlap ("CAUTHOR") |
| Tools panel | The filter search sits on an odd brown band that runs into the rail |
| Skills & Agents detail | "Delete" is cut to "Delet"; the title "design-taste-frontend" breaks mid-word |
| Tab strip | Titles cut to "New ...", "Usage...", "Skills ..."; a session tab is titled "2026-1..." (a date) |
| Worktree bar | The branch reads "hive/load-taste-sk... ← m..." with both ends cut |
| Command palette | Usage and Skills show a chat icon; the selected row is a heavy orange fill |
| Composer | The placeholder runs on: "(Drag & drop or paste files/images/videos)" |
| AI buttons | A model badge ("flash 3.8", "haiku 5.5", "opus 5.5") sits on Generate, Archive old and Analyze |

## Phases

### 1. Foundations (`styles/theme.css`, `DESIGN.md`)
- Tokens: `--fs-11..20`, `--radius-sm/md/lg/full` (4/6/8/999), `--control-sm/md/lg` (24/28/32), `--space-*` on a 4px base.
- Global rules: no text under 11px, numbers in `tabular-nums` Inter, `--font-mono` only for code, paths, IDs and the terminal.
- Accent budget written down in `DESIGN.md`; status colours only for status.
- Theme defaults per the decision (`packages/theme-engine/src/arc.ts` `DEFAULT_ARC_THEME`).

### 2. Primitives (`styles/ui.css`)
- `.ui-btn` primary / secondary / ghost / danger at 3 sizes; `.ui-icon-btn`; `.ui-badge` (neutral + status, sentence case); `.ui-section` header (title, count, actions); `.ui-empty` (no icon tile); `.ui-seg`; `.ui-input`; `.ui-kbd`; `.ui-menu`.
- Extend `scripts/check-css-motion.mjs` (or add `check-css-system.mjs`) to flag sub-11px sizes, `text-transform: uppercase` and raw hex outside the token files.

### 3. Shell
- `AppTitleBar.tsx`, `shell.css`: title bar spacing, project picker and search alignment.
- Rail: a quieter active state, grouped icons, tooltips kept.
- `TabStrip.tsx`: a minimum tab width with smarter truncation, and a session tab falls back to its first prompt instead of a date.
- `StatusBar.tsx`: quota meters with labels (`Claude 13%`), version and cost on one baseline.
- Every panel header is 40px with the same title and action layout.

### 4. Session
- `Transcript.tsx` empty state: drop the sparkle tile; show the project and branch, a recent-sessions list, and starter prompts as a quiet list.
- `Composer.tsx` / `composer.css`: placeholder "Ask Pi or give it a task"; mode, model and thinking in one even toolbar; context ring with a readable label; Send as the one primary.
- Transcript: a neutral user bubble, tool-batch chips in sentence case, the meta line in muted Inter tabular, `RunTimeBar` aligned.
- `WorktreeBar.tsx`: truncate the middle of the branch name, quieter actions (Discard stays danger).

### 5. Side panels (modules)
- Sessions: header, footer as a menu (Archive old, Show archived).
- Git, branches: section labels, toolbar wrap fix, commit box, the `gp-ib` icon buttons move to primitives.
- Actions: denser run rows instead of tall cards.
- Usage: KPIs as one divided strip with no icon tiles.
- Library: detail header and actions.
- Context: one-hue bars.
- Files and terminal: tab and label polish.

### 6. Overlays
- `SettingsModal.tsx` / `settings.css`: flat sidebar, sentence-case groups, aligned rows.
- `CommandPalette.tsx`: a short placeholder, a quiet selected row, correct icons, no "Hive Quick Search" footer.
- Onboarding picker, dialogs, toasts, tooltips, the shortcuts cheatsheet.

### 7. Verify and document
- Capture every surface again at 1440×900 over CDP; save before and after side by side in `%TEMP%/hive-ux`.
- Run taste-skill `lint.mjs --app` on the renderer and modules CSS; fix the worst 3 issues, re-capture (2 rounds at most).
- Update `DESIGN.md` with the final system.

## Risks
- Wide CSS changes can regress less-visited views (plan previewer, JEV, marketplace, browser). The capture script covers them in phase 7.
- Module CSS is large (about 9k lines). Migration is incremental, so old class names keep working until each module is moved over.

## Verify
- `npm run typecheck && npm run lint && npm run lint:css && npm test`
- `npm run build`, then the CDP capture of all 15+ surfaces, compared before and after.
