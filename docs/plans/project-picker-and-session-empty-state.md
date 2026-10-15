# Fix Project Dropdown Selection and Session Empty State

Ensure the title bar project dropdown is clickable, keep the active project selected when all tabs are closed, and show a "Start new session" action alongside previous sessions in the active project.

## Approach
- Add `pointer-events: auto;` to `.project-picker` and `.project-picker__dropdown` in `shell.css`, and allow selecting the current project when tabs are empty.
- In `session-store.ts`, preserve `activeProject` when closing the last tab instead of clearing it to `null`.
- In `WelcomeView.tsx`, render a dedicated project hub view when `activeProject` is selected: display project details, a prominent "Start a New Session" button, and previous sessions in that project with click-to-open.
- Add unit tests for `session-store` tab closing behavior and `WelcomeView` rendering.

<!-- MORE -->

## Changes

| File | Change |
|---|---|
| `apps/desktop/src/renderer/styles/shell.css` | `[MODIFY]` Add `pointer-events: auto;` and `-webkit-app-region: no-drag;` to `.project-picker` and its dropdown |
| `apps/desktop/src/renderer/components/ProjectPicker.tsx` | `[MODIFY]` Update `handleSelect` so clicking the project opens a new session or focuses an existing tab even if already selected |
| `apps/desktop/src/renderer/store/session-store.ts` | `[MODIFY]` In `closeTab`, do not reset `activeProject` to `null` when `remaining.length === 0` |
| `apps/desktop/src/renderer/components/WelcomeView.tsx` | `[MODIFY]` Add project-aware view: project badge/name/path, "Start New Session" button, and list of previous sessions for this project |
| `apps/desktop/src/renderer/store/session-store.test.ts` | `[MODIFY]` Add test verifying `activeProject` is preserved when closing all tabs |
| `apps/desktop/src/renderer/components/WelcomeView.test.tsx` | `[NEW]` Add unit tests verifying `WelcomeView` displays project info, new session action, and project sessions |

## Risks
- None identified; preserving `activeProject` aligns with user expectation and existing architecture where `activeProject` represents current workspace context.

## Verify
- `npm test` to verify all test suites pass.
- Targeted tests for `session-store` and `WelcomeView`.
