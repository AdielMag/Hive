# Show startup progress for a new session's first prompt

On the first prompt of a cold tab, `sendPrompt` awaits `ensureActiveSession` (git worktree + Pi spawn + model hydration) before clearing the composer or sending. For a few seconds nothing changes, then "Working…" appears. Fix: show the message right away plus a live step label until Pi's `agent_start`. Medium size, ~6 files.

## Approach
- Clear the composer immediately and render the prompt as a pending user bubble in the transcript
- Below it, a spinner row with the current step: `Creating worktree…` → `Starting Pi…` → `Loading model…` → `Sending…`
- Host reports the real steps: `startSession` takes an optional `startId`; main emits a new `session:startProgress` event at each step
- Clear the pending state on `agent_start` / assistant `message_start` for that tab. On failure, put the text and attachments back in the composer

## Decisions

> [!CHOICE] Step detail
> **Question**: How should the startup steps be reported?
> - (x) **Real host steps**: new IPC event from main, accurate labels [Recommended]
> - ( ) **Renderer only**: one generic "Starting session…" label, no IPC change

<!-- MORE -->

## Changes
| File | Change |
|---|---|
| `packages/protocol/src/ipc.ts` | `[MODIFY]` `startId?` on `StartSessionRequest`, `evtStartProgress` channel, `SessionStartProgress` type, `onSessionStartProgress` on the API |
| `apps/desktop/src/preload/index.ts` | `[MODIFY]` expose `onSessionStartProgress` |
| `apps/desktop/src/main/services/session-manager.ts` | `[MODIFY]` emit `worktree` / `spawn` steps |
| `apps/desktop/src/renderer/store/session-store.ts` | `[MODIFY]` `pendingStarts[tabId]` state; set in `sendPrompt` + `ensureActiveSession`, cleared in `trackActivity` or on failure |
| `apps/desktop/src/renderer/components/Transcript.tsx` + `styles/transcript.css` | `[MODIFY]` pending bubble + step row; hide the empty state while pending |

## Verify
- `npm run typecheck`, the session-store tests
- Manual: new session → Enter → the bubble and step labels appear instantly → hand off to "Working…"
