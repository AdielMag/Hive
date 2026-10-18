# Hive UI/UX Round 3: Keyboard Cheatsheet, One-Click Retry, and Quota Fallback

This addresses the three highest-leverage improvements identified in the critique to elevate the remaining heuristics (**Error Prevention**, **Error Recovery**, and **Help & Documentation**) to 4/4:
1. **Instant Keyboard Cheatsheet (`?` / `F1`)**: An overlay displaying all app shortcuts categorized cleanly by task, plus an empty-state discoverability prompt.
2. **One-Click "Retry" on Network / Rate-Limit Errors**: Instant recovery button on error banners for 529 (overloaded), 429 (rate limit), and network/timeout failures without re-typing.
3. **Quota Exhaustion Alert & Model Switch**: Clear alert banner with a 1-click "Change Model…" action in the limits popover when a pool hits 95–100%, plus a subtle warning state on the composer model chip.

---

## Proposed Changes

### Feature 1: Instant Keyboard Cheatsheet (`?` / `F1`)
- **New Component `components/ShortcutsCheatsheet.tsx`** & **`styles/shortcuts-cheatsheet.css`**:
  - Modal overlay rendered when `useUi.getState().shortcutsOpen` is true.
  - Categorized columns:
    - **Navigation & Tabs**: `Mod+K` (Search Everything), `Mod+Shift+P` (Commands), `Mod+Tab` / `Mod+Alt+Tab` (Cycle tabs), `Mod+W` (Close Tab), `Mod+O` (Open Folder).
    - **Panels**: `Mod+B` (Sessions), `Mod+Shift+E` (Files), `Mod+Shift+G` (Git), `Mod+\`` (Terminal), `Mod+Shift+B` (Browser).
    - **Composer & Execution**: `Ctrl+Enter` (Send), `Mod+Shift+M` (Cycle Agent Mode), `Mod+Shift+T` (Cycle Thinking), `Mod+Shift+R` (Reload Pi).
    - **Window & Help**: `?` or `F1` (Cheatsheet), `Mod+,` (Settings), `Mod+=` / `Mod+-` (Zoom).
  - Esc or backdrop click dismisses.
- **Store `store/ui-store.ts`**:
  - Add `shortcutsOpen: boolean`, `toggleShortcuts(): void`, `closeShortcuts(): void`.
- **Keybinding Dispatcher `features/commands/useKeybindings.ts` & `features/commands/registry.ts`**:
  - Add `app.shortcuts` command.
  - Wire `?` (Shift+/) and `F1` when focus is not inside an `input`, `textarea`, or `contenteditable`.
- **Empty State `components/Transcript.tsx`**:
  - Update subtitle: *"Ask Pi a question or hand it a task in this project. Press ? for shortcuts."*

---

### Feature 2: One-Click "Retry" on Error Banners
- **Classification `lib/error-summary.ts`**:
  - Update `RULES` so 529 (overloaded), 429 (rate limit), and network/timeout errors set `action: "retry"`.
  - Update `lib/error-summary.test.ts` to assert `action: "retry"` for these cases.
- **Store `store/session-store.ts`**:
  - Add `retryLastMessage: () => Promise<void>`:
    - Clears active error via `clearError()`.
    - Inspects `transcript` for the most recent user message `entryId`.
    - Re-submits using `editUserMessage(entryId, "resend")`.
    - If no previous user message exists in history, falls back to sending `promptText`.
- **UI `components/SessionErrorBanner.tsx`**:
  - When `action === "retry"`, render a `"Retry"` button alongside "Copy" and "Dismiss".
  - Shows spinning `RotateCw` while retry is executing.

---

### Feature 3: Quota Exhaustion Alert & Quick Switch
- **Popover `modules/limits/src/ui/QuotaStatusItem.tsx`**:
  - Inspect `meters` for any subscription pool with `worst >= 95%`.
  - Render an alert banner above the cards:
    - `"{Provider} quota exhausted ({pct}%) — switch model to continue without delays."`
    - `"Change Model…"` button that closes the popover and calls `host.settings.open("models")`.
- **Styles `modules/limits/src/ui/limits.css`**:
  - Style `.quota-popover__exhausted-banner` with subtle amber/red border, warning icon, and compact action button.
- **Composer `components/AiModelChip.tsx`**:
  - If current model belongs to an exhausted provider quota pool, display a small warning status dot with a tooltip: `"Quota exhausted — click to change model"`.

---

## Verification Plan

### Automated Checks
1. `node node_modules/typescript/lib/tsc.js -p apps/desktop/tsconfig.web.json --noEmit`
2. `node node_modules/typescript/lib/tsc.js -b modules`
3. `node node_modules/vitest/vitest.mjs run apps/desktop/src/renderer/lib/error-summary.test.ts`
4. `node node_modules/vitest/vitest.mjs run --project unit`
5. `ask_jev` risk scan on all touched files.

### Interactive Verification (CDP / Port 9222)
1. **Shortcuts Cheatsheet**:
   - Press `?` on the main window -> verify modal opens with all 4 shortcut groups.
   - Press `Escape` -> verify modal closes.
   - Verify empty state subtitle shows `"Press ? for shortcuts"`.
2. **One-Click Retry**:
   - Dispatch a mock 529 / overloaded error into the store.
   - Verify error banner displays `"The provider is overloaded — try again shortly"` with a `"Retry"` button.
   - Click `"Retry"` -> verify `retryLastMessage` triggers.
3. **Quota Alert**:
   - Open subscription limits popover -> verify exhausted banner appears for pools at 100% with the `"Change Model…"` button opening Settings › Models.
