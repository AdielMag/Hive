<!-- SUMMARY -->
# Sample Test Plan (Executive Summary)

This is a comprehensive test plan to verify Plan Previewer rendering, inline interactive decision cards, callouts, outline generation, and review action states.

## High-Level Approach
- Unified document-first design without cluttered sidebars or modals
- Real-time decision resolution with keyboard accessibility

## Key Decisions

> [!CHOICE] Storage Engine
> **Question**: Which storage engine should be used?
> - (x) **SQLite**: Embedded and zero configuration [Recommended]
> - ( ) **PostgreSQL**: Robust client-server engine

> [!QUESTION] Migration Strategy
> **Question**: How should legacy records be backfilled?

## Callouts & Invariants

> [!NOTE] Design System Alignment
> All colors use defined Hive tokens from the theme system.

> [!IMPORTANT] Protocol Invariant
> Never ask questions in chat while review is open.

## Milestones
- [ ] 1. Core parsing and segmentation
- [ ] 2. Layout, CSS, and interaction polish
<!-- /SUMMARY -->

<!-- FULL -->
# Sample Test Plan (Full Specification)

## 1. Architectural Details
The Plan Previewer renders plans as calm documents with a single sticky review bar at the bottom.

> [!CHOICE] Storage Engine
> **Question**: Which storage engine should be used?
> - (x) **SQLite**: Embedded and zero configuration [Recommended]
> - ( ) **PostgreSQL**: Robust client-server engine

> [!CHOICE] Execution Target
> **Question**: Which execution mode should be the default?
> - (x) **Auto Edit**: Autonomous tool execution
> - ( ) **Manual**: Propose diffs with user confirmation

## 2. Risk Evaluation & Callouts

> [!TIP] Keyboard Shortcuts
> Use arrow keys to toggle radio options, and Ctrl+Enter to submit changes.

> [!WARNING] Token Compatibility
> Undefined CSS tokens will cause visual regressions.

> [!CAUTION] Destructive Operations
> File deletions cannot be undone without git version control.

## 3. File Breakdown

| File | Change | Description |
|---|---|---|
| `src/ui/PlanPreviewerTab.tsx` | `[MODIFY]` | Segment-based document rendering |
| `src/ui/DecisionCard.tsx` | `[NEW]` | Inline interactive decision card |
| `src/ui/PlanActivitySidebar.tsx` | `[DELETE]` | Removed cluttered activity sidebar |

## 4. Verification Suite
1. Run all unit tests with `vitest`.
2. Verify token usages in `plan.css`.
3. Test dual-view switching between Summary and Full views.
<!-- /FULL -->
