# Jev Module: Smart Compaction and ask_jev (as built)

The `jev` module adds TypeSafe's Jev decision model to Hive. It ships a settings page for the API key and two Pi-side features: a smart compaction hint and an `ask_jev` agent tool. The prompt model router is deferred to v2. This document describes what is implemented; the original plan targeted OpenRouter and was changed during the build.

## Status

- [x] Module skeleton, API client, key handling and Settings page
- [x] Smart compaction extension, tiering, composer hint with "Compact" and "Dismiss"
- [x] `ask_jev` tool with usage and cost tracking
- [x] Privacy consent gate and workspace confinement for `ask_jev`
- [x] Unit and flow tests (fake `pi`, mocked `fetch`)
- [ ] (v2) Model router in the composer, cache-aware

## What Jev is

Jev is a typed decision model, not a chat model. A request carries a `state` and named typed questions. The reply carries typed answers.

| Type | Returns |
|---|---|
| `noul` | Probability of yes. The caller picks the threshold. |
| `choice` | One of 2-255 caller-defined options, with confidence and probabilities. |
| `score` | A position on 2-10 described levels, plus confidence. |

API: `POST https://api.typesafe.ai/v1/systemone` with `Authorization: Bearer <key>`, model `jev-latest`. `GET /v1/models` validates a key. The API exposes no balance or pricing, so Hive estimates spend from the input tokens each call reports and a price the user enters. Spec: `https://api.typesafe.ai/openapi.json`.

## Architecture

```text
Pi process                                  Hive main                 Hive renderer
 agent/extensions/jev.ts                     modules/jev/src/main.ts   modules/jev/src/renderer.tsx
  turn_end -> callJev -> jev_advice --------------bridge event---------> jev-store -> JevAdviceBar
  ask_jev tool -> callJev                    config.json (key, consent)  JevSettings (settings.accounts slot)
  jev_compact <---------------------------------bridge event---------- "Compact" button
        |  reads HIVE_JEV_CONFIG, appends HIVE_JEV_USAGE
        v
   api.typesafe.ai
```

- **One extension file.** `agent/extensions/jev.ts` is installed as a single file into Pi's extensions dir, so it cannot import Hive code. Shapes marked "mirrored" copy `src/shared.ts`.
- **Key and settings.** Main owns `config.json` in the module data dir (mode 0600). It sets `HIVE_JEV_CONFIG` and `HIVE_JEV_USAGE` on its own process env, so Pi sessions spawned afterwards inherit them. Sessions that were already running keep the old env until restarted. The renderer only sees a view without the key.
- **Bridge.** Advice and the compact request travel as generic bridge records (`jev_advice` on `studio:to-gui`, `jev_compact` on `studio:from-gui`) through `pi.events`. No protocol package change was needed.
- **Fail open.** No key, no consent, a network error, a bad response or a paused breaker all leave Pi behaving as if the module were absent.

## Privacy consent

Jev sends content to a third party, so it stays inert until the user accepts a notice in Settings.

- `JevSettings.consentAt` (epoch ms, `null` by default). Saving a key requires ticking the notice. Existing keys without consent do nothing until the user clicks "Accept and turn Jev on".
- `loadSettings()` in the extension returns `null` without a positive `consentAt`, so no compaction call is made and `ask_jev` is not registered.
- The notice says what leaves the machine: about the last 8 messages (shortened) for compaction, and any text, files or read-only command output given to `ask_jev`. "Revoke" sets `consentAt` back to `null`.

## Smart compaction

After a `turn_end` that hands control back to the user (no tool calls pending, not an error or abort), and only above the configured context floor (default 40%), the extension asks four questions:

| Question | Type | Meaning |
|---|---|---|
| `switched_gears` | noul | The user started a new task |
| `at_boundary` | noul | The last turn finished a unit of work |
| `mid_operation` | noul | A multi-step edit is half done |
| `needs_history` | score (3 levels) | How much earlier context the next step needs |

It emits a `jev_advice` record with the four signals plus usage. Hive decides what to show, in `src/tiering.ts` (pure, tested):

```text
silent if tokens < 8k, usage < floor, or mid_operation > 0.5
score = usage + 0.15 (task boundary) + 0.10 (cache cold) + 0.10 (next step needs little history)
with a boundary: >= 0.85 request, >= 0.65 recommend, >= 0.50 notice
without a boundary: notice at most (Pi's own threshold stays the safety net)
```

