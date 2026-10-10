# Redesign the "Run workflow" area

Replace the current inline form (a header, a workflow dropdown, a branch text box, then plain inputs) with a slide-over sheet that is visual and guided. UI only; the API and store stay as they are. About 3 files under `modules/actions/src/ui/`.

## Approach
- **Slide-over sheet** that covers the run list, with a back button and a sticky footer, instead of a box that squeezes the list. Esc closes it.
- **Workflow picker as cards**: each workflow shows its name, its file name, and the state and age of its last run (derived from loaded runs). The selected card gets an accent border and a check. A search box appears when there are more than 6.
- **Branch picker as chips**: the checked-out branch first, then recent branches seen in runs, plus a small field for any other branch or tag.
- **Typed inputs**: switches for booleans, a segmented control for choices with 4 or fewer options (a select for more), required tags, helper text under each label, and a skeleton while the inputs load.
- **Clear outcome**: the footer reads "Run CI on main" and says why it is disabled (missing required input, no `workflow_dispatch` trigger). A workflow without a trigger gets an explanation card with the YAML to add.

<!-- MORE -->

## Changes

| File | Change |
|---|---|
| `src/ui/DispatchForm.tsx` | `[MODIFY]` rewrite as the sheet: workflow cards, branch chips, input controls, footer |
| `src/ui/ActionsPanel.tsx` | `[MODIFY]` render the sheet as an overlay, not an inline box |
| `src/ui/actions.css` | `[MODIFY]` styles for the sheet, cards, chips, segmented control and footer |
| `src/ui/group-runs.ts` | `[MODIFY]` add a small pure helper `lastRunByWorkflow` with a unit test |

## Verify
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run check:modules`
- Manual: open the sheet; pick workflows, switch branches, try boolean, choice and required inputs, and a workflow with no dispatch trigger.
