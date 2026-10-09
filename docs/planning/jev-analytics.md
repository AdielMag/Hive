# Jev analytics and ask_jev session cards

Today Jev logs only cost and volume. This plan adds impact tracking (is Jev helping?), a Jev Insights view, and a dedicated `ask_jev` row in the transcript with a clear In/Out view plus the existing raw view. About 10 files, mostly in `modules/jev`, plus a small SDK change so module tool cards receive `details`.

## Approach
- **Richer logging:** each `ask_jev` record gains session id, question types, content sources with byte sizes, estimated context tokens saved, and answer confidence. A new `events.jsonl` tracks compaction hints from shown to compacted, dismissed or ignored.
- **Insights view:** headline numbers (net savings in $, hint acceptance %, low-confidence %, error %), a 7- and 30-day trend, per-feature split, and a list of recent calls that links to the session row.
- **Session row:** a module `toolCards` entry for `ask_jev` with its own Jev color. Collapsed, it shows answer chips. Expanded, it has **In | Out | Raw** tabs, and Raw is the current view.
- **SDK:** pass `result.details`, run timing and a `RawBody` fallback to module tool cards.

## Decisions

> [!CHOICE] Where the Insights dashboard lives
> **Question**: Where do you open the full Jev analytics?
> - (x) **Jev-owned tab**: "Open insights" button in Settings → Jev opens a Hive tab, self-contained in the module [Recommended]
> - ( ) **Section in Analytics/Usage window**: next to model usage, but couples the analytics and jev modules
> - ( ) **Settings → Jev panel only**: no new surface, but cramped for charts and lists

> [!CHOICE] How much input content to keep for the In tab
> **Question**: What gets stored in the session for "what went into Jev"?
> - (x) **Sizes + 4 KB preview per source**: enough to see what was sent, small session files [Recommended]
> - ( ) **Full content**: exact replay, but large diffs and logs bloat the session JSONL
> - ( ) **Sizes only**: smallest, but the In tab can't show the content

> [!CHOICE] Session-level impact analysis
> **Question**: Also scan session files for after-the-fact signals (re-read after Jev, sessions with vs without Jev)?
> - (x) **Yes, phase 2 in this plan**: shows whether the savings are real [Recommended]
> - ( ) **Later**: ship logging, the card and the dashboard first

<!-- MORE -->

## Metrics

### ask_jev (per call, in `usage.jsonl`, all fields optional so existing records still parse)
| Field | Why |
|---|---|
| `sessionId`, `toolCallId`, `cwd` | link a call to its session row; split by project |
| `questions: {noul, choice, score}` counts | which question types the agent actually uses |
| `sources: {stateChars, files: [{path, bytes}], commandBytes}` | what went in |
| `savedTokensEst` = (file + command bytes) / 4 | context the main agent never had to read (`state` doesn't count, since the agent already wrote it) |
| `confidence: number[]` per answer | answers near 50/50 are of little use |
| `errorKind` (`cap`, `auth`, `timeout`, `gather`, `api`) | better than one free-text error |

### Compaction hints (new `events.jsonl`, written by main via a new IPC `logEvent`)
- `advice` (tier, usagePct, signals, sessionId) is logged when the renderer receives `jev_advice`.
- `shown` is logged when the tier is not `silent`.
- `compact` / `dismiss` are logged on a button click. `ignored` is logged when the next advice or the session end arrives with no action.
- `manualCompact` is logged when the user compacts without a hint. Together with the hint events this gives **hint precision** (acted on / shown) and **missed** (compacted without a hint).
- `silentCalls` / total compact-feature calls shows Jev spend that never produced a visible hint.

### Derived (Insights view)
- **Net savings:** `savedTokensEst × main-model input price` minus Jev cost. The price comes from the session's model, falling back to a setting.
- **Decisiveness:** the share of answers with confidence ≥ 80%, by question type.
- **Hint funnel:** advice → shown → acted. Context % at compaction, with a hint vs without.
- **Latency:** p50/p95. **Error rate** by `errorKind`. **Daily cap** headroom.
- **Phase 2 (session scan):** *re-read rate*, meaning the agent `read`s a file within 5 tool calls after sending it to Jev, which cancels the saving. Also sessions with vs without `ask_jev`: main-model tokens per turn and compaction count, labelled "correlation, not causation".

## Session row (`ask_jev` tool card)

```
[Jev] Ask Jev  3 questions · 2 files · git diff --stat   buggy 96% yes · lang python · severity major   428ms
 └ expanded:  In | Out | Raw
   In : questions (type badge, options/levels) + sources (state preview, file path + size, command + output size, preview)
   Out: noul -> probability bar; choice -> ranked option bars; score -> level scale with marker + confidence
        footer: model, in/out tokens, ms, est cost, est context tokens saved
   Raw: today's view (args JSON, result text) + details JSON
```
- New `--jev-rgb` hue (teal, separate from accent) in `jev.css`, applied to the row border, icon and chips. It can be overridden in theme-studio.
- Older calls without the new `details` fields still show Out from `details.answers` plus Raw. If there are no details at all, the card shows only Raw.

## Changes
| File | Change |
|---|---|
| `packages/module-sdk/src/renderer.ts` | `[MODIFY]` `ToolCardCall.result.details`, `run {startedAt, endedAt}`; card prop `RawBody` |
| `apps/desktop/src/renderer/components/Transcript.tsx` | `[MODIFY]` pass details, run and `RawBody` at :637; pull raw body (:658-698) into `ToolRawBody` |
| `modules/jev/agent/extensions/jev.ts` | `[MODIFY]` record sources/bytes/preview in `readFiles`/`runReadOnly`; extend `details` and `logUsage`; `errorKind`; session id from `ctx.sessionManager` |
| `modules/jev/src/shared.ts` | `[MODIFY]` extend `UsageRecord`; `JevEvent`; `summarizeImpact()` (pure) |
| `modules/jev/src/main.ts` | `[MODIFY]` `events.jsonl` (same 2 MB trim), IPC `logEvent`, `getInsights`; phase 2 session scanner |
| `modules/jev/src/ui/jev-store.ts` | `[MODIFY]` emit shown/compact/dismiss/ignored events |
| `modules/jev/src/ui/JevToolCard.tsx` | `[NEW]` collapsed row + In/Out/Raw tabs |
| `modules/jev/src/ui/JevInsights.tsx` | `[NEW]` dashboard (per decision 1) |
| `modules/jev/src/ui/JevSettings.tsx` | `[MODIFY]` per-feature split, "Open insights" button |
| `modules/jev/src/renderer.tsx` | `[MODIFY]` register `toolCards` + tab kind |
| `modules/jev/src/ui/jev.css` | `[MODIFY]` `--jev-rgb`, card + insights styles |

## Order
1. SDK and Transcript plumbing (details, run, `RawBody`)
2. Extension logging + `details`
3. Tool card
4. Events + `summarizeImpact` + Insights view
5. Phase 2 session scan

## Risks
- Previews put file and command content into the session JSONL. They're capped at 4 KB per source, and the content was already sent to the Jev API.
- `savedTokensEst` is a heuristic (bytes/4). The UI labels it "est."
- The session ID API on `ctx.sessionManager` still needs to be confirmed in Pi's types.

## Verify
- `npm test` in `modules/jev` (new: `summarizeImpact`, event funnel, record parsing with old and new shapes, tool card rendering of old and new details)
- Typecheck `apps/desktop` and `packages/module-sdk`
- Manual: run `ask_jev` with state, files and a command; check the row color, the In/Out/Raw tabs, and that the Insights numbers update. Trigger a compaction hint, dismiss it, and confirm the funnel counts it.
