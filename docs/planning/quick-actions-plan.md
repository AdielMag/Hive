<!-- SUMMARY -->
# Quick Search & Actions + Rebindable Shortcuts (Executive Summary)

> [!NOTE]
> **Executive Summary**: Add a command palette (quick search over actions, sessions, projects and files) and turn today's hard-coded `useGlobalShortcuts` hook into a data-driven command registry whose key bindings users can change in a new **Keyboard** tab in Settings. Renderer-only for v1 (no new IPC). Roughly 3 phases, ~12 files.

## High-Level Strategy & Architecture
- **Core concept**: one **command registry** (`id`, title, category, default shortcut, `run()`) is the single source of truth. The palette, the global key handler, the title-bar menu hints, tooltips and the Settings editor all read from it.
- **Today**: shortcuts live in an if/else chain in `renderer/hooks/useGlobalShortcuts.ts:14-53`; the same strings are duplicated by hand in `AppTitleBar.tsx:62-91` and rail tooltips (`WorkbenchLayout.tsx:88+`). Nothing is rebindable.
- **Key milestones**:
  1. Keybinding engine + registry + user overrides store (pure, unit-tested).
  2. Replace `useGlobalShortcuts` with a registry-driven dispatcher; derive menu/tooltip labels.
  3. Command palette UI (actions first, then sessions/projects/files).
  4. Settings → Keyboard tab (record, conflict detection, reset).

## Key Decisions

> [!CHOICE] Palette entry shortcut
> **Question**: Which default shortcut opens the palette? (`Ctrl+Shift+K` is already "Skills & Agents".)
> - (x) **Ctrl+K** = unified search, **Ctrl+Shift+P** = actions only (`>` prefix) [Recommended]
> - ( ) **Ctrl+P** = quick open, **Ctrl+Shift+P** = actions (VS Code style)
> - ( ) **Ctrl+Shift+P** only

> [!CHOICE] Where to persist custom bindings
> **Question**: Where should user overrides live?
> - (x) **localStorage** (`hive.keybindings.v1`), same pattern as layout/appearance stores; zero IPC [Recommended]
> - ( ) **JSON file in `<userData>/hive/`** via new IPC (hand-editable, survives cache clears, more plumbing)

> [!QUESTION] Scope of "search"
> **Question**: Should v1 search also include file contents (grep) or only names (actions, sessions, projects, files by path)? Plan assumes names only.

## Execution Milestones
- [ ] 1. Keybinding engine, registry, overrides store + tests
- [ ] 2. Registry-driven global shortcut dispatcher; menus/tooltips derive labels
- [ ] 3. Command palette (actions → sessions/projects → files)
- [ ] 4. Settings "Keyboard" tab with recorder + conflict handling
- [ ] 5. Typecheck, tests, manual QA on Windows (and mac glyph check), CHANGELOG via conventional commit
<!-- /SUMMARY -->

<!-- FULL -->
# Quick Search & Actions + Rebindable Shortcuts (Full Specification)

## 1. Objective & Background

Hive (Electron + React 19 + Zustand, plain CSS with tokens, `lucide-react`) has no discoverable way to run actions and no way to change shortcuts.

Findings from the codebase:

