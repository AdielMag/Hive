# Jev quality: bug fixes, stricter enforcement, continuous measurement

The usage log has 355 calls; 9 failed, and every failure traces to a fixable gather bug. The enforcement hook reads verdicts by matching regexes against the result text and matches files by basename only, so it can be fooled. On measurement, the dashboards show volume and an estimated saving, but nothing on accuracy, calibration, or whether enforcement helps.

Work is split into 4 packages. A and B touch separate files and can run in parallel.

## Decisions

> [!CHOICE] D1: `grep` on Windows (5 `spawn grep ENOENT` failures)
> - (x) **Resolve Git's grep.exe, else reject with a pointer to `rg`** [Recommended]
> - ( ) Translate grep flags to rg (fragile, and secret-exclude flags differ)
> - ( ) Remove grep from the allowlist

> [!CHOICE] D2: Input size budget (one HTTP 400 `max_tokens_exceeded`)
> - (x) **Configurable `maxInputTokens`, default 28k (the largest call that succeeded was 31.8k); over budget is refused locally and costs no API call** [Recommended]
> - ( ) Silently truncate to fit

> [!CHOICE] D3: Golden eval cadence (~30 calls per run)
> - (x) **Manual, plus a reminder in Insights when the model id changes** [Recommended]
> - ( ) Daily, automatic

> [!CHOICE] D4: Polarity of yes/no call-site answers
> - (x) **Infer from wording (bug/break/leak = negative), prefer the gate's `ok` key** [Recommended]
> - ( ) Require the exact `ok`/`risk` question names

> [!CHOICE] D5: Share Jev coverage between main agent and subagents
> - (x) **`<git-dir>/jev-coverage.json`, keyed by file diff hash, 12h TTL** [Recommended]
> - ( ) Per-process only (current behaviour; checks the same diff twice)

<!-- MORE -->

## WP-A: `modules/jev/agent/extensions/jev.ts` (Hive repo)
| # | Fix | Test |
|---|---|---|
| A1 | `readFiles`: replace "any NUL byte = binary" with `looksBinary()` (>1% NUL in the first 8 KB, or >10% U+FFFD) | a file with 2 NULs passes; a PNG is rejected |
| A2 | token budget: `estimateInputTokens`, refuse over `maxInputTokens` (errorKind `invalid`, nothing sent to the API); `MAX_TOTAL_BYTES` 100 KB; a maxBuffer overflow rejects instead of silently truncating; `max_tokens_exceeded` doesn't trip the breaker | over budget never calls fetch |
| A3 | grep resolver per D1, cached; update the tool description | resolver returns null, clear error |
| A4 | `checkCommandPaths`: run git `rev:path` args (`HEAD:.env`) through `confine`; append exclude pathspecs (`.env*`, `*.pem`, `*.key`, `.npmrc`, `.netrc`, `auth.json`, `id_rsa*`, `.git-credentials`) to `git diff/log/show/grep/ls-files/blame` | `git show HEAD:.env` refused; `git diff` doesn't show a tracked `.env` |

Sync: restart Hive (`installAgentAssets` checks a marker hash). Never copy the file by hand.

## WP-B: `~/.pi/agent/extensions/jev-enforce.ts` (back it up first)
| # | Fix |
|---|---|
| B1 | coverage only from `files`/`command` args (not question text), matched by full-path suffix (no basename); call sites = code extensions only |
| B2 | verdicts from structured `e.details` (fallback: text). Failed batch items cover nothing. A file counts as covered only by a `score` question. "High" = top level of 3+ levels, whatever its label. Risk is stored per file and kept until that file changes, so a later "trivial" can't clear an earlier "high". Polarity per D4 |
| B3 | coverage shared across processes per D5 (atomic write) |
| B4 | outcome events: sweep block → `repeated`/`jev`/`other`; big-raw nudge → `jevWithin5`; gate → `complied`, `maxRisk`, `extraToolCalls`; one `jev-call` event per ask_jev (covered, maxRisk, failedItems) |

Tests added to `tools/jev-enforce-tests/run.mjs` for each fix; update the wording in `AGENTS.md`.

## WP-C: Measurement tooling
- **C1 `tools/jev-audit.py`:** join `usage.jsonl` by `toolCallId`. Report net tokens (saved minus re-read), re-read rate by confidence bucket (<0.6 / 0.6-0.8 / ≥0.8), sweep/nudge/gate outcome rates, and compaction advice vs manual compaction. Fix BIG-RAW false positives. Flags: `--all`, `--json`, `--since`, `--snapshot` (appends a line to `jev-metrics-history.jsonl` for trends), and `--labels` (files rated trivial that got a fix/revert commit within 7 days are possible misses).
- **C2 golden eval `modules/jev/eval/`:** ~30 labelled yes/no cases (bug diffs from this repo's fix commits, plus clean refactors). `run-eval.ts` reports accuracy, Brier score, calibration buckets, p50/p95 latency and the model id, and appends to `eval-history.jsonl`. These calls are excluded from the cap and the dashboards.

## WP-D: Hive Insights
- `session-scan.ts`: re-read rate by confidence; count `jev-enforce` events (`CACHE_VERSION` 2).
- `main.ts getInsights`: latest and previous eval runs, plus a drift flag (accuracy −5 points or Brier +0.03).
- `JevInsights.tsx`: re-read by confidence, an Enforcement card, and an Accuracy card with a drift badge.

## Verify
- `npm test`, `npm run typecheck`, `npm run check:modules`
- `node ~/.pi/agent/tools/jev-enforce-tests/run.mjs` reports 0 FAIL; `replay.mjs . 40` shows no rise in the gate rate
- Live: WorkbenchLayout.tsx is accepted; `git show HEAD:.env` is refused; a call over budget leaves no new API record
- `jev-audit.py --all --json --snapshot`; `node modules/jev/eval/run-eval.ts`

## Risks
- The real API token limit is unknown (it should be confirmed with TypeSafe), so 28k is a measured-safe default.
- Inferring polarity from wording is a heuristic.
- Shared coverage lets agents running at the same time in one worktree trust each other's checks.
