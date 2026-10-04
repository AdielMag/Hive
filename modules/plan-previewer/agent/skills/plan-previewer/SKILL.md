---
name: plan-previewer
description: MANDATORY before executing a plan (authoring/approval + revision rounds) and any time you deliberately want to check in with the user mid-execution. Native to Hive workbench. NOT for routine plan-file edits (e.g. checklist ticking) after approval.
---

# Hive Plan Previewer Protocol

Plan Previewer is native to the **Hive workbench** (`pi-studio`). Any plan preview opens directly as a tab inside Hive's content card.

Plan Previewer has two distinct triggers — know which one applies before you launch it:

- **Phase A — Before execution (mandatory).** Any time you are authoring or revising a markdown plan file (e.g. `plan.md`, `PLAN.md`) for approval — including the first draft and every `changes_requested`/`questions_asked` revision round — you MUST follow the protocol below before proceeding.
- **Phase B — After approval (execution phase).** Once `status` is `"approved"` and you have started executing, do NOT re-launch Plan Previewer just because the plan file changed again (checking off `- [x]` tasks, appending progress notes, etc). Only launch it again if you have a deliberate, standalone reason to show the user something or ask them a question mid-execution (a blocking decision, a checkpoint, a final summary). When that happens, run the exact same protocol again — don't fall back to a plain chat message instead.

## Rule Zero: never ask the user questions in chat

While a Plan Previewer review is open (Phase A **or** Phase B), you MUST NOT ask the user anything in the CLI/chat — no questionnaire tool, no "which option do you prefer?" message. That splits the review across two surfaces. Push the question into the **open Hive plan tab** instead:

```bash
# free-text question
plan-previewer ./plan.md --ask="Should we ship behind a feature flag?"

# multiple-choice question (inline JSON, repeatable)
plan-previewer ./plan.md --ask='{"id":"cache","type":"choice","title":"Cache backend","question":"Which store?","options":[{"label":"Redis","recommended":true},{"label":"SQLite"}]}'

# batch of questions
plan-previewer ./plan.md --ask-file=./.plan-questions.json
```

- Questions render in the **"<Agent> needs your input"** panel in the Hive plan tab (Approve stays disabled until answered).
- Answers return in `.plan-feedback.json` as `answers[]`, and print as `[PLAN-ANSWERS]` on stdout.
- `.plan-questions.json` next to the plan is auto-detected and consumed after being asked once.

## Protocol (both phases)

0. **Apply the `rich-plan-formatting` skill to the plan content first.** Before launching the previewer, structure the plan with dual views (`<!-- SUMMARY -->` for a 30-second executive scan, and `<!-- FULL -->` for technical blueprint, with `[!CHOICE]` and `[!QUESTION]` blocks, callouts, and milestone checklists).

1. **Launch Previewer as a plain, blocking foreground command:**
   ```bash
   plan-previewer ./plan.md --context="Brief task summary"
   ```
   - In Hive, this sends a notification to the Hive workbench, which automatically opens/switches to the `📋 plan.md` tab.
   - The bash tool call runs in the foreground and blocks until the user approves or requests changes in the Hive tab.

2. **CRITICAL: STOP & WAIT FOR THE COMMAND TO EXIT**
   - Do NOT execute any subsequent plan steps or tool calls while it is running.
   - Do NOT edit project code or run further bash commands.
   - The command exits when the user submits feedback (Request Changes or Approve) in Hive, **or** after a bounded wait timeout (240s under Pi CLI). If timeout occurs without user feedback, simply re-run the exact same command to keep waiting.

3. **Inspect Feedback & Leave Plan Mode on Approval**
   - Once the command exits, check `.plan-feedback.json` (or `.plan-feedback.md`) next to the plan file.
   - If it doesn't exist yet, or its `status` is the same one you already handled: re-run the exact same command to keep waiting.
   - **Whenever a plan is approved (`status: "approved"`):**
     - **LEAVE PLAN MODE IMMEDIATELY.**
     - The user selects the transition mode in the Hive tab when approving: either **Auto Edit** (`mode: "auto-edit"`) for autonomous execution, or **Manual** (`mode: "manual"`) for step-by-step diff proposals.
     - Check `executionMode` in `.plan-feedback.json` (or CLI output):
       - If `auto-edit`: execute the plan autonomously.
       - If `manual`: propose changes step-by-step with explicit confirmation.
     - DO NOT stay in Plan Mode once the plan is approved!
   - If `status` is `"answered"`, read `answers[]`, apply them, and re-run the command (adding `--response="..."`) so the user sees the revised plan in Hive.
   - If `status` is `"changes_requested"`, address user comments/questions, update the plan file, and re-run the exact same command. The open tab in Hive automatically updates live with your changes.