- **Cache signal.** "Cache cold" means the session was idle for 5 minutes since the advice (Anthropic's default cache TTL). It does not read `lib/models/cache-switch.ts`, so it is wrong for providers with other cache lifetimes.
- **Advice only.** The bar offers "Compact", which sends `jev_compact`; the extension then calls `ctx.compact()`. Nothing compacts automatically. Advice is cleared on `agent_start` and `compaction_end`.
- **Not built.** Asking Jev which turn the task started at and passing it as a summary instruction (planned for v1.1).

## ask_jev tool

Registered only when a key with consent exists and the feature is on (checked at load; re-checked on every call). The agent supplies named questions plus `state` text, `files` and/or a read-only `command`. File and command contents go straight to Jev and never enter the agent context. The reply is typed answers formatted with probabilities.

Safeguards:

- **Workspace confinement.** Each file path is resolved with `realpath` and must stay inside the session `cwd`, so `..`, absolute paths and symlinks that escape are rejected (`confine()`).
- **Secret blocklist.** Credential-looking names are refused even inside the workspace: `.env` and `.env.*` (not `.example`, `.sample`, `.template`, `.dist`), `*.pem`, `*.key`, `*.p12`, `*.pfx`, `*.jks`, `id_rsa*` and friends, `.npmrc`, `.netrc`, `.pypirc`, `.git-credentials`, `auth.json`, `credentials.*`, `secrets.*`, and anything under `.ssh`, `.aws`, `.gnupg` or `.git`.
- **Command allowlist.** No shell: a command is parsed and run with `execFile`. Allowed binaries are `ls dir head tail wc grep rg find git pwd tree` (no `cat` or `type`; use `files`). Pipes, redirects, substitution and write flags (`find -delete/-exec`, `rg --pre`, `git -c`, `git branch <name>`, `git tag <name>`) are rejected. `git branch` is listing-only. `rg` and `grep` may not use `-f`/`--file` or a bare `--`.
- **Command paths.** For non-git commands every positional argument (except the grep/rg search pattern) must pass `confine()`. For git, path-like arguments and `--flag=path` values must. `rg` and `grep` get secret-file exclusions appended after the agent's own arguments.
- **Size caps.** 200 KB per file, 400 KB total, 15 s command timeout, binary files refused.
- **Residual risk.** Workspace source code can still be sent, and tracked secrets can appear in `git diff`, `git show` or `git log -p` output because git is not path-filtered. The consent notice says so.

## Reliability and cost

- **Timeout** 6 s per call. **Circuit breaker:** 3 straight failures pause calls for 5 minutes; 401, 402 or 403 pause them for 30 minutes.
- **Daily cap** (default 500 calls, 0 = unlimited), counted across sessions from the shared `usage.jsonl`.
- **Usage log** `usage.jsonl`: one record per call (feature, tokens, latency, ok, error). Main trims it to its newest half past 2 MB.

## Files

| File | Role |
|---|---|
| `modules/jev/package.json` | Manifest (`tier: bonus`, `recommended: false`, `agent.extensions`) |
| `modules/jev/agent/extensions/jev.ts` | Client, breaker, compaction advice, `ask_jev`, confinement |
| `modules/jev/src/shared.ts` | Settings, view, usage summary, mirrored shapes |
| `modules/jev/src/main.ts` | Config file, env wiring, IPC, key test, usage log |
| `modules/jev/src/tiering.ts` | Pure tier decision |
| `modules/jev/src/renderer.tsx`, `src/ui/*` | Settings page, advice bar, store |
| `modules/jev/src/*.test.ts`, `src/ui/jev-store.test.ts` | Unit and flow tests |

## v2: model router (not started)

Before send, a `choice` picks `fast` or `powerful` and a `score` picks reasoning effort. The composer shows a suggestion chip and never switches silently. It must read `lib/models/cache-switch.ts` and only suggest a switch when the saved cost outweighs losing a warm cache.

## Risks

- **Alpha-style API.** One client function (`callJev`) isolates the schema; failures are swallowed and the breaker stops repeated calls.
- **Latency and cost.** One call per finished turn above the floor, plus the daily cap.
- **Privacy.** Content goes to TypeSafe. Mitigations: opt-in module, consent gate, confinement, secret blocklist.
