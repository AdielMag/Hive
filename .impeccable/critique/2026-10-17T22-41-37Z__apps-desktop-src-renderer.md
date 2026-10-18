---
target: Hive desktop app (re-run after overhaul)
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:C:\\Users\\talel\\Documents\\Hive\\.hive-worktrees\\use-taste-skills-and-emil-diesi-ecb26b\\apps\\desktop\\src\\renderer"
timestamp: 2026-10-17T22-41-37Z
slug: apps-desktop-src-renderer
---
Method: dual-agent (A: general-purpose design review · B: verifier detector run; desktop, sequential)

## Design Health Score — 27/40 (Acceptable, upper edge; same total as run 1, different issue set)
| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | quota bars + context ring good; ring/refresh unlabeled; quota % has no threshold meaning |
| 2 | Match System / Real World | 3 | "Compaction", "Browser & RAM" jargon |
| 3 | User Control and Freedom | 3 | closable tabs, overlay Esc/outside close |
| 4 | Consistency and Standards | 3 | row heights/radii mostly unified; accent colours vary (cyan tab underline, blue dot, orange) |
| 5 | Error Prevention | 2 | Auto Edit amber but default, no extra cue |
| 6 | Recognition Rather Than Recall | 3 | ~11 icon-only rail buttons |
| 7 | Flexibility and Efficiency | 4 | palette, shortcuts, splits |
| 8 | Aesthetic and Minimalist | 2 | subagent sessions flood sidebar; many competing peripheral elements |
| 9 | Error Recovery | 2 | not exercised live |
| 10 | Help and Documentation | 2 | empty state one line, no starters |

## Priority issues
- [P1] Subagent sessions (reviewer#…, verifier#…) flood the sidebar; nest under parent session, collapse, status icons; keep branch tail.
- [P1] ~11 icon-only rail buttons; group, label on hover, move rare ones to palette.
- [P2] Context ring 0/1M + refresh unlabeled; label/tooltip, threshold colour.
- [P2] Accent discipline: one accent + semantic status colours.
- [P3] Settings nav 11 flat items; group General / Models / System.

## Detector
CLI: 0 findings (renderer + modules), down from 9 (side-tab ×8, bounce-easing ×1 all resolved). CDP scan unsupported in this detector build.

## Resolved since run 1
Onboarding flash, narrow-window squeeze, sidebar row wrapping, Discard placement, green Auto Edit, loud update pill, brown frame, side stripes, transition: all, 200k placeholder, Gem/3P labels, branch picker "h".
