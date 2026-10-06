# Bash Guard v2: tokenizer engine, wider rules, optional Jev tier

Replace the raw-regex classifier with a quote-aware tokenizer, add about 12 missing danger categories, and remove the duplicated rule set in the Pi extension. Add an opt-in Jev (TypeSafe System One) judge for commands the rules don't recognise. Roughly 5 files, 1 new module.

## Approach

- **Tokenize, don't regex the raw string.** New `parseCommand()` splits on `;` `&&` `||` `|` `&` newline, honours single and double quotes, heredocs and `$()`/backticks/`<(...)`, and returns segments of `{ program, args, redirects }`. Quoted text is data, so `echo 'rm -rf /'` and `git commit -m '…reset --hard'` no longer match.
- **Unwrap wrappers**, depth-limited to 8 and fail-closed (treat as dangerous) past that, as Codex does: `sudo` (with `-u` style options), `env VAR=…`, `command`, `exec`, `nohup`, `time`, `timeout N`, `xargs`, `trap`, `eval`, `bash/sh/zsh -c`, `cmd /c`, `powershell -Command`. Basename-normalise the program, so `/bin/rm` and `rm.exe` match.
- **Rules become predicates on `{program, args}`**, not regexes on strings. Each rule keeps `id`, `title`, `severity`, `reason`. Rules that need text (SQL, `/dev/tcp`) use a scoped regex on the relevant argument only.
- **New categories** (each with positive and false-positive tests):
  - Pipe-to-interpreter: `curl|wget … | sh/bash/python/node/perl/ruby`, `bash <(curl …)`, `sh -c "$(curl …)"`, `base64 -d | sh`, download-then-run.
  - Git history and remote loss: `push +ref`, `push --delete`, `push origin :ref`, `checkout -f` and `checkout -- <path>`, `stash drop|clear`, `reflog expire`, `gc --prune=now`, `filter-branch`, `update-ref -d`.
  - `rm -f`, plus `rm -r` on `/`, `~`, `$HOME`, `*` or `..`; `shred`, `wipefs`, `dd of=/dev/disk*`; overwrite redirects into `/etc/*`, `~/.bashrc`, `~/.ssh/*`.
  - Perms: `chmod a+rwx`, `chmod -R 000`, `chmod +s`.
  - Secrets and exfil: reading `~/.ssh/*`, `.env*`, `~/.aws/*`, `*.pem`; `printenv`/`env` piped to a network tool; `curl -d @<secret>`; `scp`/`rsync` of keys.
  - Reverse shells: `nc -e`, `/dev/tcp/`, `socat … exec:`.
  - Persistence and tampering: appends to shell rc and `authorized_keys`, `crontab -r`, `history -c`, `unset HISTFILE`, `iptables -F`, `ufw disable`, `setenforce 0`.
  - System: fork bomb, `killall`/`pkill` (moderate), `taskkill /F`, `shutdown|reboot|halt`, `systemctl stop|disable`.
  - Infra and cloud: `terraform destroy|apply -auto-approve`, `kubectl delete`, `docker system prune`, `docker rm -f`, `docker run --privileged` or with `-v /:`, `aws s3 rb|rm --recursive`, `gcloud … delete`, `gh repo delete`, `npm publish|unpublish`, `vercel --prod`.
  - Data: `DELETE FROM` without `WHERE`, `FLUSHALL|FLUSHDB`, `dropDatabase()`.
  - Windows: `Remove-Item -Recurse` without `-Force`, `Stop-Computer`, `Restart-Computer`, `Clear-Disk`, `Set-ExecutionPolicy`, `powershell -enc`, `iwr|irm … | iex`, `reg delete`.
