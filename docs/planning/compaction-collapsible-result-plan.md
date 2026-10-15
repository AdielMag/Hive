# Collapsible Compaction Summary in Session Transcript

Context compaction in Hive produces multi-paragraph summaries of earlier turns that bloat the session transcript. This change displays a 3–4 row preview with a fade mask and a "Show more" button by default, keeping the session view clean while preserving one-click access to the full summary.

## Approach
- Create a dedicated `SummaryMessage` component for compaction and branch summaries in the transcript.
- Default to collapsed state showing 3–4 preview rows (`max-height: 84px`) with a smooth bottom fade mask.
- Render a "Show more" / "Show less" toggle button whenever the summary overflows the preview height.
- Include compaction icon and token count context while preserving Markdown formatting and code blocks.

<!-- MORE -->

## Changes

| File | Change |
|---|---|
| `apps/desktop/src/renderer/components/transcript/SummaryMessage.tsx` | `[NEW]` Collapsible summary component with row clamping, overflow detection, and expand/collapse toggle |
| `apps/desktop/src/renderer/components/transcript/SummaryMessage.test.tsx` | `[NEW]` Unit tests for collapsed preview, overflow detection, and toggle state transitions |
| `apps/desktop/src/renderer/components/Transcript.tsx` | `[MODIFY]` Render `SummaryMessage` for timeline summaries |
| `apps/desktop/src/renderer/styles/transcript.css` | `[MODIFY]` Styles for `.msg-summary__content.is-collapsed`, mask fade, and `.msg-summary__toggle` button |

## Risks
- None. Short summaries under 3 rows display completely without a toggle button.

## Verify
- Unit tests: `npx vitest run apps/desktop/src/renderer/components/transcript/SummaryMessage.test.tsx`
- Typecheck: `npx tsc -p apps/desktop/tsconfig.web.json --noEmit`
