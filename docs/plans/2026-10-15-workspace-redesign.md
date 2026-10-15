# Hive Workspace Redesign

Replaces the left multi-project list with an always-visible top-bar project picker and transforms the left rail into a focused "Sessions" tab for the active project. Adds an onboarding gate when zero projects exist, docks the terminal at the bottom right, embeds session usage and Jev/overall costs into a dedicated right panel, declutters transcripts with tool batching and collapsed thinking, and fixes the questionnaire rendering bug.

## Approach
- **Top-bar picker + Sessions rail**: Move project selection into `AppTitleBar`. Left panel becomes project-scoped `SessionsPanel` with "New Session" button. Persist `lastProjectId` in `store/index.ts` / `projects.json`.
- **First-run onboarding gate**: Gate `WorkbenchLayout` behind a full-screen `OnboardingGate` when `projects.length === 0` until a folder is added.
- **Bottom-docked terminal**: Add a `bottom` dock slot (`ui.bottom`) to `ui-store` and `WorkbenchLayout` with resize handle; move terminal rail button to bottom-right status/rail area.
- **Session usage & cost panel**: Create `UsagePanel` in right dock (`ui.right = "usage"`) displaying per-session tokens, context %, model costs, Jev calls/tokens/cost ($0.042/1M) and daily cap remaining, plus overall project/global costs (today/7d/30d).
- **Transcript declutter**: Helper `groupTimelineItems` in `Transcript.tsx` batches consecutive tool calls into a single expandable summary card. Auto-collapse completed thinking blocks; show animated "Thinking…" with streaming text during generation.
- **Questionnaire fix**: Update `~/.pi/agent/extensions/questionnaire.ts` to only use previewer if `/api/status` reports an active plan (`activePlanPath !== null`), otherwise fall back cleanly to `studio:to-gui` bridge form.

## Decisions

> [!CHOICE] Bottom terminal panel toggle
> **Question**: Where should the bottom terminal toggle button live?
> - (x) **Status bar bottom-right**: next to branch/diagnostics, classic IDE style (`Terminal` icon + shortcut) [Recommended]
> - ( ) **Bottom of the right rail**: below other rail icons

<!-- MORE -->

## Changes

| File | Change |
|---|---|
| `packages/protocol/src/projects.ts` | `[MODIFY]` Add `lastProjectId?: string` to store/catalog protocol |
| `packages/protocol/src/ipc.ts` | `[MODIFY]` Add IPC methods for overall cost aggregation & Jev daily quota |
| `apps/desktop/src/main/store/index.ts` | `[MODIFY]` Persist `lastOpenedProjectId` in `projects.json` |
| `apps/desktop/src/renderer/store/session-store.ts` | `[MODIFY]` Project selection updates `activeProject` & saves last-used; project-scoped session filtering |
| `apps/desktop/src/renderer/store/ui-store.ts` | `[MODIFY]` Add `bottom: string | null` and `bottomHeight` to layout state |
| `apps/desktop/src/renderer/components/AppTitleBar.tsx` | `[MODIFY]` Integrate searchable project dropdown picker with "Add Project" action |
| `apps/desktop/src/renderer/components/WorkbenchLayout.tsx` | `[MODIFY]` Render `OnboardingGate` if no projects; mount `bottom` dock panel and bottom resize bar |
| `apps/desktop/src/renderer/components/OnboardingGate.tsx` | `[NEW]` Full-window gate prompting user to add their first project |
| `apps/desktop/src/renderer/components/SessionsPanel.tsx` | `[NEW]` Replaces multi-project Sidebar; lists sessions for active project with New Session button |
| `apps/desktop/src/renderer/components/UsagePanel.tsx` | `[NEW]` Right-dock panel for detailed session usage, Jev metrics, and project/global cost aggregates |
| `apps/desktop/src/renderer/components/Transcript.tsx` | `[MODIFY]` Group consecutive tool calls into `<ToolBatchGroup/>`; collapse finished thinking blocks |
| `apps/desktop/src/renderer/components/StatusBar.tsx` | `[MODIFY]` Add bottom terminal toggle button; click on cost button opens `UsagePanel` |
| `modules/terminal/src/renderer.tsx` | `[MODIFY]` Target `bottom` dock slot instead of `right` panel |
| `~/.pi/agent/extensions/questionnaire.ts` | `[MODIFY]` Check `status.activePlanPath` before hijacking questionnaire to plan-previewer |