- **Native menus are disabled** (`main/window.ts:28`, `Menu.setApplicationMenu(null)`), so *all* shortcuts are handled by one renderer capture-phase `keydown` listener (`useGlobalShortcuts.ts`). No `globalShortcut`/accelerators in main, so rebinding is a pure renderer concern.
- Current shortcuts: `Mod+N` new session, `Mod+O` open project, `Mod+W` close tab, `Mod+,` settings, `Mod+B` projects, `Mod+Shift+E` files, `Mod+Shift+G` git, `` Mod+` `` terminal, `Mod+Shift+U` usage, `Mod+Shift+K` library, `Mod+=/-/0` zoom, `Mod+Tab`/`Mod+Shift+Tab` cycle tabs.
- Shortcut strings are **duplicated** as literals in `AppTitleBar.tsx` (menu items), `WorkbenchLayout.tsx` (rail button titles), `TabStrip.tsx:94`. They will drift as soon as bindings are editable, so they must be derived.
- Modals are in-tree overlays using `.modal-scrim` (`styles/shell.css:609`) with their own `Escape` handlers; `SettingsModal.tsx` has a tab array (`TABS`) that is trivial to extend.
- Stores: `useUi` (panels, `settingsOpen`), `useSessionStore` (projects, sessions, tabs), `useAppearance`. Persistence pattern for UI-only prefs: `lib/storage.ts` + a pure `sanitize*` function (see `layout-persist.ts`) – tested in node env.
- Filtering today is `.toLowerCase().includes()` only (no fuzzy lib). Platform is known via `document.documentElement.dataset.platform` / `session-store` bootstrap.
- Component-local keys (`Composer` Enter/Shift+Enter/history, `QuestionFormModal` Ctrl+Enter, `Esc` in modals) stay **non-rebindable**: they are context-specific editing behaviours, not app commands.

> [!IMPORTANT]
> Invariants: (1) one source of truth for commands; (2) defaults reproduce today's behaviour exactly (except the new palette bindings); (3) a corrupt/unknown overrides blob must never break startup (sanitize and fall back to defaults); (4) bindings are stored as platform-neutral strings using `Mod` (= Ctrl on Win/Linux, Cmd on macOS).

## 2. Architecture & Component Flow

```mermaid
graph TD
    REG[commands/registry.ts<br/>Command[] id,title,category,defaultKeys,run,when] --> PAL[CommandPalette.tsx]
    REG --> DISP[useKeybindings hook<br/>replaces useGlobalShortcuts]
    REG --> SET[Settings → Keyboard tab]
    KB[keybinding.ts<br/>parse / normalize / match / format / conflicts] --> DISP
    KB --> SET
    KB --> LBL[useShortcutLabel id<br/>menus, tooltips]
    OV[(keybindings-store.ts<br/>overrides map in localStorage)] --> DISP
    OV --> SET
    OV --> LBL
    FZ[fuzzy.ts<br/>score + highlight ranges] --> PAL
    STORES[useSessionStore / useUi / window.studio] --> REG
    PAL -->|run| REG
```

### Proposed module layout (`apps/desktop/src/renderer/features/commands/`)

| Module | Responsibility |
|---|---|
| `keybinding.ts` | Pure. `parseChord("Mod+Shift+E")` → `{mod,shift,alt,key}`; `eventToChord(KeyboardEvent)`; `matches(chord, event)`; `formatChord(chord, platform)` (`Ctrl+Shift+E` vs `⌘⇧E`); `normalizeKey` (handles `+`/`=`, `` ` ``, `,`, Tab, arrows via `e.key` with `e.code` fallback for non-Latin layouts); reserved-chord list. |
| `types.ts` | `Command { id; title; category; keywords?; defaultKeys?: string[]; icon?; when?(): boolean; run(): void \| Promise<void> }`. |
| `registry.ts` | Static `COMMANDS` array. Actions call `useSessionStore.getState()` / `useUi.getState()` / `window.studio` lazily (same as the current hook), so no React coupling and easy to test. |
| `keybindings-store.ts` | Zustand. State `overrides: Record<commandId, string[] \| null>` (`null` = explicitly unbound). Selectors: `getBinding(id)`, `findConflicts(chord)`. Actions: `setBinding`, `clearBinding`, `resetBinding`, `resetAll`. Pure `sanitizeOverrides(raw, knownIds)` drops unknown ids/invalid chords. Debounced save like `ui-store.ts`. |
| `useKeybindings.ts` | Capture-phase window `keydown` dispatcher: builds a chord → command-id lookup map (rebuilt when overrides change), skips while the Settings recorder or palette input is capturing, respects `when()`, `preventDefault/stopPropagation` only when handled. |
| `useShortcutLabel.ts` | `useShortcut(id): string \| undefined` for menus/tooltips. |
| `fuzzy.ts` | Pure subsequence scorer (consecutive + word-boundary + prefix bonuses) returning `{score, ranges}` for highlighting. No dependency. |
| `palette-store.ts` | `{ open, mode, query, openPalette(mode?) , close }`; recent-command history (last ~20 ids, persisted) for empty-query ordering. |
| `CommandPalette.tsx` + `command-palette.css` | Overlay (reuses `.modal-scrim`), input, grouped result list, keyboard nav (↑/↓/Enter/Esc, Tab to switch groups), shortcut badges, highlight ranges, `aria-activedescendant` combobox/listbox roles. |
| `KeyboardSettings.tsx` | Settings tab content. |

