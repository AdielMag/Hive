# Make agents actually use Jev well

A test gave three subagents a 56-file triage task without mentioning Jev. Two Gemini agents called `ask_jev` once each, badly: one asked something it already knew, the other sent its own summary instead of the raw diff. The Sonnet agent never used it. This plan fixes the tool guidance, adds a batch mode so one call can cover many files, and tells agents about Jev in `AGENTS.md`.

## Approach
- **Guidance (A):** rewrite the `ask_jev` description, snippet and guidelines. Always send raw `files` or `command` output, never a summary. Don't ask what you already know. Put all questions in one call. Include a worked example.
- **Batch mode (B):** a new optional `items` parameter. Each item has its own `files`, `command` or `state`, with an optional `id`. The same `questions` run on every item in parallel. Max 40 items, 4 at a time, one daily-cap check up front.
- **Rule for agents (C):** a short Jev paragraph in the token-discipline part of `~/.pi/agent/AGENTS.md`, which subagents also read.
- **Then retest** with the same triage prompt and compare against the first run.

## Decisions

> [!CHOICE] Where the new Jev rule goes
> **Question**: Where should the "use Jev for bulk triage" rule live?
> - (x) **Global `~/.pi/agent/AGENTS.md`**: every Hive session and subagent sees it [Recommended]
> - ( ) **Only the tool guidelines**: nothing outside the Jev module changes, but Claude ignored the tool text last time
> - ( ) **Both, plus the worker and scout agent files**: strongest, but more files to keep in sync

> [!CHOICE] Cost control for batch mode
> **Question**: How should one batch call be limited?
> - (x) **40 items per call, count each item against the daily cap**: predictable, same cap semantics as today [Recommended]
> - ( ) **Count the whole batch as one call**: simpler, but lets one call burn many requests past the cap

<!-- MORE -->

## Changes
| File | Change |
|---|---|
| `modules/jev/agent/extensions/jev.ts` | `[MODIFY]` new description, `promptSnippet`, `promptGuidelines`; `items` parameter; refactor the gather and call part of `execute` into `runOne(item)` and run items with concurrency 4; batch result text is one block per item; `details.batch` holds per-item answers, sources, confidence and errors |
| `modules/jev/src/shared.ts` | `[MODIFY]` `AskJevDetails` gains optional `batch` |
| `modules/jev/src/ui/jev-card-model.ts`, `JevToolCard.tsx` | `[MODIFY]` for batch calls: collapsed row shows "N items" and a count of flagged answers; Out tab has one collapsible group per item; In tab lists the items |
| `~/.pi/agent/AGENTS.md` | `[MODIFY]` add a Jev paragraph under token discipline |
| jev tests | `[MODIFY]` batch success, partial failure, cap, over 40 items, an item with no content, old single-item shape unchanged |

## Guideline text (draft)
- Use `ask_jev` instead of reading when you only need a verdict on large content: classify, rate risk, check "is this X", sort many files or diffs into groups.
- Pass the raw material: `files` or `command` (for example `git diff -- path`). Never pass your own summary.
- Put every question in one call. Use `items` to run the same questions over many files or commands.
- Don't ask what you already know. If you need to read the content anyway, just read it.
- Treat answers as hints: apply your own threshold, and open anything near 50/50 or high risk yourself.

## Risks
- Gemini agents may still call it in low-value ways. The retest shows how much better the guidance makes them.
- Batch mode can spend many calls fast. The 40-item limit and the daily cap bound it.
- The installed extension copy updates only when Hive restarts, so the retest needs a restart first. Hive's startup sync copies the extension, and running Pi sessions need a restart too.

## Verify
- Jev tests and typecheck pass.
- After a Hive restart, rerun the triage test with a worker, a scout and a general-purpose agent, without mentioning Jev. Success: at least two of the three send raw files or commands, and a batch call replaces many single reads.
- Check `usage.jsonl` for the call count, sources and savings.
