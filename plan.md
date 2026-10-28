# Inspect System Prompt

Enable users to inspect the complete, live assembled system prompt in Hive, including full raw prompt text and individual structured sections (project instructions from AGENTS.md, tool guidelines, rules, skills, and linked projects).

## Approach
- Extend the bridge protocol (`packages/protocol/src/bridge.ts`) and `studio-bridge.ts` to transmit the full assembled system prompt and section contents to Hive desktop on session start and before agent runs.
- Create `useSystemPromptStore` to hold live prompt snapshots per session key and manage inspector modal state.
- Build `SystemPromptModal.tsx` providing both full raw prompt inspection and section-by-section breakdown with search, token counts, line wrapping, and clipboard copy.
- Add inspector triggers in the Context Window breakdown view (`ContextBreakdownView.tsx`) and register the `view.systemPrompt` command in the command palette.

## Decisions

> [!CHOICE] System Prompt Viewer Presentation
> **Question**: Where should the system prompt inspector appear?
> - (x) **Modal Dialog**: Centered modal (960px × 820px) with section tabs, search, and full-width code view [Recommended]
> - ( ) **Right Panel View**: Replaces or nests inside the right-hand Context Window dock (narrower 360px width)

> [!CHOICE] Viewing Mode Default
> **Question**: What should the inspector show first when opened?
> - (x) **Section Tabs with Full Prompt tab**: Default to Full Prompt with quick tabs for Project Context, Rules, Skills, and Tools [Recommended]
> - ( ) **Project Context First**: Default immediately to AGENTS.md / project instructions section

<!-- MORE -->

## Changes

| File | Change |
|---|---|
| `packages/protocol/src/bridge.ts` | `[MODIFY]` Add `systemPrompt` and `rawSections` to `prompt_sections` message, and add `get_system_prompt` action |
| `apps/desktop/resources/bridge/studio-bridge.ts` | `[MODIFY]` Emit full system prompt and sections on `session_start` and `before_agent_start`, and handle `get_system_prompt` action |
| `apps/desktop/scripts/build-bridge.mjs` | `[VERIFY]` Ensure bridge bundle builds cleanly with updated protocol types |
| `apps/desktop/src/renderer/store/system-prompt-store.ts` | `[NEW]` Zustand store managing system prompt snapshots per session key and inspector visibility |
| `apps/desktop/src/renderer/components/SystemPromptModal.tsx` | `[NEW]` Inspector modal with section navigation, search filter, token counters, and raw CodeBlock view |
| `apps/desktop/src/renderer/styles/system-prompt-modal.css` | `[NEW]` Styling for prompt inspector modal, section tabs, search input, and metadata badges |
| `apps/desktop/src/renderer/components/ContextBreakdownView.tsx` | `[MODIFY]` Add "Inspect prompt" action button and click trigger to the "System prompt & tools" category row |
| `apps/desktop/src/renderer/components/WorkbenchLayout.tsx` | `[MODIFY]` Mount `SystemPromptModal` in desktop layout |
| `modules/context-breakdown/src/renderer.tsx` | `[MODIFY]` Register `view.systemPrompt` command ("Inspect System Prompt") and title menu entry |
| `apps/desktop/src/renderer/styles/shell.css` | `[MODIFY]` Import `system-prompt-modal.css` |
| `packages/pi-adapter/test/bridge.contract.ts` | `[MODIFY]` Add contract assertions for `systemPrompt` and `rawSections` in `prompt_sections` bridge message |

## Architecture & Data Flow

```
[Pi Agent Core]
       │
       ▼ (session_start / before_agent_start)
[studio-bridge.ts] ───(TCP Bridge)───► [SessionManager (Main)]
  - ctx.getSystemPrompt()                     │ (IPC.evtBridge)
  - parsePromptSections()                     ▼
  - prompt_sections { systemPrompt, rawSections, sections }
                                       [system-prompt-store (Renderer)]
                                              │
                         ┌────────────────────┴────────────────────┐
                         ▼                                         ▼
              [ContextBreakdownView]                      [SystemPromptModal]
             "Inspect prompt" trigger                 Full Prompt / Section Tabs
                                                      Search, Copy, Token Badges
```

### 1. Bridge Protocol & Serialization
In `packages/protocol/src/bridge.ts`:
- Extend `BridgeToStudio`:
  ```typescript
  | {
      v: 1;
      type: "prompt_sections";
      sections: Record<string, number>;
      rawSections?: Record<string, string>;
      systemPrompt?: string;
    }
  ```
- Extend `BridgeAction`:
  ```typescript
  | { id: string; action: "get_system_prompt" }
  ```
- Add utility `parsePromptSections(fullPrompt: string): { preamble: string; sections: Record<string, string> }` to extract XML-tagged prompt sections (`<project_context>`, `<rules>`, `<skills>`, `<tools>`, `<docs>`, `<linked_projects>`, etc.).

### 2. Studio Bridge Extension
In `apps/desktop/resources/bridge/studio-bridge.ts`:
- When socket connects during `pi.on("session_start")`: immediately invoke `sendPromptSnapshot(ctx.getSystemPrompt())` so the prompt is available without waiting for the user's first prompt.
- In `pi.on("before_agent_start")`: inject `linked_projects`, measure section lengths, and emit updated `prompt_sections` containing the complete prompt and parsed section bodies.
- In `BRIDGE_COMMAND` (`/__studio`): handle `case "get_system_prompt"` returning current prompt on-demand.

### 3. Client State & Inspector Modal
In `apps/desktop/src/renderer/store/system-prompt-store.ts`:
- Listen to `window.studio.onBridgeMessage` for `type === "prompt_sections"`.
- Fallback: when inspecting a compacted transcript without a running bridge, extract prompt sections from `compaction.systemMessage`.
In `SystemPromptModal.tsx`:
- Header displays: Session title, Active model name, estimated token count, character count, search bar with match count, "Copy" button, and Close button.
- Tab bar: "Full Prompt" tab plus individual section tabs ("Project Context", "Rules", "Skills", "Tools", "Linked Projects", "Preamble").
- Content viewer: Uses `CodeBlock` with soft-wrap toggle and search highlighting.

## Risks
- Large prompt strings (20KB–50KB): Handled without issues across local TCP sockets and in-memory React state; `CodeBlock` tokenizes asynchronously.
- Historical sessions: When viewing an older session where no live Pi process is attached, the store checks for compaction `systemMessage` entries or falls back to showing context files (`AGENTS.md`) from disk.

## Verify
- `npm test -- apps/desktop/src/main/services/context-files.test.ts`
- `npm test -- packages/pi-adapter/test/bridge.contract.ts`
- Manual verification:
  1. Open a project in Hive, click "Context Window" from composer or view menu.
  2. Click "Inspect prompt" on "System prompt & tools" row -> verify modal opens.
  3. Verify "Full Prompt" shows exact instructions including AGENTS.md, tools, and rules.
  4. Switch between section tabs and test search filter and copy button.
  5. Run command `view.systemPrompt` from Command Palette (Ctrl+P / Cmd+P).
