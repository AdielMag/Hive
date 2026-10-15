# LLM-generated session names

Today a session is named after its first prompt (truncated, `titleFromPrompt`). Instead, after the first prompt of a new session, ask a cheap model for a 3-6 word title and use it in every place the name shows (tab header, sidebar, history). Roughly 7 files, reusing the existing "feature model" and one-shot Pi CLI call pattern from git commit messages.

## Approach
- Main: new one-shot `generateSessionTitle(cwd, prompt, model?)` (spawns Pi CLI `-p --no-session --no-tools`, same as `modules/git/src/service.ts:347`), exposed over a new IPC.
- Store: new `aiTitle` field in session meta, separate from the user `title` rename. Display priority: user `title` > `aiTitle` > Pi `name` > first prompt. A manual rename always wins and is never overwritten.
- Renderer: right after the first prompt is sent in a fresh tab, fire-and-forget the generation. Tab keeps the first-prompt title until the AI title lands, then swaps via `refreshCatalog`.
- New `sessionTitle` feature model in `feature-models-store.ts` so the model is configurable in Models settings.
- On any failure or empty result: silently keep the prompt-derived title.

## Decisions

> [!CHOICE] Model for titles
> **Question**: Which model generates the title?
> - (x) **Cheap heuristic model**: reuses the existing `heuristic` source (haiku/flash class), fast and low cost [Recommended]
> - ( ) **Session model**: no extra setup, but pricier and slower

> [!CHOICE] When to regenerate
> **Question**: Rename again later in the conversation?
> - (x) **Once, after first prompt**: stable name, one call per session [Recommended]
> - ( ) **Again after a few turns**: more accurate if topic drifts, but names change under the user

<!-- MORE -->

## Changes
| File | Change |
|---|---|
| `packages/protocol/src/ipc.ts` | `[MODIFY]` add `generateSessionTitle` IPC + `aiTitle` on `SessionMetaEntry` / `SessionCatalogItem` |
| `apps/desktop/src/preload/index.ts` | `[MODIFY]` expose `generateSessionTitle` |
| `apps/desktop/src/main/services/session-title.ts` | `[NEW]` one-shot Pi CLI call, prompt, output cleanup (strip quotes/fences/markdown, cap 50 chars) |
| `apps/desktop/src/main/ipc/sessions.ts` | `[MODIFY]` handle IPC; allow `aiTitle` in `sanitizeSessionMeta` |
| `apps/desktop/src/main/services/catalog.ts` | `[MODIFY]` emit `aiTitle` from meta in `listAll` (~line 66) |
| `apps/desktop/src/renderer/lib/session-title.ts` | `[MODIFY]` `sessionDisplayTitle`: `title > aiTitle > name > firstMessage` |
| `apps/desktop/src/renderer/store/feature-models-store.ts` | `[MODIFY]` add `sessionTitle` preference (default `heuristic`) + validation/migration |
| `apps/desktop/src/renderer/components/ModelsSettingsContent.tsx` | `[MODIFY]` row for the new feature |
| `apps/desktop/src/renderer/store/session-store.ts` | `[MODIFY]` in `sendPrompt` (~line 1750) trigger generation once per session; apply result via `updateSessionMeta({aiTitle})` + `refreshCatalog` |
| `apps/desktop/src/renderer/store/session-store.test.ts`, `feature-models-store.test.ts` | `[MODIFY]` tests |

### Generation prompt
Input: first user prompt only (mode prefix and attached-file bodies stripped via existing helpers, capped ~2KB). Instruction: output only a 3-6 word title in the prompt language, no quotes, no trailing punctuation. Skip for slash commands.

### Guards
- Trigger only when tab title is `NEW_SESSION_TITLE` and no `title`/`aiTitle` exists; track an in-flight set keyed by session path to avoid duplicates.
- Re-check before applying: if the user renamed in the meantime, discard the result.
- 20s timeout on the child process; kill on timeout.

## Risks
- A second Pi process per new session adds a little cost and startup latency; mitigated by the cheap model and fire-and-forget.
- `aiTitle` shares the sessions meta file; unknown fields are dropped by `sanitizeSessionMeta`, so it must be whitelisted there.

## Verify
- `pnpm test` (store + feature-model tests), typecheck.
- Manual: new session, send prompt, tab shows prompt text then swaps to the short AI title; sidebar matches; restart app, title persists; manual rename sticks; failing model leaves prompt title.
