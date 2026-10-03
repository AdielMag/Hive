# Feature Plan: Auxiliary AI Model Configuration & Compact Indicators

<!-- SUMMARY -->
Add user-configurable AI model selection in Settings for auxiliary AI features (AI Commit Message generation, AI Usage Insights, and quick AI prompts), accompanied by an ultra-compact, space-saving model badge indicator and informative tooltips across all auxiliary AI touchpoints in Hive Studio.

### What is changing:
1. **Settings > Models Tab**: Add a "Feature Models & Auxiliary AI" configuration section allowing users to choose the model for:
   - **Git Commit Message generation** (Active Session Model, Pi CLI Default, or any enabled catalog model).
   - **AI Usage Insights** (Active Session Model, Pi CLI Default, specific catalog model, or fast deterministic analyzer).
2. **Persistent Store (`feature-models-store.ts`)**: Zustand store backed by `localStorage` (`hive.feature-models.v1`) to persist choices and resolve active/fallback models.
3. **Ultra-Compact Model Indicator (`AiModelChip.tsx`)**: A tiny, 9px micro-badge with rich tooltip (`AI Model: <name> (<source>) · Configure in Settings`) designed specifically to take negligible horizontal space and prevent layout crowding.
4. **GitPanel**: Show model chip on the "AI Message" button, include model in the button tooltip, and pass the configured model to the Pi CLI one-shot commit message generator.
5. **UsageView & AI Usage Insights Modal**: Show model chip on "Analyze with AI" and in the insights modal header; optionally invoke Pi CLI for LLM-powered telemetry analysis when a model is selected.
6. **Diff & File Viewers**: Display active model chip and tooltip on "Ask Pi" buttons.

<!-- FULL -->

## Architecture & Data Flow

```
┌────────────────────────────────────────────────────────┐
│ Settings > Models (ModelsSettingsContent.tsx)          │
│ - Configure Git Commit Model (Session / Default / Custom)│
│ - Configure Usage Analysis Model (Session / Default / etc)│
└──────────────────────────┬─────────────────────────────┘
                           │ updates
                           ▼
┌────────────────────────────────────────────────────────┐
│ feature-models-store.ts (Zustand + localStorage)       │
│ - Persists: gitCommit, usageAnalysis preferences       │
│ - Resolves: active model ID, display name, short badge  │
└──────┬───────────────────┬──────────────────────┬──────┘
       │                   │                      │
       ▼                   ▼                      ▼
┌──────────────┐   ┌──────────────┐       ┌──────────────┐
│ GitPanel.tsx │   │ UsageView &  │       │ Diff & File  │
│ [AI Message] │   │ InsightsModal│       │ Viewers      │
│  <Chip/>     │   │  <Chip/>     │       │ [Ask Pi]<Chip│
└──────┬───────┘   └──────┬───────┘       └──────────────┘
       │                   │
       ▼                   ▼
┌────────────────────────────────────────────────────────┐
│ Main Process IPC (git.generateCommitMessage / Usage)    │
│ - Runs Pi CLI with selected `--model <resolvedModelId>` │
└────────────────────────────────────────────────────────┘
```

## Detailed Implementation Steps

### 1. Feature Models Store (`apps/desktop/src/renderer/store/feature-models-store.ts`)
- Interface `FeatureModelConfig`: `{ source: "session" | "pi-default" | "custom"; modelId?: string }`
- Interface `ResolvedFeatureModel`:
  - `id: string` (e.g. `anthropic/claude-3-5-haiku` or `gemini-3.8-flash`)
  - `name: string` (e.g. `Claude 3.5 Haiku`)
  - `shortName: string` (e.g. `haiku`, `flash`, `opus`, `sonnet`, `pro`)
  - `provider?: string`
  - `sourceLabel: string` (e.g. `Active Session`, `Settings Override`, `Pi Default`)
- Helper `getShortModelName(id, name)`: cleans long IDs into concise 4-8 char pills.
- Helper `resolveFeatureModel(config, sessionModel, defaultModel, catalog)`: computes the active model and source description with zero flicker.

### 2. Ultra-Compact Indicator Component (`apps/desktop/src/renderer/components/AiModelChip.tsx`)
- Micro-pill design:
  - Font size: `9px`
  - Line height: `1`
  - Padding: `1.5px 5px`
  - Rounded: `3.5px`
  - Color: `var(--accent-base)` with subtle background `rgba(var(--accent-rgb), 0.12)`
  - Maximum width: `60px` (with ellipsis)
- Tooltip: `title="Model: ${model.name || model.id} (${model.sourceLabel})\nClick to change in Settings > Models"`
- Clicking the chip opens the Settings modal on the Models tab.

### 3. Settings UI: Feature Models Section (`apps/desktop/src/renderer/components/ModelsSettingsContent.tsx`)
- Add a new section **"Dedicated Feature Models"**:
  - Row for **Git Commit Message**:
    - Mode selector: "Active Session Model" | "Pi Default Model" | "Choose Specific Model"
    - If "Choose Specific Model", a clean select dropdown populated from all catalog/enabled models.
    - Live preview chip showing the resulting indicator.
  - Row for **AI Usage Insights**:
    - Mode selector: "Active Session Model" | "Pi Default Model" | "Choose Specific Model" | "Fast Local Analyzer"
    - Live preview chip showing the resulting indicator.

### 4. Git Commit Message (`apps/desktop/src/renderer/components/GitPanel.tsx`)
- Subscribe to `useFeatureModelStore` to resolve the commit message model.
- Embed `<AiModelChip model={commitModel} />` inside the "AI Message" button.
- Update button tooltip to clearly show the model being used.
- Pass `commitModel.id` to `window.studio.generateCommitMessage(activeProject.path, commitModel.id)`.

### 5. Usage Insights (`UsageView.tsx` & `AiUsageInsights.tsx`)
- Subscribe to `useFeatureModelStore` to resolve the usage analysis model.
- Embed `<AiModelChip model={usageModel} />` inside the "Analyze with AI" button.
- Embed `<AiModelChip model={usageModel} />` in the `AiUsageInsightsModal` header.
- Update tooltips to display model name and source.
- Add IPC `window.studio.generateUsageInsights` (via `IPC.aiGenerateUsageInsights`) to allow LLM synthesis when an AI model is configured, with instant deterministic fallback.

### 6. Quick AI Actions in DiffViewer & FileViewer
- In `DiffViewerTab.tsx` and `FileViewerTab.tsx`, show the active model tooltip and compact chip on the "Ask Pi" buttons so users immediately know which model will answer.

## Verification Strategy
- **Unit Tests**:
  - Test `feature-models-store.ts` for default values, persistence, and resolution logic (session vs custom vs pi-default).
  - Test `getShortModelName` edge cases (haiku, opus, flash, custom names, provider prefixes).
- **Automated Suite**: Run full `npm test` across all 46 suites to ensure zero regressions.
- **Manual Verification**:
  - Verify GitPanel button layout: ensure commit button is not cramped on narrow sidebars.
  - Verify Settings dropdown saves and updates badges immediately across all tabs.
