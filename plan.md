# Fix Split Window Queued Messages Leak & New Session Pane Targeting

Fix two split-pane layout defects: prevent queued messages in one pane from displaying in other split panes, and ensure the `+` new session button in a split pane spawns the new tab inside that specific pane.

## Approach
- Scope `QueuedMessagesList` and `QueuedMessagesBar` to a target `tabId` instead of reading global store active transcript.
- Update queue store actions (`deleteQueuedMessage`, `editQueuedMessage`, `runQueuedNow`, `steerQueuedNext`, `clearAllQueued`, `popQueuedToEditor`, `removeHeldMessage`, `popHeldToEditor`) to accept an optional `targetTabId`, updating both `transcript` (when active) and `transcriptsByTab[tabId]`.
- Pass `paneId` from `TabStrip`'s `+` button into `newSessionTab(projectId, paneId)` and activate the target pane in `pane-layout-store`.
- Add unit tests verifying per-tab queue isolation and split-pane session creation.

<!-- MORE -->

## Changes

| File | Change |
|---|---|
| `apps/desktop/src/renderer/components/transcript/QueuedMessages.tsx` | `[MODIFY]` Accept `tabId?: string` in `QueuedMessagesList`, `QueuedMessageCard`, and `QueuedMessagesBar`; query per-tab queue and compaction held state. |
| `apps/desktop/src/renderer/components/Transcript.tsx` | `[MODIFY]` Pass `tabId={targetTabId}` to `<QueuedMessagesList />`. |
| `apps/desktop/src/renderer/components/Composer.tsx` | `[MODIFY]` Accept `tabId?: string` prop and pass to `<QueuedMessagesBar tabId={tabId} />`. |
| `apps/desktop/src/renderer/components/SessionView.tsx` | `[MODIFY]` Pass `tabId={targetTabId}` into `<Composer tabId={targetTabId} />`. |
| `apps/desktop/src/renderer/store/session-store.ts` | `[MODIFY]` Update `newSessionTab` to accept `targetPaneId?: string`; update queue actions to accept `targetTabId?: string` and update `transcriptsByTab[targetTabId]`. |
| `apps/desktop/src/renderer/store/pane-layout-store.ts` | `[MODIFY]` Add `addTabToPane(tabId, paneId)` helper so new tabs can be placed into the target split pane directly. |
| `apps/desktop/src/renderer/components/TabStrip.tsx` | `[MODIFY]` Pass `paneId` to `newSessionTab(activeProject.id, paneId)` on `+` click and activate `paneId`. |
| `apps/desktop/src/renderer/components/WorkbenchPane.tsx` | `[MODIFY]` Ensure clicking on tabstrip `+` or background activates the pane. |
| `apps/desktop/src/renderer/store/session-store.test.ts` | `[MODIFY]` Add tests for per-tab queued message operations and `newSessionTab` targeting. |
| `apps/desktop/src/renderer/store/pane-layout-store.test.ts` | `[MODIFY]` Add tests for `addTabToPane`. |

## Verify
- `npx vitest run apps/desktop/src/renderer/store/session-store.test.ts apps/desktop/src/renderer/store/pane-layout-store.test.ts`
- `npm run typecheck`
- `npm run check:modules`
