<!-- Managed by Hive Plan Previewer. -->
# Plan review (Hive Plan Previewer)

- Before executing **any** plan, write it as a markdown file using the `rich-plan-formatting` skill, then get it approved through the `plan-previewer` skill (`plan-previewer <file> --context="…"`). Run the command in the foreground and wait for it to exit.
- Do this for every revision round too. After approval, don't relaunch just because you edited the plan file.
- While a review is open, **never ask the user questions in chat**. Use `plan-previewer <file> --ask="…"` instead.
- On `status: "approved"`, leave plan mode immediately and follow `executionMode` (`auto-edit` = autonomous, `manual` = confirm each step).
