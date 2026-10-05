# Replace the huge model right-click menu with a searchable picker

Right-clicking the model chip on "AI Message" (git) and "Analyze with AI" (usage) opens `ContextMenu` with one row per catalog model, which runs far past the screen. Replace it with a compact popover: a search box, a few source options up top, and a scrollable model list grouped by provider. About 1 new file and 1 edited.

## Approach
- New `ModelPickerPopover` portal in `apps/desktop/src/renderer/components/`, anchored to the chip, clamped to the viewport, fixed width ~280px and `maxHeight` ~320px with only the list scrolling.
- Layout, top to bottom: search input (autofocus), "Use" rows (Active session model, Pi CLI default, Fast local rules for usage only), model list grouped by provider with a context-window tag and reasoning icon, footer "Manage models…" link to Settings > Models.
- Models shown are the same enabled set the Composer picker shows (reuse its `enabledModelKeys` filtering), not the whole catalog.
- Keyboard: type to filter, Up/Down to move, Enter to pick, Esc to close. Closes on outside click, blur, resize.
- `AiModelChip` swaps `ContextMenu` for the popover on right-click. The `feature` prop and apply logic (`setGitCommitConfig`, `setUsageAnalysisConfig`, `setModel`) stay as is, so the module host and callers need no change.
- Picker styling reuses the Composer model dropdown look (`--bg-elevated`, `--border-prominent`, accent tint on selection) for consistency.

## Decisions

> [!CHOICE] How models are laid out
> **Question**: How should the model choice be presented?
> - (x) **Searchable popover, grouped by provider**: matches the Composer picker, handles any catalog size [Recommended]
> - ( ) **Cascading submenu per provider**: no typing needed, but needs hover-precision and is awkward near screen edges

## Changes
| File | Change |
|---|---|
| `apps/desktop/src/renderer/components/ModelPickerPopover.tsx` | `[NEW]` popover with search, source rows, grouped list |
| `apps/desktop/src/renderer/components/AiModelChip.tsx` | `[MODIFY]` right-click opens the popover; drop `useModelMenuItems` and `ContextMenu` |

## Verify
- `npx tsc --noEmit` in `apps/desktop`
- Manual: right-click the chip on Analyze with AI and AI Message. The popover stays on screen, search filters, selecting updates the chip, and Esc closes it.
