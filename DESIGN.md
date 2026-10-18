# Hive design system

Mode: **Operate** (desktop app for running AI coding sessions). Scanability, consistency and speed outrank expression. Brand lives in precise details.

## Tokens (`apps/desktop/src/renderer/styles/theme.css`)
- Surfaces: `--bg-app` < `--bg-card` < `--bg-elevated`; frame uses `--frame-*`. Neutral ladder, warm tint.
- Text: `--text-primary` / `--text-secondary` / `--text-muted` (muted holds 4.5:1).
- Accent: `--accent-base` (theme-driven, written to `:root` by the appearance store). One accent. Project colour appears only in the project picker and avatars.
- Status: `--success` `--warning` `--danger` `--info`.
- Motion: `--ease-out` (enter/exit, default), `--ease-in-out` (on-screen movement), `--ease-drawer` (panels/sidebars). Never `ease-in`.

## Motion rules (emil-design-eng)
- Under 300ms for UI. Press feedback 100-160ms. Panels up to 300ms.
- No animation on keyboard-triggered surfaces (command palette).
- No `transition: all`; no `scale(0)`; start from `scale(0.95)` + opacity.
- Buttons press to `scale: 0.98` (global rule in `theme.css`); wide rows, tabs and menu items are excluded.
- Reduced motion: global guard in `theme.css` kills durations and press scale.
- Popovers scale from their trigger; modals stay centred.

## Type
- Inter Variable UI, JetBrains Mono for code. 13px base.
- Numbers that change (counts, costs, timers, tokens) use `tabular-nums`.
- Headings and empty-state titles use `text-wrap: balance`.

## Focus
- Global `:focus-visible` ring: 2px `--accent-base`, 1px offset.
