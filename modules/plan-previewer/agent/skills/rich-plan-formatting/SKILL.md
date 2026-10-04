---
name: rich-plan-formatting
description: MANDATORY whenever you write or revise a plan file (plan.md, PLAN.md, …) for Hive Plan Previewer. Lean, scannable plans sized to the task, with one interactive block per real decision.
---

# Writing plans for Hive Plan Previewer

The user reads your plan in a Hive tab and should be able to approve it in about a minute. Optimize for that. Keep it short and concrete, and make every line earn its place. The previewer turns a few blocks into interactive UI (decisions, questions, callouts, file badges). Use those blocks, and don't use anything else that needs special rendering.

## Rules

1. **Size to the task.** A small change takes 15–40 lines. Leave out any section you have nothing real to say in.
2. **One H1**, the plan title, with no suffix like "(Summary)". Use H2 for sections and H3 sparingly; the outline is built from them.
3. **Open with 1–3 plain sentences**: what changes, why, and the rough size. Don't add an "Executive Summary" callout.
4. **Decisions are for trade-offs the user should own**, at most 3. Write each one **exactly once**, and always preselect your recommendation with `(x)`. Decide the trivial things yourself and state them under Approach.
5. **Questions only when you're blocked** on information only the user has.
6. **Callouts: at most 2**, for real risks or invariants.
7. **Be concrete**: file paths, symbols, commands. Write "add `retry()` to `src/net.ts`", not "improve robustness".
8. **No emoji and no mermaid** (mermaid shows up as raw code). Use a table, a short list, or a small ASCII sketch in a code block instead.

## Default template

````markdown
# <Title>

<1–3 sentences: what changes, why, rough size.>

## Approach
- <key idea or step>
- <key idea or step>

## Decisions

> [!CHOICE] <Short title>
> **Question**: <one line>
> - (x) **<Option>**: <why, one line> [Recommended]
> - ( ) **<Option>**: <trade-off, one line>

## Changes
| File | Change |
|---|---|
| `src/a.ts` | `[MODIFY]` add X |
| `src/b.ts` | `[NEW]` Y service |

## Verify
- `npm test`
- Manual: <one or two concrete checks>
````

Leave out `## Decisions` when there aren't any. Add `## Risks` only when there is a real one.

## Interactive blocks

**Choice.** Rendered inline as a card with radio options:

```markdown
> [!CHOICE] Cache backend
> **Question**: Which store backs the query cache?
> - (x) **Redis**: fast, already deployed [Recommended]
> - ( ) **SQLite**: zero new infra, slower under load
```

- Format each option as `**Name**: one-line reason`. The name is shown in bold and the reason muted.
- `(x)` preselects the option, and the card counts as resolved until the user changes it. `[Recommended]` adds a small tag.
- Give 2–4 genuinely different options. Don't offer a "do nothing" option unless it's realistic.

**Question.** Rendered inline as a card with a text field:

```markdown
> [!QUESTION] Legacy rows
> **Question**: Do existing rows need migrating before deploy?
```

For questions you need answered *mid-review*, use `plan-previewer … --ask` (see the `plan-previewer` skill) instead of editing the plan.

## Callouts

| Syntax | Use for |
|---|---|
| `> [!WARNING]` | breaking changes, regressions to watch |
| `> [!CAUTION]` | destructive or irreversible steps (data loss, force-push) |
| `> [!IMPORTANT]` | an invariant that must hold |
| `> [!NOTE]` / `> [!TIP]` | rarely; only when it changes how the plan is read |

## File badges

Put `` `[NEW]` ``, `` `[MODIFY]` ``, and `` `[DELETE]` `` (in backticks) in the Changes table only. They render as colored badges.

## Large plans: Summary + Full views

Use this only when the plan would run past about 80 lines or spans several subsystems. Wrap the plan in two sections. The previewer shows a `Summary | Full` toggle and opens on Summary.

```markdown
<!-- SUMMARY -->
# <Title>
<intro> · ## Approach · ## Decisions · ## Milestones   (≤ 30 lines)
<!-- /SUMMARY -->

<!-- FULL -->
# <Title>
## Details · ## Changes · ## Risks · ## Verify
<!-- /FULL -->
```

- Put each decision block **in SUMMARY only**. In FULL, refer to it by title ("per *Cache backend*").
- Don't repeat paragraphs between the two sections. FULL adds depth; it isn't a restatement.

## Avoid

- Boilerplate sections ("Objective & Background", "Data Model") with nothing behind them.
- Decisions with only one realistic answer, or options that differ only in wording.
- Bold on every line, risk tags like `[HIGH RISK]` sprinkled through prose, or long option paragraphs.
- Re-pasting the whole plan into a revision. Edit in place; the tab updates live.
