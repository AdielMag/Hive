---
name: plan-previewer
description: MANDATORY before executing a plan (first draft and every revision round), and whenever you deliberately check in with the user mid-execution. Opens the plan as an inline review card in the Hive session (Show more opens a popup). NOT for routine plan-file edits (e.g. ticking checklists) after approval.
---

# Hive Plan Previewer

`plan-previewer` opens a plan file for review **inline in the Hive session**: a compact card in the chat, with a **Show more** button that opens the full plan in a popup. The user reads it, resolves decisions, leaves comments, then **Approves** or **Requests changes**. Their feedback comes back to you as a file.

The card is built from your bash call, so run `plan-previewer <file>` directly as its own command (no wrapper script). Piping the output is fine.

## When

- **Before execution (mandatory).** Every time you write or revise a plan for approval, including each revision round.
- **After approval.** Don't relaunch just because you edited the plan file (ticking `- [x]`, progress notes). Relaunch only for a deliberate check-in: a blocking decision, a checkpoint, or a final summary.

## Rule zero: no questions in chat

While a review is open, never ask the user anything in chat. Put the question into the review card instead:

```bash
plan-previewer ./plan.md --ask="Ship behind a feature flag?"
plan-previewer ./plan.md --ask='{"id":"cache","type":"choice","title":"Cache backend","question":"Which store?","options":[{"label":"Redis","recommended":true},{"label":"SQLite"}]}'
plan-previewer ./plan.md --ask-file=./.plan-questions.json   # batch; auto-detected next to the plan, consumed once asked
```

The questions appear as a "needs your input" block at the top of the card. The user must answer them (**Send answers**) before they can approve.

## Protocol

1. **Format first.** Apply the `rich-plan-formatting` skill.
2. **Launch it as a plain foreground command and wait:**
   ```bash
   plan-previewer ./plan.md --context="<one-line task summary>"
   ```
   The command blocks until the user submits, or until a 240s timeout. Make no other tool calls or edits while it runs. On timeout, run the same command again.
3. **Read `.plan-feedback.json`** next to the plan. If it's missing, or its `status` is one you've already handled, run the command again and keep waiting.
4. **Act on `status`:**

| `status` | What you do |
|---|---|
| `approved` | **Leave plan mode now.** Check `executionMode`: `auto-edit` means execute autonomously; `manual` means propose each change and wait for confirmation. Honor `choices[]` and `comment`. |
| `changes_requested` | Apply `comment`, `choices[]`, `questions[]` (answers and notes on selected text), and `answers[]`. Edit the plan in place, then relaunch with `--response="<what changed>"`. The card and popup update live. |
| `answered` | Apply `answers[]` (also printed as `[PLAN-ANSWERS]`), update the plan if needed, then relaunch with `--response="…"`. |

`choices[]` reports the option picked for each `[!CHOICE]` block, by title. Defaults the user left untouched come back as selected too.
