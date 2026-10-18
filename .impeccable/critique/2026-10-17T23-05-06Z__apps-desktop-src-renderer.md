---
target: Hive desktop app (round 2 UX fixes)
total_score: 34
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 0
target_identity: "file:C:\\Users\\talel\\Documents\\Hive\\.hive-worktrees\\use-taste-skills-and-emil-diesi-ecb26b\\apps\\desktop\\src\\renderer"
timestamp: 2026-10-17T23-05-06Z
slug: apps-desktop-src-renderer
---
Method: dual-assessment (A: live operate & visual review · B: deterministic detector run; desktop)

## Design Health Score — 34/40 (Good / Strong, +7 from 27/40 baseline)
| # | Heuristic | Score | Status / Resolution |
|---|---|---|---|
| 1 | Visibility of System Status | 4 | Context ring is a labelled button with tooltip, aria-label ("Context: 0 of 1M tokens used (0%). Open breakdown"), and threshold stroke/text colors; status-bar quota numbers use tokenized status colors. |
| 2 | Match System / Real World | 4 | Replaced jargon: "Compaction" → "Context", "Browser & RAM" → "Browser". |
| 3 | User Control and Freedom | 4 | Subagent runs collapse/expand on demand with agent count disclosure; overlay dismisses on Esc/outside click; tabs close cleanly. |
| 4 | Consistency and Standards | 4 | Accent discipline enforced: tab strip underline and chrome elements use theme accent; project color appears only in project picker list and avatars. |
| 5 | Error Prevention | 3 | Auto Edit mode displays a one-time dismissible explanation before autonomous execution; clear risk chip. |
| 6 | Recognition Rather Than Recall | 4 | Rail icons have styled tooltips with shortcuts (300ms delay, instant warm, keyboard visible); Settings grouped into General, AI, Extensions, App. |
| 7 | Flexibility and Efficiency | 4 | Empty state offers 3 instant recent session resumes and 3 pre-filling starter prompt chips; command palette and shortcuts throughout. |
| 8 | Aesthetic and Minimalist Design | 4 | Subagent sessions (reviewer, verifier, scout, planner) nested under parents; clean sidebar; quieted notifications and calm neutral palette. |
| 9 | Error Recovery | 3 | Plain-language error banner translates raw exceptions into actionable messages with "Compact conversation" recovery action. |
| 10 | Help and Documentation | 3 | Empty state provides structured onboarding with contextual starter chips; Auto Edit hint explains mode autonomy. |

## Detector
CLI: 0 findings across `apps/desktop/src/renderer` and `modules` (0 findings in both runs).

## Verification of Round-2 Changes
- **Nested Subagents**: 36 agent groups successfully nested under their parent sessions with disclosure chevrons and counts (`> 11 agents`), expanding to show status checkmark, agent type, `#id`, and age.
- **Rail Tooltips**: Fast styled tooltips with shortcut keys on hover and keyboard focus without native title tooltip collisions.
- **Context Ring & Reload**: Token ring converted to an accessible button with aria-label, tooltip, and tone thresholds; reload button equipped with tooltip.
- **Accent Discipline**: Active tab underline unified to `--accent-base`; project dot removed from title-bar project trigger.
- **Settings Reorganization**: 11 settings items categorized into 4 semantic groups (`GENERAL`, `AI`, `EXTENSIONS`, `APP`) with clarified navigation labels.
- **Starter Chips & Recents**: Empty transcript populated with 3 recent project sessions and 3 clickable starter prompt chips that pre-populate the composer.
- **Plain-language Errors & Hint**: Clear error headlines with compaction recovery and Auto Edit dismissible callout.
