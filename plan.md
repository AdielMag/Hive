# Multi-Project Session Tabs Distinction

Add visual project indicators (color accent, custom icon/emoji, and project tag) to workbench tabs so users can instantly tell which project each session belongs to.

## Approach
- Pass project metadata to workbench tabs and compute whether open tabs span multiple projects.
- Style each tab with its project color: tint tab icons, color the active indicator bar, and show a compact project badge (with project icon or color pip).
- Add project icon/emoji support to Project Settings and project pickers so projects can have custom icons in addition to their color.
- Include project name in tab tooltips and context menus for clear identification.

## Decisions

> [!CHOICE] Tab badge display mode
> **Question**: When should the project name label be shown on the tab?
> - (x) **Adaptive badge**: show project name tag when tabs from 2+ projects are open, colored dot/icon always [Recommended]
> - ( ) **Always tag**: always display project name chip on every tab that belongs to a project
> - ( ) **Color/icon only**: only tint icon and show dot/icon, never show project name text in the tab

<!-- MORE -->

## Changes

| File | Change |
|---|---|
| `packages/protocol/src/projects.ts` | Ensure `ProjectEntry.icon` is supported across project creation/updating |
| `apps/desktop/src/main/store/index.ts` | Support `icon` in `updateProject` updates parameter and persistence |
| `apps/desktop/src/renderer/components/TabStrip.tsx` | Connect `projects` store, compute multi-project status, render project indicator badge/icon, and update tooltip |
| `apps/desktop/src/renderer/styles/shell.css` | Add `.tab__project-badge`, `.tab__project-dot`, `.tab__project-name`, `--tab-pcolor` custom properties |
| `apps/desktop/src/renderer/components/ProjectSettingsModal.tsx` | Add project icon/emoji picker with presets and custom input |
| `apps/desktop/src/renderer/components/ProjectPicker.tsx` | Render project custom icon/emoji when configured |

## Risks
- Horizontal tab space: long project names could crowd tab titles; mitigated with `max-width`, truncation, and adaptive multi-project display.

## Verify
- Open sessions across two different projects: verify tabs show distinct project colors and badges.
- Verify active tab indicator matches the project's curated color.
- Change project color and icon in Project Settings: verify tabs and pickers update immediately.
- Hover tab: verify tooltip shows `[Project Name] Session Title`.
