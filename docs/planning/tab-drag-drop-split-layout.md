# Tab Drag & Drop Reordering and Multi-Pane Split Layout

Enable full drag-and-drop tab reordering, cross-pane tab transfers, and arbitrary vertical/horizontal split panes ("side-by-side" or "stacked") with draggable resizers, visual drop indicators, and quick-action split controls.

## Approach
- Create a dedicated **Pane Layout Store & Tree Model** (`pane-layout-store.ts`) representing binary/n-ary split containers and leaf tab panes with relative size percentages, supporting horizontal (`row`) and vertical (`col`) splits.
- Enhance **TabStrip** with HTML5 drag-and-drop: draggable tab handles, real-time insertion point indicator line, and cross-tabstrip transfer support.
- Implement **PaneDropOverlay** on each pane content area: detects drag hover over top/bottom/left/right edge zones (and center), rendering translucent accent drop preview boxes showing where the pane will split.
- Add **Splitter Resizers** (`PaneResizer`) between split panes for interactive mouse dragging along horizontal and vertical axes.
- Support **Quick-Split Actions** in the tab strip (Split Right, Split Down buttons and tab context menu) for keyboard/click accessibility in addition to dragging.
- Integrate with **WorkbenchLayout**: replace the single fixed tabstrip and single content card with the dynamic multi-pane renderer, rendering `FileViewerTab`, `DiffViewerTab`, `SubagentTab`, `ModuleTabView`, and `SessionView` independently per pane.
- Maintain **Active Pane & Tab Focus**: clicking any pane or tab sets it as active, seamlessly switching the active session and composer focus while preserving transcript views in other panes.
- Persist the split layout tree in `localStorage` with automatic pruning when tabs or panes close.

## Decisions

> [!CHOICE] Split Drag Detection & Feedback
> **Question**: How should tab dragging trigger pane splitting?
> - (x) **Edge-zone detection with live preview box**: Dragging within 25% of any edge highlights that half with an accent overlay; dropping splits horizontally or vertically [Recommended]
> - ( ) **Tab strip only**: Dragging only allows reordering; splitting requires clicking toolbar buttons

> [!CHOICE] Quick Split Accessibility
> **Question**: Should split actions also be available via buttons / context menu in addition to drag-and-drop?
> - (x) **Both Drag & Drop and Quick Buttons**: Full drag-and-drop splitting plus tab strip action buttons and tab right-click context menu ("Split Right", "Split Down") [Recommended]
> - ( ) **Drag & Drop only**: Pure drag-and-drop without extra buttons or menus

## Changes
| File | Change |
|---|---|
| `apps/desktop/src/renderer/store/pane-layout-store.ts` | `[NEW]` State store and tree algorithms for pane splitting, reordering, tab assignment, resizing, and persistence |
| `apps/desktop/src/renderer/components/PaneDropOverlay.tsx` | `[NEW]` Drop target overlay detecting edge/center drag positions and showing visual split preview boxes |
| `apps/desktop/src/renderer/components/PaneResizer.tsx` | `[NEW]` Draggable divider between split panes supporting horizontal and vertical percentage resizing |
| `apps/desktop/src/renderer/components/WorkbenchPane.tsx` | `[NEW]` Individual workbench pane component housing its own TabStrip, content viewport, and drop overlay |
| `apps/desktop/src/renderer/components/TabStrip.tsx` | `[MODIFY]` Add HTML5 drag-and-drop handlers, insertion indicator, split buttons, and pane-aware tab list |
| `apps/desktop/src/renderer/components/WorkbenchLayout.tsx` | `[MODIFY]` Replace static content card with recursive split pane tree renderer and active pane focus coordination |
| `apps/desktop/src/renderer/store/session-store.ts` | `[MODIFY]` Support per-tab transcript caching and synchronize open tabs with pane layout store |
| `apps/desktop/src/renderer/styles/shell.css` | `[MODIFY]` Styles for multi-pane containers, split dividers, drop overlays, drag ghost, and tab insertion indicators |

## Verify
- `npm run typecheck`
- `npm test`
- Drag a tab horizontally within the tab strip and verify it reorders with visual insertion indicator.
- Drag a tab to the right edge of the editor and verify a vertical divider splits the window side-by-side with two panes.
- Drag a tab to the bottom edge and verify a horizontal divider splits the window top/bottom.
- Drag the splitter divider between panes and verify both panes resize smoothly.
- Drag a tab back from one pane to another and verify the empty pane collapses automatically.
- Open files, diffs, or sessions in split panes and verify independent rendering and focus switching.
