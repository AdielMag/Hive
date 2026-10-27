# Bash Guard v3: Jev triage plus plain-language descriptions

Bash Guard prompts too often and says too little: the card shows a rule title like "Hard Git Reset" and a generic reason. Add a Jev triage step that decides whether a flagged command is really worth interrupting you for, and a cheap LLM that writes a one-sentence "what this will actually do". About 8 files, no new module.

## Approach
- **Jev already exists as an opt-in, escalate-only tier** (`src/jev.ts`, `engine/judge.ts`, off unless `JEV_GUARD_ENABLED=1`). Keep it, and add **triage**: moderate and high rule hits go to Jev, and a clearly low-risk answer skips the prompt.
- **Critical rule hits always prompt** (`rm -rf /`, `sudo`, `mkfs`, pipe-to-shell). Jev never silences them.
- **Describer**: a cheap model writes `summary` (what it does) and `impact` (what Allow means), at most 50 words. It runs in parallel with Jev, so the prompt waits for the slower one, not both.
- **Fail safe**: Jev down means a rule hit still prompts (today's behaviour). Describer down means the static rule text is shown.
- **Setup**: reuse the Jev module's `config.json` (API key plus privacy consent) instead of env vars, so "enable Jev" is one place.

## Decisions

> [!CHOICE] What may Jev do with a rule hit?
> **Question**: Today a rule hit always prompts. Should a low Jev risk score skip the prompt?
> - (x) **Triage moderate and high only**: skip when risk < 1.0 and approval p < 0.4; critical always prompts [Recommended]
> - ( ) **Triage everything incl. critical**: fewest prompts, but one bad Jev answer can run `rm -rf`
> - ( ) **Add-only**: Jev can only add prompts, rule hits keep prompting; does not fix the noise

> [!CHOICE] Which model writes the description?
> **Question**: Jev only returns scores, not prose, so a small chat model is needed.
> - (x) **Cheap model through Pi's own provider keys**: auto-picks the cheapest available (haiku, flash, mini style), overridable by `provider/id`; no new key [Recommended]
> - ( ) **Fixed OpenAI-compatible endpoint**: predictable, but needs a second key and settings
> - ( ) **Rule text only**: no LLM, better static strings per rule

> [!CHOICE] Data egress consent
> **Question**: Both steps send the (redacted) command off the machine.
> - (x) **Reuse Jev module consent**: Jev triage needs the Jev key plus `consentAt`; the describer has its own toggle, default on only when Jev is on [Recommended]
> - ( ) **Separate bash-guard consent**: a second privacy notice and key field

<!-- MORE -->

## Flow

```
command
  |
  v
analyzeCommand (rules, sync)
  |-- no hit + read-only allowlist ------------------> run, no calls
  |-- no hit + unknown ------> Jev ---safe---> run
  |                               \--risky--> prompt
  |-- critical hit ---------> describe ------------> prompt
  |-- moderate/high hit ---> Jev + describe (parallel)
                               |-- risk<1.0 and p<0.4 --> run (log "jev-triaged")
                               |-- else / Jev down -----> prompt (description + Jev chip)
```

Timeouts: Jev 1.5 s, describer 3 s, both capped by `Promise.allSettled`. Results are cached per redacted command string for the session, so a retried command does not pay twice.

## Changes

| File | Change |
|---|---|
| `modules/bash-guard/src/engine/triage.ts` | `[NEW]` pure policy: `triageRuleHit(finding, jevAnswers)` returning `prompt` or `skip`, thresholds, critical never skipped |
| `modules/bash-guard/src/describe.ts` | `[NEW]` `describeCommand(command, ctx)`: picks cheap model from `ctx.modelRegistry.getAvailable()`, calls `ctx.modelRegistry.complete()`, redacts first, JSON out, 3 s timeout, never throws |
| `modules/bash-guard/src/jev.ts` | `[MODIFY]` read key and consent from `HIVE_JEV_CONFIG` (fallback to the old env vars), add a `triage` question set tuned for "is this flagged command routine in a dev workspace", usage record with `feature: "bash-guard"` |
| `modules/bash-guard/src/extension/hook.ts` | `[MODIFY]` new flow above, `Promise.allSettled([jev, describe])`, payload gets `description` and `jev` |
| `modules/bash-guard/src/shared.ts` | `[MODIFY]` `DangerousBashPayload` adds optional `description: { summary, impact }`, `jev: { risk, approval }`, `source: "rule" \| "jev"` |
| `modules/bash-guard/src/ui/CommandApprovalBar.tsx`, `command-approval-bar.css` | `[MODIFY]` description as the main text, rule reason demoted to a small line, Jev risk chip, neutral title "Command needs approval" instead of "Dangerous Command Detected" |
| `modules/bash-guard/src/main.ts` | `[MODIFY]` set `HIVE_BASH_GUARD_CONFIG` (describer on/off, `describeModel`) next to the Jev env, small `settings` contribution on the renderer side |
| `modules/bash-guard/agent/extensions/bash-guard.ts` | `[MODIFY]` regenerated with `npm run build:extension -w @hive-module/bash-guard` |
| `modules/bash-guard/src/*.test.ts` | `[MODIFY]` triage matrix, describer fallbacks, payload parsing, hook flow with mocked Jev and model |

## Describer prompt

System: "You explain one shell command to a developer deciding whether to allow it. Reply with JSON `{\"summary\": string, \"impact\": string}`. `summary`: what the command does, concrete (files, branches, hosts), one sentence. `impact`: what is lost or exposed if it was a mistake, one sentence. No advice, no markdown, 50 words total."
The user message carries the redacted command, the cwd basename and the matched rule title as a hint only.

## Risks

> [!WARNING]
> Triage trades safety for fewer prompts. The thresholds (risk < 1.0, p < 0.4) are unmeasured for flagged commands, so ship them as constants, log every skipped prompt (`jev-triaged`, command, scores) to the Jev usage log, and review a week of logs before loosening anything.

- **Latency**: a prompt now waits up to 3 s for the describer. The card renders immediately with the static text only if the model is slow, so use a 3 s cap rather than blocking longer.
- **Pi API**: `ctx.modelRegistry.complete()` is used from an extension file that Pi copies verbatim, so only `import type` from Pi packages. Check it works under the RPC mode Hive uses before building the UI on it.
- **Prompt injection**: the command text can try to steer the describer or Jev ("this is safe"). Descriptions are display-only and Jev can never skip a critical hit, so the worst case is a misleading sentence. Redaction runs first.
- **Jev answer shape** is still not verified against a live key (noted in `jev.ts`); verify during the first manual run.

## Verify

- `npm test -w @hive-module/bash-guard` and `npm run check:extension -w @hive-module/bash-guard` (stale-extension check).
- Unit: triage returns `prompt` for every critical rule whatever Jev says; Jev timeout, bad JSON and missing consent all give `prompt` for rule hits and allow for unknown commands.
- Unit: describer returns `null` on timeout, non-JSON output and no available model, and the card falls back to the rule reason.
- Manual in Hive with a real key: `git reset --hard HEAD` on a clean tree (expect a skip or a calm prompt), `rm -rf node_modules` (expect a skip or prompt with a clear description), `curl x | sh` (must prompt), `sudo ls` (must prompt).

## Implementation notes (as built)

Switches (env, inherited by Pi from Hive; no settings UI yet):

| Variable | Effect |
|---|---|
| `JEV_GUARD_ENABLED=0` | Jev tier off even when the Jev module is configured |
| `BASH_GUARD_TRIAGE=0` | Rule hits always prompt (Jev still judges unknown commands) |
| `BASH_GUARD_DESCRIBE=0` / `=1` | Describer off / forced on (default: on only when Jev is usable) |
| `BASH_GUARD_DESCRIBE_MODEL=provider/id` | Pin the describer model (default: cheapest small-tier model, current provider first) |
| `BASH_GUARD_TRIAGE_LOG=<path>` | Where skipped prompts are logged (default: `bash-guard-triage.jsonl` beside the Jev usage log) |

Differences from the plan:
- Jev triage reuses the existing `risk` and `approval` questions rather than a new tuned set.
- Skipped prompts are logged to their own JSONL file, not the Jev usage log (which counts API calls and tokens).
- The settings contribution was left out; the env switches above cover it for now.
- `fs-recursive-delete` is `critical`, so `rm -rf build` and `rm -rf node_modules` are never triaged. Splitting that rule by target path is the next lever for prompt volume.