## Phase Details

### Phase 1: Project Picker, Sessions Rail & Onboarding Gate
1. **Persistence**: `main/store/index.ts` saves `lastOpenedProjectId` on project switch.
2. **TitleBar Picker**: `AppTitleBar.tsx` renders a sleek dropdown showing current project, list of available projects with checkmark, and "+ Open Folder..." at bottom.
3. **Sessions Rail**: Left rail tab renamed to "Sessions". Renders `SessionsPanel.tsx` displaying only `sessions.filter(s => s.projectId === activeProject.id)`, sorted by `updatedAt` desc, with "+ New Session" primary action.
4. **Onboarding Gate**: If `projects.length === 0`, `WorkbenchLayout` renders `OnboardingGate` overlay with "Welcome to Hive" and "Open your first project folder" button.

### Phase 2: Bottom Dock & Terminal Relocation
1. **Layout extension**: `ui-store.ts` adds `bottom: string | null` (default `null`), `bottomHeight: number` (default 260px, min 140px, max 600px), and `toggleBottom(id)`.
2. **Workbench render**: `WorkbenchLayout.tsx` wraps center editor/transcript and bottom panel in flex column, with horizontal drag resize splitter.
3. **Terminal contribution**: `modules/terminal/package.json` and `renderer.tsx` register for `bottom` slot. Status bar icon toggles it.

### Phase 3: Usage Panel (Session Breakdown, Jev & Overall Costs)
1. **Usage Panel**: Registered in right panel slot (`ui.right = "usage"`).
2. **Session Detail**:
   - Token breakdown (Prompt, Output, Cache Read/Write).
   - Turn count, tool calls count, context % bar.
   - Cost by model for current session.
   - Jev Usage: calls made, tokens consumed, session Jev cost ($0.042/1M input tokens), today's daily cap remaining.
3. **Overall Costs**:
   - Scope switcher: "Current Project" vs "All Projects".
   - Time filters: Today / 7 Days / 30 Days / All Time.
   - Aggregate sum of LLM cost + Jev cost across sessions.

### Phase 4: Transcript Declutter
1. **Tool Batching**: In `Transcript.tsx`, scan sequential `timeline.items`. Consecutive `toolCall` items (across assistant messages) are wrapped into a `<ToolBatchGroup>` displaying:
   - Header: "Used N tools (e.g. read x3, bash x2)" with badges and expand/collapse caret.
   - Collapsed by default if N >= 2, showing quick status icons (success/failure).
   - Option to "Expand all" / "Collapse all".
2. **Thinking Blocks**:
   - While streaming (`streaming && isLatest`): open by default with pulsating indicator and streaming text.
   - Once message settles (`agent_settled` or next block arrives): collapsed by default. Header shows "Thought for Xs" with clean toggle.

### Phase 5: Questionnaire Fix
1. In `~/.pi/agent/extensions/questionnaire.ts`:
   - Change `findLivePreviewerSession()` to verify that `/api/status` returns `{ running: true, activePlanPath: string }` where `activePlanPath` is non-null.
   - When no active plan exists, route directly to `isHiveBridgeAttached()` path (`kind: "form"` on `"studio:to-gui"`), which triggers `QuestionFormModal.tsx` in Hive.

## Risks
- **Layout flicker on startup**: Opening the last project must be initialized before rendering main workbench to prevent flash of onboarding gate.
- **Terminal resizing**: Bottom terminal xterm instance must call `fitAddon.fit()` on resize of `bottomHeight`.

## Verify
- `npm run typecheck` across workspaces.
- `npm test` runs unit tests without regression.
- Manual test:
  1. Launch with zero projects: verify Onboarding Gate blocks interaction until folder picked.
  2. Switch projects via top bar: verify Sessions tab updates to show only current project's sessions.
  3. Toggle bottom terminal: verify it opens at bottom and resizes cleanly.
  4. Open Usage panel: verify live tokens, Jev metrics, and project/global historical totals.
  5. Run multi-tool query: verify tool calls batch together and thinking collapses after stream.
  6. Trigger questionnaire: verify interactive modal opens directly in Hive.
