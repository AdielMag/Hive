# Rate-Limit Acknowledgment & Subagent Model Fallback

Track provider subscription limits (429 / quota exhaustion), acknowledge rate-limited state, and automatically route subagents marked for rate-limited models to available alternative models.

## Approach
- Build a persistent provider rate-limit tracker that detects HTTP 429s, header utilization, and quota errors across Antigravity, Anthropic, and Codex.
- Update `pi-subagents` model resolution and invocation config so caller overrides take precedence and rate-limited models fall back to available models.
- Add transparent retry on initial-turn rate-limit failure in `pi-subagents` runner, switching to an available provider.
- Update global `AGENTS.md` so the orchestrator acknowledges provider rate limits and delegates subagents to available models.
- Connect Hive `modules/limits` quota detection to the shared rate-limits store.

## Decisions

> [!CHOICE] Fallback Tier Mapping Strategy
> **Question**: How should subagents pick an alternative model when their marked model's provider is rate-limited?
> - (x) **Equivalent Tier & Provider Swapping**: Flash maps to Haiku/Sonnet; Sonnet/Opus maps to same family on Antigravity [Recommended]
> - ( ) **Always Fallback to Parent Session Model**: Use whatever model the parent conversation is currently running on
> - ( ) **First Active Model in Enabled List**: Pick the first un-rate-limited model from settings.enabledModels

<!-- MORE -->

## Changes

| File | Change |
|---|---|
| `~/.pi/agent/extensions/provider-limits.ts` | `[NEW]` Extension detecting 429s, headers & quota errors, persisting to `provider-rate-limits.json` |
| `~/.pi/agent/npm/node_modules/@tintinweb/pi-subagents/src/model-resolver.ts` | `[MODIFY]` Add rate-limit awareness and intelligent fallback model resolution |
| `~/.pi/agent/npm/node_modules/@tintinweb/pi-subagents/src/invocation-config.ts` | `[MODIFY]` Fix parameter precedence: `params.model ?? agentConfig?.model` |
| `~/.pi/agent/npm/node_modules/@tintinweb/pi-subagents/src/index.ts` | `[MODIFY]` Fall back to available model when marked model is rate-limited; acknowledge in output |
| `~/.pi/agent/npm/node_modules/@tintinweb/pi-subagents/src/agent-runner.ts` | `[MODIFY]` Check rate-limited provider in `resolveDefaultModel`; retry once on turn 1 rate-limit error |
| `~/.pi/agent/AGENTS.md` | `[MODIFY]` Document provider rate-limit acknowledgment and subagent fallback policy |
| `modules/limits/src/service/index.ts` | `[MODIFY]` Sync detected 429 backoff / exhausted quota into `provider-rate-limits.json` |

## Risks
- False positive provider block: Mitigated by short default backoff TTL (5 minutes for 429s unless provider headers specify a longer reset time) and manual `/rate-limits --clear` command.
- Fallback model compatibility: Fallback models are validated against the user's `enabledModels` and model registry availability.

## Verify
- Launch test subagent with Antigravity marked when Antigravity is simulated as rate-limited -> verifies automatic fallback to Anthropic model.
- Test `params.model` override on an agent with frontmatter model -> verifies override is honored.
- Vitest run for `modules/limits`.