### Palette behaviour

- **Empty query**: recent commands, then common actions.
- **Default (no prefix)**: unified fuzzy search across *Actions*, *Sessions*, *Projects*, *Open tabs*, (phase 3) *Files* – results grouped with section headers, capped (e.g. 8 per group, 50 total).
- **Prefixes** (shown as hint chips under the input): `>` actions only, `@` sessions/projects, `/` files in active project, `?` help.
- Actions that need an argument are modelled as a two-step: select command → palette stays open in a sub-mode (e.g. "Switch project…" lists projects, "Switch model…" reuses the model list). v1 ships only the simple ones.
- Disabled commands (`when()` false, e.g. "Close tab" with no tabs) are hidden, not greyed, to keep results relevant.

### Initial command set (derived from existing capabilities)

New Session, Open Project Folder, Close Tab, Next/Previous Tab, Open Settings, Toggle Projects/Files/Git/Branches/Terminal/Tools/Context/Marketplace panels, Open Usage, Open Skills & Agents, Zoom In/Out/Reset, Git: Fetch/Pull/Push (if exposed via store; otherwise focus Git panel), Check for Updates, Open Settings → Keyboard Shortcuts, Focus Composer, Switch Session (sub-mode), Switch Project (sub-mode), Toggle Dark Mode.

## 3. Decisions & Trade-Offs

> [!CHOICE] Palette entry shortcut
> **Question**: Which default shortcut opens the palette?
> - (x) **Ctrl+K** unified, **Ctrl+Shift+P** actions-only [Recommended]
> - ( ) **Ctrl+P** quick open, **Ctrl+Shift+P** actions (VS Code muscle memory)
> - ( ) **Ctrl+Shift+P** only

> [!CHOICE] Persistence of custom bindings
> **Question**: Where do overrides live?
> - (x) **localStorage** `hive.keybindings.v1` [Recommended]
> - ( ) **File in userData + IPC** (adds `IPC.settingsGetKeybindings/Save…` in `packages/protocol/src/ipc.ts`, preload, main handler, `GuiStore` file)

> [!CHOICE] Multiple bindings per command
> **Question**: Allow more than one chord per command?
> - (x) **Yes, data model is `string[]`**, UI v1 edits the primary and allows adding an alternate [Recommended]
> - ( ) **One chord only** (simpler UI)

> [!QUESTION] Chord sequences
> **Question**: Do you want VS Code-style two-step chords (e.g. `Ctrl+K Ctrl+S`)? Plan excludes them for v1; the data model (`string[]` of chords) can be extended later.

