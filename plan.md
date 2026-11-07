# Auto-Compaction Mid-Session on Subject Change in Jev

Enable Jev to intelligently auto-compact conversation history mid-session whenever the user switches subjects, decoupled from rigid context-floor limits, so sessions stay lean and focused on the new task.

## Approach
- Make subject-change compaction flexible: allow task switching (`switched_gears > 0.7` and `needs_history < 0.5`) to trigger compaction even below `floorPct`, as long as there is enough context to benefit from summarization (`tokens >= MIN_TOKENS`).
- Pre-send prompt inspection: check incoming user prompts against recent conversation before starting the agent run, detecting subject divergence before heavy context is sent.
- Configurable automation mode: support both the existing non-intrusive hint bar (`mode: "hint"`) and fully autonomous mid-session compaction (`mode: "auto"`), plus a dedicated `autoOnSubjectChange` toggle in Settings → Jev.
- Update `tiering.ts` so subject switches produce actionable compaction tiers (`recommend`/`request`) even when context percentage is below `floorPct`.
- Update `modules/jev/agent/extensions/jev.ts` so the `floorPct` check does not block subject-shift evaluation when subject-change compaction is enabled.

## Decisions

> [!CHOICE] Subject Change Context Floor Policy
> **Question**: How should subject-change compaction interact with context usage and `floorPct`?
> - (x) **Flexible Subject-Change Bypass**: Allow subject switch to compact whenever `tokens >= MIN_TOKENS` (8k tokens) regardless of `floorPct`, while keeping `floorPct` as the floor for general/routine compaction. [Recommended]
> - ( ) **Lower Subject-Specific Floor**: Add a dedicated lower floor (e.g. 15% or 10k tokens) specifically for subject changes.
> - ( ) **Zero Floor**: Allow subject change compaction even on tiny conversations (< 5k tokens), regardless of token count.

> [!CHOICE] Auto-Compaction Execution Strategy
> **Question**: How should the compaction execute when a subject change is detected?
> - (x) **Hold & Flush on Send**: In `auto` mode, hold the incoming prompt in `compactionHeld`, run compaction, and flush the prompt into the freshly compacted context. In `hint` mode, show the bar and compact on Send unless dismissed. [Recommended]
> - ( ) **Background Turn-End Compaction**: Only compact in the background at turn boundaries when idle, leaving the composer untouched.

<!-- MORE -->

## Changes

| File | Change |
|---|---|
| `modules/jev/src/shared.ts` | `[MODIFY]` Add `mode: "hint" | "auto"` and `autoOnSubjectChange: boolean` (default true) to `JevSettings` and normalizeSettings |
| `modules/jev/src/tiering.ts` | `[MODIFY]` Update `decideTier`: allow `switched` with low `needsHistory` to produce `recommend`/`request` even when `usagePct < floorPct` (provided `tokens >= MIN_TOKENS`) |
| `modules/jev/agent/extensions/jev.ts` | `[MODIFY]` Update turn-end and pre-send evaluation to not drop subject-change checks when below `floorPct`; evaluate incoming user prompts for subject changes |
| `modules/jev/src/renderer.tsx` | `[MODIFY]` Trigger immediate compaction on send when `autoOnSubjectChange` or `auto` mode is active and subject switch is detected |
| `modules/jev/src/ui/JevSettings.tsx` | `[MODIFY]` Add Auto-compaction on subject change toggle and mode selector in Settings → Jev |
| `modules/jev/src/jev-core.test.ts` | `[MODIFY]` Test `decideTier` below `floorPct` when `switchedGears` is high and `needsHistory` is low; test updated settings |
| `modules/jev/src/jev-flow.test.ts` | `[MODIFY]` Test pre-send topic shift triggering compaction below floorPct |

## Risks
- **Compacting very short chats**: Guarding with `tokens >= MIN_TOKENS` (8,000 tokens) prevents pointless compaction of tiny 1-2 turn chats.
- **Latency on prompt send**: Compaction takes 5-10s; prompt stays safely queued in `compactionHeld` and UI shows busy spinner.

## Verify
- `npm test -- modules/jev`: Verify all unit and flow tests pass with the new tiering rules.
- Add unit tests verifying `decideTier` returns `recommend` for subject change at 20% context (below 40% floor).
- Verify toggle in Settings → Jev persists cleanly to `config.json`.
