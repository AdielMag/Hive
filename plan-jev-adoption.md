# Increase Jev and ask_jev Adoption

Make Jev fast, easy to call, and actively integrated across agent workflows instead of sitting idle.

## Approach
- Relax question schemas to support `boolean`, `yes_no`, and string shorthands alongside `noul`.
- Rewrite tool guidelines and descriptions with positive, actionable rules instead of discouraging disclaimers.
- Equip `reviewer` and `scout` subagents with `ask_jev` tool access and screening instructions.
- Add explicit Jev screening and diff triage triggers to `AGENTS.md`.
- Add an extension nudge for high-volume file inspection without Jev screening.

## Decisions

> [!CHOICE] Subagent Integration Scope
> **Question**: Which subagents should receive `ask_jev` tool access?
> - (x) **Reviewer and Scout**: Equips diff risk scoring and candidate screening without cluttering worker [Recommended]
> - ( ) **All Subagents**: Gives ask_jev to worker, planner, and debugger as well
> - ( ) **Reviewer Only**: Restricts ask_jev strictly to code diff reviews

> [!CHOICE] Steer Nudge Strategy
> **Question**: How should the agent be reminded to use Jev when inspecting many files?
> - (x) **Unified subagent & Jev nudge**: Add Jev candidate screening trigger into existing `subagent-nudge.ts` [Recommended]
> - ( ) **Standalone ask-jev-nudge extension**: Keep Jev file inspection counter in its own separate extension file
> - ( ) **Prompt only**: Rely solely on AGENTS.md and tool guidelines without runtime steer messages

<!-- MORE -->

## Changes
| File | Change |
|---|---|
| `modules/jev/agent/extensions/jev.ts` | `[MODIFY]` Support boolean/yes_no aliases, string shorthands, and action-oriented prompt guidelines |
| `modules/jev/src/shared.ts` | `[MODIFY]` Update type definitions if needed for schema aliases |
| `C:/Users/Adiel/.pi/agent/AGENTS.md` | `[MODIFY]` Add `# Jev Triage (ask_jev)` section with concrete heuristics for screening and diff review |
| `C:/Users/Adiel/.pi/agent/agents/reviewer.md` | `[MODIFY]` Add `ask_jev` to tools and diff risk pre-screening step |
| `C:/Users/Adiel/.pi/agent/agents/scout.md` | `[MODIFY]` Add `ask_jev` to tools and candidate triage step |
| `C:/Users/Adiel/.pi/agent/extensions/subagent-nudge.ts` | `[MODIFY]` Suggest Jev triage when reading multiple candidate files |

## Risks
- Subagents with `ask_jev` will make external API calls to TypeSafe; daily call cap (15,000) prevents runaway usage.

## Verify
- Verify `toApiQuestions` accepts boolean, yes_no, and string shorthand questions without error.
- Verify subagent definitions parse correctly with `ask_jev` in tools list.
- Run a test `ask_jev` call to confirm API response and token tracking.
