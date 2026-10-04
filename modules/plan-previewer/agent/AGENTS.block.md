<!-- Managed by Hive Plan Previewer. -->
# Hive Plan Previewer Execution

Plan Previewer is native to Hive workbench. Any plan review opens directly as a tab inside Hive's content card.

Plan Previewer has two distinct triggers:
- **Phase A - Before execution (mandatory).** Any time you are authoring or revising an execution plan or plan markdown file (such as `./plan.md`, `PLAN.md`, or temporary plan files) for approval - including the very first draft and every `changes_requested`/`questions_asked` revision round - you MUST run the protocol below before proceeding.
- **Phase B - After approval (execution phase).** Once `status` is `'approved'` and you have started executing, do NOT re-launch Plan Previewer just because the plan file changed again (e.g. checking off `- [x]` tasks, appending progress notes, logging status). Only launch it again if you have a deliberate, standalone reason to show the user something or ask them a question mid-execution (a blocking decision, a checkpoint, a final summary).

## Never ask the user questions in chat

While a Plan Previewer review is open (Phase A **or** Phase B), you MUST NOT ask the user questions in the CLI/chat - no questionnaire tool, no "which option do you prefer?" message. Asking in chat breaks the review context and forces a second surface. Instead push the question INTO the open Hive plan tab:

```bash
plan-previewer ./plan.md --ask="Should we ship behind a feature flag?"
plan-previewer ./plan.md --ask='{"id":"cache","type":"choice","title":"Cache backend","question":"Which store?","options":[{"label":"Redis","recommended":true},{"label":"SQLite"}]}'
plan-previewer ./plan.md --ask-file=./.plan-questions.json
```

The questions render as a "needs your input" panel in the Hive plan tab, the user answers there, and the answers come back to you in `.plan-feedback.json` under `answers[]` (also printed as `[PLAN-ANSWERS]` on stdout).

## Protocol (both phases)

0. Apply the `rich-plan-formatting` skill to the plan content first - structure it with two distinct text sections (`<!-- SUMMARY -->` for a 30-second executive scan, and `<!-- FULL -->` for the complete technical blueprint, along with choice/question blocks, alert callouts, and status badges) before launching the previewer.
1. Run `plan-previewer <path-to-plan> --context="<task summary>"` in terminal as a plain command.
   - The command communicates with Hive, opens/switches to the plan tab in Hive workbench, and blocks synchronously in the foreground until feedback is submitted.
2. **CRITICAL: STOP AND WAIT FOR IT TO EXIT.** Do NOT execute plan steps, edit files, or make further tool calls until the command finishes. It exits when the user submits feedback in Hive, or after a bounded wait with no decision yet (4 minutes under Pi CLI) - in that case, re-run the same command and keep waiting.
3. Read `.plan-feedback.json` (or `.plan-feedback.md`), written next to the plan file, to inspect the user's comments, questions, and approval status.
4. If the file doesn't exist yet, or its `status` is the same one you already handled in a previous round: the user hasn't responded yet - re-run the exact same command again and keep waiting.
4b. If you need input from the user at any point, re-run the same command with `--ask="..."` (repeatable) instead of asking in chat, and wait for `answers[]` in the feedback file.
5. **On Approval (`status: 'approved'`): LEAVE PLAN MODE IMMEDIATELY.**
   - In Hive, the user chooses their preferred execution mode when approving the plan: **Auto Edit** (`mode: "auto-edit"`) or **Manual** (`mode: "manual"`).
   - Check `executionMode` in `.plan-feedback.json` (or CLI output):
     - If `auto-edit`: execute the plan autonomously.
     - If `manual`: propose changes step-by-step with user confirmation.
   - Switch out of Plan Mode and begin executing the plan steps (Phase B).
6. If `status` is `'changes_requested'` or `'questions_asked'` and you haven't already addressed it, update the plan, then re-run the exact same command (same plan file, default port) and wait again - the already-open Hive tab shows the update automatically.
