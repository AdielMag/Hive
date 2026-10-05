# Plan review inline in the session

Plan review moves out of its own tab and into the session transcript. The agent's `plan-previewer` call renders as a compact review card: the plan's opening, its decisions, and Approve / Request changes. A **Show more** button opens the full plan in a modal popup. The plan-writing skills change to match. Roughly 6 new files, 5 edited, plus one small core extension point.

## Approach
- **Core extension point**: new `toolCards` contribution in `@hive/module-sdk`. A module claims a tool call with `match({ name, arguments })`, and `Transcript.tsx` renders the module's card instead of the generic Bash row. Core stays unaware of plan review.
- **Inline card** (`PlanInlineCard`): shows the "inline part" of the plan with decisions answerable in place. Below it is a compact review bar (comment, `n/m decided`, Request changes, Approve split button). Phase states (sent / approved / answering `--ask`) show as one line.
- **Popup** (`PlanModal`): the existing document UI (outline, full text, selection notes, review bar) in a portal modal. Esc and backdrop close it, focus is trapped. It is opened by **Show more**, and **Open as tab** stays available inside it.
- **One store**: the card and the popup share `usePlanStore`, so picks and comments carry across with no sync code.
- **Auto-open tab removed**: `openPlanTab` no longer opens a tab. If no card mounts for that file within about 1s (the call was not recognised), fall back to the old tab so a review is never lost.
- **Formatting contract**: the inline part is everything above a `<!-- MORE -->` marker. Without the marker, the inline part is the title, intro and decisions, capped at about 24 lines with a fade. `SUMMARY`/`FULL` still works: Summary is inline, Full is the popup.

## Decisions

> [!CHOICE] Where the card lives
> **Question**: Where does the inline review appear in the session?
> - (x) **In the transcript, at the tool call**: stays in history, scrolls with the conversation, one card per review round [Recommended]
> - ( ) **Docked above the composer**: always visible while pending, but disappears from history and competes with the approval bar

> [!CHOICE] How the author marks the inline part
> **Question**: How does a plan say what shows inline versus in the popup?
> - (x) **`<!-- MORE -->` marker plus auto-truncation fallback**: one simple marker, and plans without it still work [Recommended]
> - ( ) **Reuse `SUMMARY` / `FULL` only**: no new syntax, but authors must write two sections and duplicate the intro

> [!CHOICE] Plan tab
> **Question**: What happens to the dedicated plan tab?
> - (x) **Keep as a fallback and "Open as tab" in the popup**: nothing is lost, but it never opens unprompted [Recommended]
> - ( ) **Remove the tab kind**: less code, but breaks persisted plan tabs and the unrecognised-call fallback

## Changes
| File | Change |
|---|---|
| `packages/module-sdk/src/renderer.ts` | `[MODIFY]` add `ToolCardContribution` and `toolCards` to `RendererContributions` and `ContributionPoint` |
| `apps/desktop/src/renderer/components/Transcript.tsx` | `[MODIFY]` in `ToolCall`, check `useContributions("toolCards")` before the standard row and render the matching card |
| `modules/plan-previewer/src/renderer.tsx` | `[MODIFY]` contribute `toolCards` (match bash commands containing `plan-previewer`); delayed tab fallback in the `openPlanTab` handler |
| `modules/plan-previewer/src/plan-utils.ts` | `[MODIFY]` `extractInlinePart(content)`: `MORE` marker, then `SUMMARY`, then truncation; tests in `plan-utils.test.ts` |
| `modules/plan-previewer/src/ui/PlanInlineCard.tsx` | `[NEW]` card: header, inline markdown and decisions, compact bar, **Show more** |
| `modules/plan-previewer/src/ui/PlanModal.tsx` | `[NEW]` portal modal wrapping the document UI |
| `modules/plan-previewer/src/ui/PlanDocument.tsx` | `[NEW]` document body extracted from `PlanPreviewerTab.tsx`, shared by tab and modal |
| `modules/plan-previewer/src/ui/PlanPreviewerTab.tsx` | `[MODIFY]` becomes a thin wrapper around `PlanDocument` |
| `modules/plan-previewer/src/ui/plan-store.ts` | `[MODIFY]` `modalOpen` state and a `mountedCards` registry |
| `modules/plan-previewer/src/ui/plan.css` | `[MODIFY]` card and modal styles on existing Hive tokens |
| `modules/plan-previewer/agent/skills/rich-plan-formatting/SKILL.md` | `[MODIFY]` inline-first template: opening, decisions, then `<!-- MORE -->`; inline part at most 24 lines |
| `modules/plan-previewer/agent/skills/plan-previewer/SKILL.md` | `[MODIFY]` note that the review shows inline in the session |
| `~/.pi/agent/skills/{rich-plan-formatting,plan-previewer}` | `[MODIFY]` sync the two skill files from the module |

> [!WARNING]
> The `plan-previewer` call blocks the agent. The card must work while the tool call is still running, and it must settle (approved / sent) cleanly when the result arrives, including after a transcript reload with no live store state.

## Verify
- `npm test` (new `extractInlinePart` cases: `MORE`, `SUMMARY`, truncation, a plan with no H2)
- `npm run typecheck`
- Manual: run `plan-previewer modules/plan-previewer/fixtures/sample-plan.md` from a session. Check that the card appears inline, a decision can be picked there, **Show more** opens the modal with the same picks, and Approve from either place settles both. Reload the app and check the card renders as settled history.
