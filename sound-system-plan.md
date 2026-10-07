# Sound Effects System for Hive

Add a comprehensive sound effects system to Hive covering agent execution, tools, plan reviews, terminal bells, notifications, and UI interactions. Built on procedural Web Audio API synthesis with zero asset bloat, customizable sound themes, and full volume controls in Settings.

## Approach
- Zero-dependency Web Audio API procedural synthesis engine with themed sound packs (Modern, Mechanical, Sci-Fi, Retro 8-bit).
- Reactive event hooks into agent lifecycle (prompt send, thinking, tool calls, completion chords, errors, subagents).
- Deep module integration for Plan Previewer (review prompt, decisions, approvals), Terminal bell, and Toasts.
- Dedicated Sound settings panel with master volume, sound theme picker, category toggles, and sound preview buttons.
- One-click mute toggle in the status bar for instant silencing.

## Decisions

> [!CHOICE] Audio synthesis vs bundled audio assets
> **Question**: How should sound effects be generated and delivered?
> - (x) **Procedural Web Audio API**: Zero asset bloat, instant latency, zero 404s, dynamic pitch/timbre variations, multiple sound packs [Recommended]
> - ( ) **Bundled audio sample files**: Fixed recorded audio files (.wav/.mp3), requires file bundling and asset loading

> [!CHOICE] Default sound scope
> **Question**: Which sound categories should be active by default?
> - (x) **Full UX coverage**: Agent events, tools, plan reviews, terminal bell, toasts, and subtle UI clicks [Recommended]
> - ( ) **Agent and alerts only**: Agent runs, tools, errors, plan reviews, and terminal bell enabled; UI clicks silenced

<!-- MORE -->

## Changes

| File | Change |
|---|---|
| `apps/desktop/src/renderer/audio/sound-engine.ts` | `[NEW]` Core Web Audio API synth engine with volume, gain nodes, oscillators, envelopes, and sound throttling |
| `apps/desktop/src/renderer/audio/sound-presets.ts` | `[NEW]` Sound theme definitions (Modern Minimal, Mechanical Tactile, Sci-Fi Synth, Retro 8-bit) |
| `apps/desktop/src/renderer/store/sound-store.ts` | `[NEW]` Zustand store for sound preferences (mute, master volume, theme, category toggles) and playback triggers |
| `apps/desktop/src/renderer/components/SoundSettingsContent.tsx` | `[NEW]` Sound settings UI with volume sliders, theme selector, category toggles, and test sound preview buttons |
| `apps/desktop/src/renderer/store/ui-store.ts` | `[MODIFY]` Add `"sound"` to `CoreSettingsTabId` |
| `apps/desktop/src/renderer/components/SettingsModal.tsx` | `[MODIFY]` Register Sound tab with `Volume2` icon and render `SoundSettingsContent` |
| `apps/desktop/src/renderer/store/session-store.ts` | `[MODIFY]` Trigger sounds on `sendPrompt`, `agent_start`, `agent_settled`, `tool_execution_start`, `tool_execution_end`, and subagent events |
| `apps/desktop/src/renderer/modules/toast-store.ts` | `[MODIFY]` Trigger sounds on toast pushes (info, success, warning, error) |
| `modules/terminal/src/ui/terminal-registry.ts` | `[MODIFY]` Hook `term.onBell` to trigger terminal bell sound |
| `modules/plan-previewer/src/ui/PlanReviewBar.tsx` | `[MODIFY]` Trigger sounds on Plan Approve, Request Changes, and review open |
| `modules/plan-previewer/src/ui/DecisionCard.tsx` | `[MODIFY]` Trigger sound on decision radio selection |
| `apps/desktop/src/renderer/components/StatusBar.tsx` | `[MODIFY]` Add quick mute toggle button with volume indicator |
| `apps/desktop/src/renderer/components/TabStrip.tsx` | `[MODIFY]` Trigger subtle tab-switch sound on tab selection |

## Sound Catalog & Event Map

### 1. Agent & Assistant Lifecycle
- `prompt_send`: Crisp swoosh / soft send click when submitting a prompt.
- `agent_start`: Subtle warm intake breath / gentle rising tone as the model starts thinking.
- `tool_start`: Crisp tech blip / click when a tool execution begins (bash, read, edit, etc.).
- `tool_end`: Soft positive micro-tick when tool completes successfully.
- `tool_error`: Muted low error thud when a tool execution fails.
- `subagent_spawn`: Harmonic twin chirp when a subagent starts.
- `subagent_done`: Ascending harmonic micro-chord when subagent settles.
- `agent_settled`: Rich 2-tone / 3-tone harmonic completion chime when the assistant finishes responding.
- `agent_error`: Gentle descending error tone if agent run crashes or fails.

### 2. Plan Previewer & Approvals
- `plan_request`: Attention chime when a plan review card arrives or opens.
- `plan_choice`: Tactile micro-click when selecting a decision radio choice.
- `plan_approve`: Celebratory major chord resolution on plan approval.
- `plan_reject`: Soft double boop on requesting changes.

### 3. Terminal
- `terminal_bell`: Resonant 800Hz electronic bell ping on `term.onBell`.
- `terminal_command`: Subtle mechanical key return tap when commands run.

### 4. Notifications & Toasts
- `toast_info`: Soft glass tap.
- `toast_success`: Bright chime.
- `toast_warning`: Dual alert ping.
- `toast_error`: Low warning buzz.

### 5. UI Navigation
- `tab_switch`: Light paper/card flick on switching tabs.
- `modal_open`: Smooth swell pop on opening dialogs.
- `modal_close`: Soft muted drop pop on closing dialogs.
- `button_click`: Subtle haptic tactile click.

## Sound Themes
- **Modern Minimal (Default)**: Pure sine and bandpass filtered tones, subtle micro-clicks, warm chords.
- **Mechanical Tactile**: Realistic clicky switches, latch sounds, mechanical feedback.
- **Sci-Fi Synth**: Frequency FM sweeps, resonant tech chirps, futuristic UI sounds.
- **Retro 8-Bit**: Square waves, fast arpeggios, classic video game style beeps and coin chimes.

## Settings & User Control
- **Master Toggle**: Enable/disable all sounds globally.
- **Master Volume**: 0% - 100% volume slider (default: 60%).
- **Theme Selector**: Dropdown to switch sound themes instantly.
- **Category Toggles**:
  - Agent & Tools
  - Plan Previewer & Approvals
  - Terminal Bell
  - Notifications & Toasts
  - UI Interactions
- **Sound Test Matrix**: "Play" button next to every sound in Settings for instant preview.
- **Status Bar Icon**: Quick mute / unmute button in the bottom status bar.

## Risks
- **Autoplay restrictions**: Chromium AudioContext starts suspended until user interaction. We resume context automatically on first user click/keypress.
- **Sound overlapping / spam**: Rapid bursts of tool calls could sound chaotic. We implement a throttling and debouncing queue (minimum 50ms per sound ID, polyphony limits).

## Verify
- `npm run typecheck`: Confirm no TypeScript errors.
- `npm test`: Verify test suites pass without regressions.
- **Settings Check**: Open Settings -> Sound, test volume slider and preview buttons for every sound effect.
- **Agent Run Check**: Send a test prompt, verify `prompt_send`, `tool_start`/`end`, and `agent_settled` chime.
- **Plan Previewer Check**: Trigger a plan review, select choices, approve, and verify corresponding sound effects.
- **Terminal Bell Check**: Trigger bell in terminal and verify audio output.
- **Quick Mute Check**: Click status bar mute icon and confirm silence across all actions.
