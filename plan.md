# Jev-Guided Subagent Session Forking for Prompt Cache Reuse

Allow subagents to fork from the active parent session instead of always spawning with `--no-session`, utilizing prompt cache and conversational context. When dispatching, ask Jev whether to fork or spawn fresh.

## Approach
- Add `subagent_dispatch` capability and decision heuristics to Jev in `modules/jev`.
- Add `fork?: boolean` option to subagent parameters (`SubagentParams`, `TaskItem`, `ChainItem`).
- In `subagent` extension, if `fork` is not explicitly set, ask Jev (`ask_jev` via `ctx.executeTool`) whether the task should fork or spawn fresh based on task description and recent context.
- When forking, launch child process with `--fork <sessionFile>` and `--name <agent>#<8-hex>` so Hive groups it under the parent session and LLMs hit prompt cache for the parent message prefix.
- Gracefully fall back to spawn if Jev is unavailable or if current session has no file on disk.

## Decisions

> [!CHOICE] Default Subagent Routing Policy
> **Question**: How should subagent dispatch decide between fork and spawn when not explicitly forced?
> - (x) **Jev with role heuristics fallback**: Consult Jev system-one classifier; if Jev is disabled or offline, fallback to role defaults (scout=spawn, worker/reviewer=fork) [Recommended]
> - ( ) **Jev only**: Consult Jev; if Jev is offline, default all subagents to spawn
> - ( ) **Explicit flag only**: Always spawn unless caller explicitly sets fork: true in subagent call

<!-- MORE -->

## Changes
| File | Change |
|---|---|
| `modules/jev/agent/extensions/jev.ts` | `[MODIFY]` Add `SUBAGENT_DISPATCH_QUESTIONS` and subagent routing evaluation helpers |
| `modules/jev/src/shared.ts` | `[MODIFY]` Register `subagent_dispatch` in feature labels and usage types |
| `modules/jev/src/ui/JevInsights.tsx` | `[MODIFY]` Support `subagent_dispatch` in feature breakdown view |
| `modules/jev/src/jev-extension.test.ts` | `[MODIFY]` Add unit tests for subagent dispatch feature and questions |
| `packages/pi-adapter/src/ai/subagents.ts` | `[MODIFY]` Add `forked` and `dispatchReason` to `SingleSubagentResult` |
| `C:/Users/Adiel/.pi/agent/extensions/subagent/index.ts` | `[MODIFY]` Add `fork` parameter, Jev query logic, and `--fork <sessionFile> --name <agent>#<hex>` CLI spawn logic |

## Risks
- Very large parent sessions could cause forked subagents to inherit large contexts; Jev evaluation ensures broad exploratory tasks (like scout) spawn fresh instead of inheriting bloat.
- Ephemeral parent sessions (started with `--no-session`) lack a session file on disk; code checks `fs.existsSync(sessionFile)` and falls back to spawn.

## Verify
- `npm test modules/jev` passes with new subagent dispatch tests.
- `npm test subagent` passes for adapter types and session grouping.
- Dry-run verification of subagent parameter parsing with explicit `fork: true`, `fork: false`, and automatic Jev evaluation.
