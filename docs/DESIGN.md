# Hive Design System (`DESIGN.md`)

Hive is a desktop workbench for the Pi coding agent. It is designed as a **calm professional developer tool** (in the lineage of Rider, Linear, Sublime Merge, and VS Code), not an AI playground, toy, or mobile chat app.

---

## 1. Core Principles

1. **Calm Pro Tool**: The UI stays out of the user's way. Contrast is deliberate; backgrounds are grounded; grain and glow are restrained.
2. **Strict Accent Budget**: The accent color (`--accent-base`) is precious currency. It is reserved for:
   - At most **one** primary CTA per surface (e.g. the Composer `Send` button).
   - Active tab or selected view indicator.
   - Active execution status (e.g. running sweep indicator).
   Tool buttons, idle pickers, and secondary badges must use quiet neutral tokens.
3. **Information Density**: Controls are compact, aligned to a 4px grid, and predictable. Standard panel headers lock to 40px height. List rows lock to 28px height.
4. **Sentence Case Everywhere**: No tracked all-caps or shouting uppercase labels. Use standard sentence capitalization across tabs, panel headers, button labels, and status badges.
5. **No Monospace Overuse**: Monospace font (`--font-mono`) is strictly reserved for:
   - Source code snippets and editor buffers.
   - Terminal output and logs.
   - Inline code and file paths.
   UI numbers, percentages, timestamps, short hashes, kbd shortcuts, and branch names use Inter sans with `font-variant-numeric: tabular-nums`.

---

## 2. Scale Tokens

All sizes in CSS and TSX must reference these CSS custom properties. Raw pixel values outside these scales are rejected by the linter.

### Typography (`--fs-*`)

| Token | Size | Primary Usage |
|---|---|---|
| `--fs-xs` | 11px | Badges, timestamps, keyboard shortcuts, secondary status meta |
| `--fs-sm` | 12px | Compact toolbar buttons, secondary labels, subagent meta, chips |
| `--fs-base` | 13px | Standard UI body, list row titles, input text, tabs |
| `--fs-md` | 14px | User message bubbles, modal body text, headings level 4 |
| `--fs-lg` | 16px | Section headings, card titles, modal titles |
| `--fs-xl` | 20px | Major page headers, summary stats |
| `--fs-2xl` | 24px | Hero counters, large KPI metric numbers |

### Corner Radii (`--radius-*`)

| Token | Radius | Primary Usage |
|---|---|---|
| `--radius-xs` | 3px | Keyboard shortcuts (`kbd`), inline code tags, compact status dots |
| `--radius-sm` | 4px | Standard buttons, input controls, picker triggers, chips |
| `--radius-md` | 6px | Message cards, dropdown menus, context flyouts, tool batch containers |
| `--radius-lg` | 8px | Modals, command palette dialog, hero KPI cards |

### Control Heights (`--control-*`)

| Token | Height | Primary Usage |
|---|---|---|
| `--control-sm` | 24px | Compact composer pickers (Mode, Model, Thinking), inline action buttons |
| `--control-md` | 28px | Tabs, standard buttons, sidebar inputs, list item rows |
| `--control-lg` | 32px | Primary action buttons, prominent dialog actions |

---

## 3. Shared Component Primitives (`ui.css`)

Always prefer the shared class primitives over custom one-off inline styles:

### Buttons (`.ui-btn`)
- `.ui-btn`: Base button styling with consistent focus ring, font, and padding.
- `.ui-btn--primary`: Solid accent background. Use for the single primary CTA on a view.
- `.ui-btn--ghost`: Transparent background, subtle hover highlight.
- `.ui-btn--danger`: Destructive actions (discard worktree, delete session).
- `.ui-btn--sm` / `.ui-btn--md` / `.ui-btn--lg`: Sizing modifiers matching `--control-*`.

### Cards & Sections
- `.ui-card`: Background `var(--bg-card)`, border `var(--border-subtle)`, radius `var(--radius-md)`.
- `.ui-card--elevated`: Used for floating overlays, popups, and dropdown menus.
- `.ui-section`: Standard collapsible section header with chevron and item counter badge.

### Inputs & Toggles
- `.ui-input`: Standardized input field with focus ring and `--radius-sm`.
- `.ui-switch`: Clean toggle switch with fluid sliding thumb.
- `.ui-range`: Custom range slider styled to match the theme slider track.

### Badges, Chips & Model Suffixes
- `.ui-chip`: Neutral pill tag for filters, metadata, and git branches.
- `.ui-badge`: Compact status indicator (ok, warn, error).
- `.ui-kbd`: Semantic keyboard shortcut styled with sans font and tabular numerals.
- `.ai-model-chip`: Quiet suffix label (`.ai-model-chip`) displaying the model name as muted text, rather than a prominent bright pill.

---

## 4. Anti-Patterns (Never Do These)

1. **Loud AI Theme**: Do not use cartoon speech-bubble shapes with pointy tails, bright sparkling wand tiles, or rainbow gradients. User messages are neutral cards.
2. **Persistent Warning/Accent on Idle Controls**: Never style idle controls (like `Auto Edit` or `Reasoning: High`) with permanent yellow or orange borders. When inactive or standard, they must look like neutral secondary controls.
3. **Hardcoded Pixel Values**: Do not write `font-size: 10px`, `border-radius: 5px`, or custom heights that conflict with the scale tokens.
4. **All-Caps Text**: Do not use `text-transform: uppercase` or tracked capital letters for section headers, tags, or buttons. Use standard sentence case.
5. **Monospace Everywhere**: Do not put git commit hashes, timestamps, kbd tags, or UI numbers into monospace font. Use Inter with `tabular-nums`.

---

## 5. Automated Verification

Hive enforces design system compliance via automated linting:

```bash
npm run lint:css
```

This runs:
1. `scripts/check-css-motion.mjs`: Checks for prohibited transitions and animation curves.
2. `scripts/check-css-system.mjs`: Scans all CSS and TSX files for disallowed pixel font sizes, non-scale border radii, and uppercase text transforms.
