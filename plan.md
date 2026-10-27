# Project Tabs in Top Bar

Add Rider-style project tabs to the top bar above session tabs, allowing multiple projects to be open simultaneously, reordered, and switched seamlessly with a companion dropdown picker.

## Approach
- Add `openProjectIds` state to `session-store.ts` (persisted to `localStorage`), tracking open project tabs in order.
- Create a dedicated `ProjectTabBar` component in `AppTitleBar` with draggable project tabs, active indicator, close buttons, drop indicators, and context menus.
- Retain the project switcher dropdown next to tabs: selecting an already-open project activates its tab; selecting an unopened project opens a new tab.
- Add an appearance setting (`projectTabsEnabled`, default `true`) in Settings so users can toggle between project tabs and classic single-project mode.
- Switching project tabs updates `activeProject`, preserving and restoring each project's session tabs and split-pane layout independently.

## Decisions

> [!CHOICE] Closing the last open project tab
> **Question**: What should happen when the user clicks close on the only remaining open project tab?
> - (x) **Show Welcome screen**: Closes the project tab and displays the Welcome / Open screen with the top bar dropdown ready [Recommended]
> - ( ) **Keep sole tab open**: Disable or hide the close button on the last open project tab so at least one project stays active

> [!CHOICE] Project tab sizing behavior
> **Question**: How should project tabs size themselves in the top bar?
> - (x) **Compact auto-sizing**: Fixed maximum width (160–180px) with text ellipsis and horizontal wheel scroll for many tabs [Recommended]
> - ( ) **Flexible tabs**: Tabs stretch dynamically to occupy available space up to a maximum width

<!-- MORE -->

## Changes

| File | Change |
|---|---|
| `apps/desktop/src/renderer/store/session-store.ts` | `[MODIFY]` Add `openProjectIds`, `openProjectTab`, `closeProjectTab`, `reorderProjectTabs`, `closeOtherProjectTabs`, and disk persistence |
| `apps/desktop/src/renderer/store/ui-store.ts` | `[MODIFY]` Add `projectTabsEnabled` preference to UI store |
| `apps/desktop/src/renderer/components/ProjectTabBar.tsx` | `[NEW]` Project tabs bar with drag-and-drop reordering, active tab styling, close button, drop indicator, and context menu |
| `apps/desktop/src/renderer/components/ProjectPicker.tsx` | `[MODIFY]` Refactor dropdown menu logic to support open/switch behavior and standalone dropdown trigger |
| `apps/desktop/src/renderer/components/AppTitleBar.tsx` | `[MODIFY]` Integrate `ProjectTabBar` in titlebar center, respecting `projectTabsEnabled` setting |
| `apps/desktop/src/renderer/components/AppearanceSettingsContent.tsx` | `[MODIFY]` Add toggle switch for "Show projects as tabs in top bar" under Workbench |
| `apps/desktop/src/renderer/features/commands/CommandPalette.tsx` | `[MODIFY]` Update project selection in palette to use `openProjectTab` |
| `apps/desktop/src/renderer/styles/shell.css` | `[MODIFY]` Styling for project tabs, tab drag states, drop indicators, and title bar flex layout |
| `apps/desktop/src/renderer/store/session-store.test.ts` | `[MODIFY]` Unit tests for `openProjectTab`, `closeProjectTab`, and `reorderProjectTabs` |

## Risks
- Titlebar window drag: Window dragging (`-webkit-app-region: drag`) must remain functional on empty spaces, while project tabs and buttons must have `no-drag` so tab clicking and drag-reordering work smoothly without moving the window.
- macOS traffic lights: Top bar layout must preserve the 78px left padding on macOS to prevent overlapping native window controls.

## Verify
- `node ../session-bbf066/node_modules/vitest/vitest.mjs run apps/desktop/src/renderer/store/session-store.test.ts`
- Manual checks:
  1. Open project from dropdown: if open, activates existing tab; if not open, opens new tab.
  2. Drag and drop reordering of project tabs with visual drop indicator.
  3. Close project tab: switches to adjacent tab.
  4. Session tabs and split pane layouts are retained independently per project tab.
  5. Toggle setting in Settings > Appearance switches between tabs mode and classic picker mode.
