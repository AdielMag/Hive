---
target: Hive desktop app (full UI/UX)
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:C:\\Users\\talel\\Documents\\Hive\\.hive-worktrees\\use-taste-skills-and-emil-diesi-ecb26b\\apps\\desktop\\src\\renderer"
timestamp: 2026-10-17T21-42-31Z
slug: apps-desktop-src-renderer
---
Method: dual-agent (A: general-purpose design review · B: verifier detector run; desktop, sequential)

## Design Health Score — 27/40 (Acceptable, upper edge)
| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | Quota meters/run bar good; onboarding gate flashes on cold start; context limit jumps 200k→1M while "Loading model…" |
| 2 | Match System / Real World | 3 | "3P", "Gem", bare "Medium" cryptic |
| 3 | User Control and Freedom | 3 | Auto Edit is default + one click, no confirm |
| 4 | Consistency and Standards | 2 | chip heights/radii vary; branch picker truncates to "h"; right panel width varies |
| 5 | Error Prevention | 2 | Auto Edit green = "safe"; Discard adjacent to Merge |
| 6 | Recognition Rather Than Recall | 3 | 12 icon-only rail items |
| 7 | Flexibility and Efficiency | 4 | palette w/ scopes, shortcuts, split panes, modules |
| 8 | Aesthetic and Minimalist | 2 | sidebar rows ~5 data points, branch chips wrap to 3 lines; brown-on-brown planes |
| 9 | Error Recovery | 3 | clean "panel isn't available" state |
| 10 | Help and Documentation | 2 | nothing after first-run gate |

## Priority issues
- [P1] Onboarding gate flashes for returning users: WorkbenchLayout.tsx:93 renders on projects.length===0 before projects load. Fix: projectsLoaded flag.
- [P1] Sidebar session rows overloaded: wrapped worktree chip (3 lines), icon per row, relative age wrapping. Fix: single-line title + one meta line (age · branch truncated middle), branch chip on hover/selected.
- [P1] Narrow window (1100x700) crushes centre pane to ~370px. Fix: auto-collapse right panel / min centre width.
- [P2] Auto Edit default + green styling + no confirmation; Discard next to Merge. Fix: amber tint for write modes, separate/confirm Discard.
- [P2] Chrome hierarchy flat: rail/sidebar/panels/composer same warm-brown value; green Update pill w/ infinite bounce (settings.css:254) and colourful chips compete with content. Fix: 3-step surface ladder, quiet update affordance, chips neutral until non-default.

## Detector
CLI: 9 findings — side-tab ×8 (code.css:282, settings.css:573, reload-controls.css:52, model-switch-cache-bar.css:24, actions.css:673, plan.css:342/419/457), bounce-easing ×1 (settings.css:254). CDP scan unsupported in this detector build.

## Minor
transition: all ×18; few :active press states; tabular-nums missing in composer context count + status bar %; 14 outline:none overrides vs global :focus-visible (theme.css:90); reduced-motion missing in transcript/composer CSS; spend chart spline dips below $0; Ctrl+K mono chip; new empty tab shows worktree bar; low-contrast "pi 0.99.2"/"Show archived".
