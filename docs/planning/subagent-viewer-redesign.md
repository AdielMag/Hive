# Subagent Glance Redesign: Popup Modal & Dedicated Tab

Redesign subagent execution visibility in Hive with a live-streaming popup modal and a dedicated full-width workbench tab, replacing the cramped inline-only card glance with an easy-to-follow inspection experience.

## Approach
- Add a dedicated **Subagent Tab** (`kind: "subagent"`) rendered in the main workbench editor card, displaying full-width execution timeline, live activity banner, prompt instructions, and final results.
- Add a floating **Subagent Detail Popup Modal** (`SubagentDetailModal`) accessible anywhere in the app (via card action button or clicking activity line) for quick inspection without leaving the active chat session.
- Enhance the **SubagentCard** in the transcript: prominent live activity glance bar with direct action buttons (`Open in Tab`, `Open in Popup`, `Stop Subagent`) alongside the inline toggle.
- Update `useSubagentOutput` to accept explicit session coordinates so live JSONL output streaming works smoothly in both tabs and modals.

## Decisions

> [!CHOICE] Tab & Popup Coexistence
> **Question**: Should subagent inspection default to a dedicated tab or a popup modal?
> - (x) **Provide both with 1-click switching**: Action buttons for both "Open in Tab" and "Open in Popup", plus a button inside the popup to promote to a tab [Recommended]
> - ( ) **Tab only**: Always open subagents as tabs in the workbench tab strip
> - ( ) **Popup only**: Always inspect subagents via a floating modal overlay

> [!CHOICE] Activity Glance Interaction
> **Question**: What should happen when clicking the subagent activity banner on the card?
> - (x) **Open Popup Modal**: Instant glanceable popout without losing session scroll context [Recommended]
> - ( ) **Expand Inline**: Keep accordion expand as default click action and require clicking the tab button

## Changes
| File | Change |
|---|---|
| `packages/protocol/src/projects.ts` | `[MODIFY]` Add `"subagent"` to `CoreTabKind` and subagent fields to `TabItem` |
| `apps/desktop/src/renderer/hooks/useSubagentOutput.ts` | `[MODIFY]` Support explicit `sessionPath` / `activeKey` props for tabs & modals |
| `apps/desktop/src/renderer/store/session-store.ts` | `[MODIFY]` Add `openSubagentTab`, subagent modal state, and handle subagent tab switching |
| `apps/desktop/src/renderer/components/transcript/SubagentCard.tsx` | `[MODIFY]` Add `Open in Tab` and `Popup` action buttons and enhanced live glance bar |
| `apps/desktop/src/renderer/components/SubagentDetailModal.tsx` | `[NEW]` Floating modal for inspecting subagent execution with live transcript and prompt |
| `apps/desktop/src/renderer/components/SubagentTab.tsx` | `[NEW]` Full-screen workbench tab for dedicated subagent monitoring and review |
| `apps/desktop/src/renderer/components/TabStrip.tsx` | `[MODIFY]` Render `Bot` icon and subagent running status in tab strip |
| `apps/desktop/src/renderer/components/WorkbenchLayout.tsx` | `[MODIFY]` Mount `SubagentDetailModal` and render `SubagentTab` for `kind === "subagent"` |
| `apps/desktop/src/renderer/styles/subagent-viewer.css` | `[NEW]` Styles for subagent tab, modal, activity glances, and live timeline |
| `apps/desktop/src/renderer/styles/transcript-ai.css` | `[MODIFY]` Refined SubagentCard action buttons and live activity glance styles |

## Verify
- `npm run typecheck`
- `npm test`
- Verify SubagentCard shows `Open in Tab` and `Popup` buttons.
- Verify clicking `Open in Tab` opens a new tab in the tabstrip with live streaming transcript, prompt, and result.
- Verify clicking `Popup` opens the focused dialog overlay with promote-to-tab and close actions.
