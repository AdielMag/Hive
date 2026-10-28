# Batch and Highlight Skill Loads in Transcript

When skills enter context (via agent `read` on `SKILL.md` or user `/skill`), they currently get buried as generic `read SKILL.md` pills inside standard tool batches or stack vertically as bulky cards. This change implements smart hybrid batching: consecutive skill loads group into a dedicated horizontal bar with interactive chips, while mixed tool runs display a glowing skill pill instead of a generic file read.

## Approach
- Pass active skill load annotations into timeline grouping in `Transcript.tsx` so grouping knows which calls load skills.
- Group consecutive skill loads into a dedicated `skillBatch` timeline row rendered by `SkillBatchRow` with interactive chips.
- Update `extractToolPill` in `tool-batch.ts` to tag skill loads with `opCategory: "skill"` and target `skill: <name>` when mixed in tool batches.
- Add CSS highlighting for skill batches, pills, and cards with glowing borders and distinct badge styling.
- Add unit test coverage in `ToolBatchGroup.test.ts` for skill pill extraction and batch grouping.

## Decisions

> [!CHOICE] Highlight Palette
> **Question**: Which color theme should highlight loaded skills?
> - (x) **Amber Gold**: matches Hive's Library module (#f59e0b) for consistency [Recommended]
> - ( ) **Violet Sparkle**: distinct magical purple (#a855f7) with high-contrast glow

<!-- MORE -->

## Changes
| File | Change |
|---|---|
| `apps/desktop/src/renderer/components/transcript/tool-batch.ts` | `[MODIFY]` Add skill load detection to `extractToolPill`, add `skillBatch` group item type, and group consecutive skill loads |
| `apps/desktop/src/renderer/components/transcript/SkillBatchRow.tsx` | `[NEW]` Horizontal banner displaying loaded skills in a row with expandable detail drawers |
| `apps/desktop/src/renderer/components/Transcript.tsx` | `[MODIFY]` Provide skill load annotations to grouping and render `SkillBatchRow` |
| `apps/desktop/src/renderer/styles/transcript-ai.css` | `[MODIFY]` Add styling for `.msg-skill-batch`, `.msg-tool-batch__pill-op.is-skill`, and enhanced skill card borders |
| `apps/desktop/src/renderer/components/transcript/ToolBatchGroup.test.ts` | `[MODIFY]` Add tests for skill pill extraction and consecutive skill load grouping |

## Risks
- Tool batch regression: existing non-skill tool batch grouping must remain unchanged. Mitigated by comprehensive unit tests in `ToolBatchGroup.test.ts`.

## Verify
- `npm test -- apps/desktop/src/renderer/components/transcript/ToolBatchGroup.test.ts`
- `npm run typecheck`