> [!WARNING]
> **Terminal focus conflict**: the dispatcher listens in the capture phase on `window`, so it already steals `Ctrl+B/W/N…` from the xterm terminal. Adding `Ctrl+K` (kill-line in shells) and `Ctrl+P` (history-prev) makes this worse. Mitigation: when `event.target` is inside `.xterm`, only dispatch chords that include **Shift or Alt**, plus a per-command opt-in `allowInTerminal` (true for the palette's `Ctrl+Shift+P`). Needs a quick manual check against the real terminal panel (`TerminalPanel.tsx`).

> [!WARNING]
> **Behaviour change risk**: existing code ignores any chord with `Alt` (`if (!mod || e.altKey) return`) and *requires* `Mod`. The new engine will permit non-`Mod` bindings (e.g. `F1`, `Alt+1`). Require at least one modifier **or** an `F`-key for global bindings so users cannot bind plain letters and break typing in the composer.

## 4. Data Model

```ts
// persisted: localStorage "hive.keybindings.v1"
{ "version": 1,
  "overrides": {
    "view.toggleGit": ["Mod+Alt+G"],     // replaced
    "tab.close": null                     // explicitly unbound
  } }
```

- Effective binding = `overrides[id] !== undefined ? overrides[id] : command.defaultKeys ?? []`.
- Only differences from defaults are stored, so future default changes propagate to users who did not customise.
- Chord grammar: `Mod|Ctrl|Meta|Alt|Shift` modifiers joined by `+`, then one key (`E`, `,`, `` ` ``, `Tab`, `F5`, `ArrowUp`). Canonical order `Mod+Alt+Shift+Key`, key upper-cased for letters.
- **Conflicts**: two commands may not share an effective chord. The recorder detects this and offers **Replace** (unbinds the other) or **Cancel**. Defaults are asserted conflict-free by a unit test.
- **Reserved** (cannot be assigned): `Mod+C/V/X/Z/Y/A`, `Escape`, `Enter`, `Tab` alone, plain printable keys; `Mod+Tab` is allowed as it is the current default.

## 5. Step-by-Step Implementation Breakdown

**Phase 1 – Engine (no UI change)**
1. `keybinding.ts` + `fuzzy.ts` with full unit tests.
2. `types.ts`, `registry.ts` encoding all current shortcuts as `defaultKeys` (parity with `useGlobalShortcuts.ts`), including `Mod+=`/`Mod++` alias.
3. `keybindings-store.ts` with `sanitizeOverrides`, persistence through `lib/storage.ts`.

**Phase 2 – Dispatcher + derived labels**
4. `useKeybindings.ts`; swap it in where `useGlobalShortcuts()` is called (find call site, probably `WorkbenchLayout.tsx`/`App.tsx`); keep `openProjectFolder` export (re-export from the registry) since other files import it.
5. `AppTitleBar.tsx`: replace literal `shortcut: "Ctrl+N"` with `useShortcut("session.new")`; same for `WorkbenchLayout.tsx` rail titles and `TabStrip.tsx:94`. `formatChord` renders `⌘⇧E` on darwin.
6. Delete `useGlobalShortcuts.ts` once nothing imports it.

**Phase 3 – Palette**
7. `palette-store.ts`, `CommandPalette.tsx`, `command-palette.css`; mount next to the other root modals in `WorkbenchLayout.tsx`. Add commands `palette.open` and `palette.actions`.
8. Data sources: sessions/projects/tabs from `useSessionStore` (synchronous). Files: reuse whatever listing API `FilesPanel.tsx` already uses (confirm during implementation; if only lazy per-directory listing exists, add a capped recursive list IPC honouring `.gitignore` – this would be the only IPC work and can be deferred).
9. Add a title-bar search affordance (small button/hint "Search… Ctrl+K") so the feature is discoverable.

**Phase 4 – Settings → Keyboard**
10. Add `"keyboard"` to `SettingsTabId` and `TABS` in `SettingsModal.tsx` (icon `Keyboard` from lucide).
11. `KeyboardSettings.tsx`: search box, list grouped by category, each row = title, chord badges, **Edit** (click to enter "Press keys…", `Esc` cancel, `Backspace`/`Delete` unbind), per-row **Reset**, top-level **Reset all**, "modified" dot, inline conflict banner with Replace/Cancel. While recording, `useKeybindings` is paused via a store flag so pressing the chord doesn't execute the command.
12. `styles` for kbd badges (reuse `menu-pop__kbd` look).

**Phase 5 – Wrap-up**
13. `npm run typecheck`, `npm test`, manual QA, README shortcut docs if present.

## 6. File Changes Breakdown

| File | Action | Description |
|---|---|---|
| `renderer/features/commands/keybinding.ts` | `[NEW]` | Chord parse/match/format/normalize, reserved list |
| `renderer/features/commands/fuzzy.ts` | `[NEW]` | Fuzzy scorer + highlight ranges |
| `renderer/features/commands/types.ts` | `[NEW]` | `Command` type |
| `renderer/features/commands/registry.ts` | `[NEW]` | All commands with default shortcuts |
| `renderer/features/commands/keybindings-store.ts` | `[NEW]` | Overrides store + sanitize + persistence |
| `renderer/features/commands/useKeybindings.ts` | `[NEW]` | Registry-driven global dispatcher |
| `renderer/features/commands/useShortcut.ts` | `[NEW]` | Label hook for menus/tooltips |
| `renderer/features/commands/palette-store.ts` | `[NEW]` | Palette open/mode/query/recents |
| `renderer/features/commands/CommandPalette.tsx` | `[NEW]` | Palette UI |
| `renderer/features/commands/KeyboardSettings.tsx` | `[NEW]` | Settings editor + recorder |
| `renderer/features/commands/command-palette.css` | `[NEW]` | Styles using existing tokens |
| `renderer/hooks/useGlobalShortcuts.ts` | `[DELETE]` | Superseded (keep `openProjectFolder` via registry) |
| `renderer/components/SettingsModal.tsx` | `[MODIFY]` | New `keyboard` tab |
| `renderer/components/AppTitleBar.tsx` | `[MODIFY]` | Derived shortcut labels, search button |
| `renderer/components/WorkbenchLayout.tsx` | `[MODIFY]` | Mount palette; derived rail tooltips; swap hook |
| `renderer/components/TabStrip.tsx` | `[MODIFY]` | Derived tooltip |
| `renderer/**/*.test.ts` (keybinding, fuzzy, store, registry) | `[NEW]` | Unit tests |
| `packages/protocol`, `main/`, `preload/` | `[LOW RISK]` untouched in v1 | Only if file-listing or file-persistence options are chosen |

## 7. Verification & Automated Test Plan

- **Unit (vitest, node env, pure logic)**
  - `keybinding.test.ts`: parse/format round-trip, `Mod` resolution per platform, `+`/`=` aliasing, shifted symbols, reserved rejection.
  - `fuzzy.test.ts`: ranking order (prefix > boundary > scattered), no-match, highlight ranges.
  - `keybindings-store.test.ts`: `sanitizeOverrides` (garbage, unknown ids, bad chords), effective-binding resolution, conflict detection, reset.
  - `registry.test.ts`: unique ids, **no default conflicts**, every default parses, defaults equal the legacy table (parity guard).
- `npm run typecheck` and `npm test`.
- **Manual QA**
  1. Every legacy shortcut still works with defaults.
  2. `Ctrl+K` opens palette; type "git" → toggle Git panel executes; `Esc` closes; focus returns to previous element.
  3. Rebind `Toggle Git` to `Ctrl+Alt+G`; menu hint, rail tooltip and behaviour update immediately; restart app → persisted.
  4. Record a conflicting chord → Replace/Cancel flows; Reset row / Reset all.
  5. Corrupt `hive.keybindings.v1` in devtools → app starts with defaults.
  6. Focus in terminal and in composer: plain typing unaffected; `Ctrl+K` behaviour per the terminal mitigation.
  7. Screen reader / keyboard-only: palette is a labelled combobox; list is navigable without a mouse.
- Commit as `feat(commands): …` so the generated CHANGELOG picks it up.
<!-- /FULL -->
