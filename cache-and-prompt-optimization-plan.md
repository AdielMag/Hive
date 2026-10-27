# Optimize Session Cache and Remove Prompt Bloat

Improve Anthropic prompt cache hit rate for Claude subscription using a sliding 2-turn cache window (turns N-1 and N), and eliminate redundant plaintext `<tools>` and `<docs>` tokens from the system prompt without affecting tool execution or agent rules.

## Approach
- Add a 2nd-to-last turn (N-1) cache breakpoint in Anthropic message conversion so prior conversation turns remain warm cache hits on every message.
- Remove redundant plaintext `<tools>` list from system prompt (Anthropic API already passes native JSON Schema tools).
- Remove static Pi internal `<docs>` section (~400 tokens) from the default system prompt.
- Retain all tool execution capabilities, agent behavior rules, and project context intact.

## Decisions

> [!CHOICE] Prompt bloat trimming scope
> **Question**: Which unneeded prompt sections should be stripped?
> - (x) **Strip `<docs>` and plaintext `<tools>`**: 100% safe, saves ~700-1,000 tokens every turn without affecting capabilities [Recommended]
> - ( ) **Also compress global `<available_skills>` descriptions**: Additional ~1,500 token savings, but alters skill phrasing

<!-- MORE -->

## Changes

| File | Change |
|---|---|
| `node_modules/@earendil-works/pi-ai/.../anthropic-messages.js` | `[MODIFY]` Add sliding N-1 turn cache breakpoint (turn N-1 + turn N) within 4-breakpoint limit |
| `node_modules/@earendil-works/pi-coding-agent/.../system-prompt.js` | `[MODIFY]` Omit static `<docs>` and duplicate plaintext `<tools>` text from default prompt sections |

## Risks
- Anthropic API strictly enforces a maximum of 4 `cache_control` blocks per request. The implementation explicitly guarantees at most 4: 1 system, 1 tool, at most 2 message turns (N-1 and N).
- Plaintext `<tools>` is purely redundant duplicate text; Anthropic Claude uses the native API `tools` parameter.

## Verify
- Verify that request construction generates at most 4 cache breakpoints.
- Verify that system prompt no longer includes `<docs>` and duplicate `<tools>` text.
- Verify tool calling (`read`, `bash`, etc.) continues to function normally.
- Inspect prompt token count reduction in usage stats.
