---
name: rich-plan-formatting
description: MANDATORY whenever you write or revise a plan file (plan.md, PLAN.md, …) for Hive Plan Previewer. Lean, scannable plans written inline-first (a compact card in the session, full text in a popup), with one interactive block per real decision.
---

# Writing plans for Hive Plan Previewer

The plan appears **inline in the chat session** as a compact review card. The user decides there, and a **Show more** button opens the whole plan in a popup. Write for that: the card must be enough to approve, and everything else can wait below a marker. Keep it short and concrete. The previewer turns a few blocks into interactive UI (decisions, questions, callouts, file badges), so use those and nothing else that needs special rendering.

## Inline first: the `<!-- MORE -->` marker

Put `<!-- MORE -->` on its own line. **Everything above it is the card**; everything below shows only in the popup.

- **Above the marker (aim for 24 lines or fewer):** the H1 title, a 1–3 sentence opening, `## Approach` (3–5 bullets), `## Decisions`, and a single `> [!WARNING]` if there is a real risk.
- **Below the marker:** `## Changes`, details, `## Risks`, `## Verify`, and anything long.
- **Decisions and questions always go above the marker**, so the user can answer them in the card.
- Don't put tables, code blocks, H3 headings, or more than one callout above the marker.
- A plan with no marker still works: the card shows the head of the plan, cut near 24 lines at a block boundary. Add the marker anyway, so you decide where the cut falls.
- Don't write a "Show more" or "see below" line yourself. The card adds that.

## Rules

1. **Size to the task.** A small change takes 15–40 lines in total. A plan this short can end with the marker, or skip it entirely.
2. **One H1**, the plan title, with no suffix like "(Summary)". Use H2 for sections and H3 sparingly (only below the marker); the popup outline is built from them.
3. **Open with 1–3 plain sentences**: what changes, why, and the rough size. Don't add an "Executive Summary" callout.
4. **Decisions are for trade-offs the user should own**, at most 3. Write each one **exactly once**, and always preselect your recommendation with `(x)`. Decide the trivial things yourself and state them under Approach.
5. **Questions only when you're blocked** on information only the user has.
6. **Callouts: at most 2**, for real risks or invariants.
7. **Be concrete**: file paths, symbols, commands. Write "add `retry()` to `src/net.ts`", not "improve robustness".
8. **No emoji and no mermaid** (mermaid shows up as raw code). Use a table, a short list, or a small ASCII sketch in a code block (below the marker) instead.

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

<!-- MORE -->

## Changes
| File | Change |
|---|---|
| `src/a.ts` | `[MODIFY]` add X |
| `src/b.ts` | `[NEW]` Y service |

## Risks
- <only when real>

## Verify
- `npm test`
- Manual: <one or two concrete checks>
````

Leave out `## Decisions` when there aren't any. Add `## Risks` only when there is a real one.

## Interactive blocks

**Choice.** Rendered as a card with radio options, in the inline card and in the popup:

```markdown
> [!CHOICE] Cache backend
> **Question**: Which store backs the query cache?
> - (x) **Redis**: fast, already deployed [Recommended]
> - ( ) **SQLite**: zero new infra, slower under load
```

- Format each option as `**Name**: one-line reason`. The name is shown in bold and the reason muted.
- `(x)` preselects the option, and the card counts as resolved until the user changes it. `[Recommended]` adds a small tag.
- Give 2–4 genuinely different options. Don't offer a "do nothing" option unless it's realistic.
- Keep option reasons to one line. The card is narrow.

**Question.** Rendered as a card with a text field:

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

## Legacy: `SUMMARY` / `FULL`

`<!-- SUMMARY --> … <!-- /SUMMARY -->` plus `<!-- FULL --> … <!-- /FULL -->` still works: Summary is the card and Full is the popup. Prefer `<!-- MORE -->`, which needs no duplicated intro. Never use both in one plan.

## Avoid

- Boilerplate sections ("Objective & Background", "Data Model") with nothing behind them.
- Decisions with only one realistic answer, or options that differ only in wording.
- Bold on every line, risk tags like `[HIGH RISK]` sprinkled through prose, or long option paragraphs.
- A long inline part. If the card needs a scroll to reach the decisions, move prose below the marker.
- Re-pasting the whole plan into a revision. Edit in place; the card and popup update live.