- **One rule set.** Pi copies extension files verbatim, so a relative import from `agent/extensions/` breaks. Add `scripts/build-extension.mjs`, which bundles `src/engine/*` into `agent/extensions/bash-guard.ts`. A vitest check fails if the committed file is stale.
- **Jev tier** (opt-in, off by default), `src/jev.ts` and `src/engine/judge.ts`:
  - Runs only when the deterministic engine returns *no match* and the command is not on a small read-only allowlist (`ls`, `cat` on non-secret paths, `git status|diff|log`, `npm test`, …). Deterministic hits never go through Jev, and Jev can only escalate to a confirm prompt, never auto-allow a rule hit.
  - Two typed questions via `POST /v1/systemone`: `risk` (0–3) and `approval` (p). Confirm when `risk ≥ 1.5` or `approval ≥ 0.75`; use the thresholds measured in jev-guard.
  - The command is redacted before sending: `KEY=…`, bearer tokens, `sk-…`/`ghp_…`/`AKIA…` shapes, and URL credentials.
  - Fail-open on timeout (1.5 s), network error or missing key, with a log line. Deterministic rules keep protecting you either way.
  - Key is read from `JEV_API_KEY` or Hive settings. Nothing is sent unless the user enables the tier.

## Decisions

> [!CHOICE] Jev default state
> **Question**: Should the Jev tier ship enabled?
> - (x) **Off, opt-in toggle**: command text leaves the machine only after explicit consent [Recommended]
> - ( ) **On when a key is present**: more coverage by default, but silent data egress
> - ( ) **Skip Jev for now**: ship the rules engine only, add Jev later

> [!CHOICE] Unknown-command behaviour when Jev is unreachable
> **Question**: What happens to an unrecognised command if Jev times out or errors?
> - (x) **Allow and log**: matches the current guard; no new friction [Recommended]
> - ( ) **Confirm prompt**: safer, but breaks flow offline

> [!CHOICE] Keeping the extension in sync
> **Question**: How do we avoid two copies of the rules?
> - (x) **Bundle engine into the extension at build time + stale-check test**: extension stays a single self-contained file [Recommended]
> - ( ) **Ship engine as sibling files in `agent/extensions/`**: no build step, but needs confirming that Pi and the agent-assets installer handle multi-file extensions

## Changes

| File | Change |
|---|---|
| `modules/bash-guard/src/engine/tokenize.ts` | `[NEW]` quote-aware parser, heredoc and substitution extraction |
| `modules/bash-guard/src/engine/unwrap.ts` | `[NEW]` wrapper unwrapping with depth limit |
| `modules/bash-guard/src/engine/rules.ts` | `[NEW]` predicate rules, all categories above |
| `modules/bash-guard/src/engine/judge.ts` | `[NEW]` Jev tier: allowlist gate, redaction, thresholds, fail-open |
| `modules/bash-guard/src/jev.ts` | `[NEW]` System One client, timeout, key lookup |
| `modules/bash-guard/src/classifier.ts` | `[MODIFY]` thin facade over the engine, same exports (`classifyBashCommand`, `extractCommandSegments`) |
| `modules/bash-guard/src/classifier.test.ts` | `[MODIFY]` keep existing cases, add about 150 positive, negative and bypass cases |
| `modules/bash-guard/scripts/build-extension.mjs` | `[NEW]` bundle engine into the extension |
| `modules/bash-guard/agent/extensions/bash-guard.ts` | `[MODIFY]` generated; keeps the `tool_call` hook, confirm UI and headless block |
| `modules/bash-guard/package.json` | `[MODIFY]` add `build:extension` script; add a Jev toggle setting if the manifest supports one |

## Risks

> [!WARNING]
> The new rules raise the prompt rate (for example `rm -f`, `npm publish`, `systemctl stop`). Tune severities in tests against a corpus of everyday commands (`npm`, `git`, `pnpm`, `ls`, `rg`, `node`) so none of them are flagged.

> [!IMPORTANT]
> Quote-aware parsing must fail closed: if the parser can't make sense of a command (unbalanced quotes, depth overflow), fall back to scanning the raw string with the old regexes rather than allowing it.

## Verify

- `npm test -w @hive-module/bash-guard` (vitest): all existing tests, the new bypass matrix and the false-positive corpus.
- Stale-check test: regenerate the extension and diff it against the committed file.
- Jev tier: unit tests with a mocked client for timeout, bad key, redaction and threshold edges; one manual run with a real key via `JEV_API_KEY`.
- Manual: in Hive, run `curl x | python3`, `git push origin +main`, `echo 'rm -rf /'` (must NOT prompt).
