# Restore Subagent Inspection for `subagent` Tool Invocations

Hive recently switched to the unified `subagent` tool (single, parallel, chain modes with isolated context windows), but the desktop UI, adapter, and viewer still hardcode legacy tool names (`Agent`, `SubagentWorkflow`) and expect `.output` files on disk. This breaks subagent inspection: `subagent` tool calls render as plain cards or get batched into tool rows, and the subagent viewer cannot display execution transcripts.

## Approach
- Add `subagent` to tool classification, batch grouping exclusions, and transcript card routing so subagents render rich `SubagentCard` widgets.
- Extend `resolveSubagentView` to parse single, parallel, and chain arguments (`args.agent`, `args.task`, `args.tasks`, `args.chain`) and extract structured `SubagentDetails` (messages, tool uses, turns, usage, and status) from tool results and live streaming partials.
- Update `useSubagentOutput` to read in-memory messages directly from `SubagentView` and live store tool partials, falling back to disk `.output` files only for legacy `pi-subagents` sessions.
- Enhance `SubagentViewer` with task-step switching for parallel and chain runs so users can inspect each agent's execution transcript, prompt, and output individually.
- Update offline usage aggregation in `usage.ts` and tool inspection in `modules/tools` to recognize `subagent`.

## Decisions

> [!CHOICE] Transcript Data Source
> **Question**: Where should the subagent viewer retrieve execution messages?
> - (x) **In-memory from `SubagentDetails`**: Zero disk I/O, instant live streaming via `onUpdate` partials, works in sandbox. [Recommended]
> - ( ) **Require scratch `.output` files on disk**: Adds file polling and disk overhead for data already in session state.

> [!CHOICE] Multi-Agent (Parallel / Chain) Inspection UX
> **Question**: How should multiple concurrent or chained agents be presented in the viewer?
> - (x) **Task-step pill switcher**: Display a pill strip for tasks/steps (e.g. `[1. scout] [2. worker]`) to view individual transcripts and prompts. [Recommended]
> - ( ) **Flattened sequential transcript**: Merge all messages together, losing per-agent clarity and separate cost metrics.

<!-- MORE -->

## Changes

| File | Change |
|---|---|
| `packages/pi-adapter/src/ai/classify.ts` | `[MODIFY]` Add `"subagent"` to `SUBAGENT_NAMES` set |
| `packages/pi-adapter/src/ai/subagents.ts` | `[MODIFY]` Add `isSubagentTool` helper, export `SubagentDetails` types, update `indexSubagents`, `collectSubagents`, `hasRunningSubagents`, and enhance `resolveSubagentView` to parse `subagent` arguments and attach in-memory messages/details |
| `packages/pi-adapter/src/usage.ts` | `[MODIFY]` Recognize `toolName: "subagent"` and parse usage from `details.results` |
| `apps/desktop/src/renderer/components/Transcript.tsx` | `[MODIFY]` Route `block.name === "subagent"` to `SubagentCard` |
| `apps/desktop/src/renderer/components/transcript/tool-batch.ts` | `[MODIFY]` Exclude `subagent` from `isBatchableTool` to prevent batching subagents into generic tool pills |
| `apps/desktop/src/renderer/hooks/useSubagentOutput.ts` | `[MODIFY]` Consume `view.messages` / `view.subagentDetails` directly, listen for live streaming partials, and fallback to disk files only for legacy runs |
| `apps/desktop/src/renderer/components/SubagentViewer.tsx` | `[MODIFY]` Add task/step selector when multiple results exist (parallel/chain mode) |
| `apps/desktop/src/renderer/store/session-store.ts` | `[MODIFY]` Track `subagent` in `tool_execution_end` and running subagent status maps |
| `modules/tools/src/ui/tool-usage.ts` | `[MODIFY]` Count `subagent` calls under the Subagents section in the Tools breakdown panel |
| `packages/pi-adapter/test/subagents.test.ts` | `[MODIFY]` Add unit tests for `subagent` tool resolution in single, parallel, and chain modes |

## Risks
- **Large message arrays in state**: `subagent` results contain full message histories. `messagesToTimeline` is fast and lightweight, but capping message rendering if a run exceeds 1,000 steps prevents DOM bloat.
- **Backward compatibility**: Legacy sessions with `Agent` and `.output` files must continue to work without regression.

## Verify
- `npm test`: Run existing test suite and verify no regressions across unit tests.
- Add and run tests in `packages/pi-adapter/test/subagents.test.ts` verifying `resolveSubagentView` with `subagent` tool call parameters and `details.results`.
- Test `useSubagentOutput` with both in-memory messages and legacy disk ref fallback.
