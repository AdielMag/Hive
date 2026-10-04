<!-- SUMMARY -->
# Plan Previewer — declutter & redesign

Make the Hive plan tab read like a **document with one action bar** instead of a dashboard. The plan text comes first. Every control appears once, and clutter only shows up when it's needed. The agent skills get the same treatment: shorter plans, each decision written once, and only syntax that Hive actually renders.

## What's wrong today
- **Too many surfaces:** header (9 controls), summary banner, toast, decisions tray, outline, activity sidebar, footer, and a modal all compete for attention. Decision progress shows up 3 times.
- **Duplication:** decisions appear in the tray *and* again in the activity sidebar. The skill template writes each decision twice, so the tray shows D1–D4 for 2 real decisions.
- **Broken styling:** `plan.css` (1,207 lines) uses 5 CSS tokens that Hive doesn't define, so colors and hovers fall back unpredictably.
- **Unrendered syntax:** `> [!NOTE]` / `[!WARNING]` show as literal text, and `mermaid` shows as raw code.
- **UX bugs:** Approve isn't blocked while agent questions are pending. After "Request changes" nothing tells you it worked. Outline collapse doesn't collapse anything. Selections are lost or mismatched when the agent revises the plan.

## Target experience
- **Slim header (40px):** file name, status dot, `Summary | Full` (only when both views exist), and a `⋯` menu (width, outline, open source).
- **Document column:** decisions render **inline where the author wrote them**, as compact cards. A resolved card folds to one line ("Cache → Redis · Change"). Callouts render natively.
- **One review bar:** comment box · `2/3 decided` chip (jumps to the next open decision) · `1 note` chip · **Request changes** · **Approve ▾** (split button: Auto Edit / Manual).
- **Clear states instead of modals:** *Needs your input* (agent `--ask` card at the top, primary action becomes **Send answers**), *Changes sent — waiting for agent*, *Approved — running in Auto Edit*.
- **Skills:** a short, size-scaled template. At most 3 decisions, each written once with a recommended default. At most 2 callouts. No mermaid or emoji. The always-on AGENTS block shrinks to a few lines.

## Key decisions

> [!CHOICE] Where decisions live
> **Question**: How should `[!CHOICE]` / `[!QUESTION]` blocks be shown?
> - (x) **Inline in the document**: rendered as cards exactly where the author placed them; the review bar shows progress and jumps to the next open one [Recommended]
> - ( ) **Compact tray at top**: keep a single tray above the document, but slimmer and collapsed once all are resolved

> [!CHOICE] Right "Activity" sidebar
> **Question**: What replaces the activity sidebar?
> - (x) **Remove it**: notes become persistent text highlights, plus a `N notes` popover in the review bar; agent replies show as one small card at the top of the doc [Recommended]
> - ( ) **Keep a slim notes panel**: hidden by default, opens automatically on the first note, shows only notes and agent replies (no echo of choices)

> [!CHOICE] Dual SUMMARY/FULL views in the skill
> **Question**: Should every plan still need SUMMARY + FULL sections?
> - (x) **Only for large plans**: single view by default; add SUMMARY/FULL when the plan runs past ~80 lines or spans several subsystems [Recommended]
> - ( ) **Always required**: keep the dual view mandatory, just with a leaner template

## Milestones
- [ ] 1. Parsing foundation: segmenter, decision de-dupe, callouts, heading ids (+ tests)
- [ ] 2. New layout: header, inline decision cards, review bar, states; remove sidebar, banner, modal
- [ ] 3. CSS rewrite on real Hive tokens and shared `ui-*` primitives (target ≤ 500 lines)
- [ ] 4. Skills + AGENTS block rewrite, synced to `~/.pi/agent`
- [ ] 5. Verify with a fixture plan covering every state, then fresh-eyes review
<!-- /SUMMARY -->

<!-- FULL -->
# Plan Previewer — declutter & redesign

Scope: `modules/plan-previewer/**` only (UI, parser, store, skills, AGENTS block). No changes to Hive core, the CLI protocol, or the feedback file format, except using the existing `answered` status from the renderer.

## 1. Audit (evidence)

| Area | Finding | Where |
|---|---|---|
| Tokens | `--fg-muted` (31 uses), `--fg-base` (23), `--bg-hover` (18), `--border-strong` (7), `--bg-canvas` (2) are not defined anywhere in Hive | `src/ui/plan.css` |
| Header | Outline toggle, fake "Hive Agent / Plan Review" avatar, filename + H1 goal, progress bar, Summary/Full, Narrow/Wide/Full, status pill, activity toggle, close button (the tab strip already has one) | `PlanHeader.tsx` |
| Redundancy | Progress shown in the header, the tray badge, and the activity count. Choices are echoed in the sidebar. The summary banner repeats the view toggle | `PlanHeader`, `PlanDecisions`, `PlanActivitySidebar`, `PlanPreviewerTab` |
| Double decisions | `extractDecisions()` scans the *raw* file, so blocks repeated in SUMMARY and FULL (as the skill template tells authors to do) become D1–D4 | `plan-utils.ts`, skill template |
| Lost context | Decision blocks are stripped from the body and moved into a tray, away from the paragraph that explains them | `PlanPreviewerTab.tsx` (`bodyMarkdown`) |
| Markdown | Host `Markdown` = react-markdown + GFM only: no alerts, no heading ids, mermaid shows as code | `apps/desktop/.../code/Markdown.tsx` |
| Outline | Per-H1 chevrons toggle state but never hide children. Click-to-scroll uses a different slug function than the TOC. No scroll-spy | `PlanOutline.tsx`, `PlanPreviewerTab.tsx` |
| Ask flow | Approve stays enabled while `--ask` questions are pending (the skill says the opposite). There is no "Send answers" action, so answers only travel with Approve or Request changes | `PlanFooter.tsx`, `plan-store.ts` |
| Feedback | Nothing visible after Request changes. Approval opens a modal that also covers the plan | `PlanPreviewerTab.tsx` |
| Revisions | Selections are keyed by positional id (`D1`), so the wrong answer attaches when the agent reorders or inserts decisions | `plan-store.ts` `updateFromDisk` |
| Mode menu | `div` items, no click-outside or Escape handling, no keyboard support | `PlanFooter.tsx` |

## 2. Target layout

```
┌──────────────────────────────────────────────────────────────────────┐
│ ☰  ▤ plan.md  ● Awaiting review   ↻ Updated +12 −3   [Summary|Full] ⋯ │  40px
├────────────┬─────────────────────────────────────────────────────────┤
│ Outline    │   ┌ Agent needs your input ─────────────── (if --ask) ┐ │
│ (auto-hide │   └───────────────────────────────────────────────────┘ │
│  < 1100px, │   # Title                                              │
│  H2/H3,    │   paragraph…                                           │
│  scrollspy)│   ┌ D1  Cache backend ───────────────── Needs decision ┐ │
│            │   │ ◉ Redis — fast, pub/sub        Recommended          │ │
│            │   │ ○ SQLite — zero deps                                │ │
│            │   └─────────────────────────────────────────────────────┘ │
│            │   ✓ D2  Rollout → Feature flag · Change   (resolved = 1 line)
├────────────┴─────────────────────────────────────────────────────────┤
│ [ Comment for the agent…            ]  2/3 decided  1 note           │
│                                    [Request changes] [Approve ▾]     │  ~52px
└──────────────────────────────────────────────────────────────────────┘
```

**Review bar states** (replace the modal and toast):

| State | Bar shows | Primary action |
|---|---|---|
| Reviewing | comment · progress chip · notes chip | **Approve ▾** (Auto Edit default / Manual in the menu) |
| Agent asked (`--ask` pending) | "Answer N questions above" | **Send answers** (status `answered`), disabled until all are answered. Approve hidden |
| Changes sent | "Sent to agent · waiting for revision…" + Undo-free spinner | none (inputs locked until the next `planUpdated`) |
| Approved | "✓ Approved · agent running in Auto Edit" | none (document read-only) |

## 3. Implementation

### 3.1 Parsing — `src/plan-utils.ts` `[MODIFY]`
1. `slugify(text)`: one shared function used by the TOC, heading-id assignment, and scrolling.
2. `segmentPlan(markdown)` → `Array<{kind:"md",text} | {kind:"decision",item:DecisionItem} | {kind:"callout",type,body}>`. Splits on `> [!CHOICE|QUESTION|NOTE|TIP|IMPORTANT|WARNING|CAUTION]` blockquotes, allows indented `>` (fixes the current mismatch between the block regex and the strip regex), and ignores blockquotes inside fenced code.
3. `extractDecisions(markdown)` runs on the **active view**, not the raw file. It de-dupes by normalized title across views, so a decision repeated in SUMMARY and FULL is one item with one id. Ids stay `D#`/`Q#`, but each item also gets a stable `key = slugify(title)`.
4. Option parsing: split `**Name**: description` into `label` + `detail` so cards can show the name in bold and the reason in muted text.
5. Title helper: strip `(Executive Summary)` / `(Full Specification)` suffixes, which come from the old template.

### 3.2 Store — `src/ui/plan-store.ts` `[MODIFY]`
- Key `selections` / `draftAnswers` by decision `key` (title slug), so they survive agent revisions and reordering. Payload ids still send `D#`.
- `widthMode: "comfortable" | "wide"` (drop `full`). Remove `collapseRight`. `outlineOpen` is `null` = auto (by tab width) or a user override.
- Add `phase: "reviewing" | "answering" | "sent" | "approved"`, derived from `agentQuestions` and the submit results. A `planUpdated` event moves `sent` back to `reviewing`.
- `submitFeedback("answered")` sends only `answers[]`, without approve or changes. Approve is guarded when questions are pending.
- Replace `toastMessage` with `lastUpdate: {additions, deletions, at} | null`, cleared when you click the header chip.

### 3.3 Components — `src/ui/`
| File | Action | Change |
|---|---|---|
| `PlanPreviewerTab.tsx` | `[MODIFY]` | Render `segmentPlan()` output: `md` → host `Markdown`, `decision` → `DecisionCard`, `callout` → `PlanCallout`. After render, a post-pass assigns heading ids and tags `` `[NEW]` `` / `` `[MODIFY]` `` / `` `[DELETE]` `` code spans as badges. Add an IntersectionObserver scroll-spy and a ResizeObserver for auto-hiding the outline. Remove the summary banner, toast banner, and approval modal |
| `PlanHeader.tsx` | `[MODIFY]` | Outline toggle · file icon + name · status dot · "Updated +x −y" chip · `ui-seg` Summary/Full (only if both views exist) · `⋯` menu (Reading width, Show outline, Open source file, Copy path). Remove the avatar, H1 goal, progress bar, width segment, activity toggle, and close button |
| `PlanDecisions.tsx` → `DecisionCard.tsx` | `[MODIFY]`/rename | A single inline card. Unresolved: accent left rail and "Needs decision". Resolved: folds to one line with "Change". Options are real radio buttons (arrow keys, `1–9`), with the label in bold, the detail muted, and a small "Recommended" text tag (no sparkles). An `(x)` default shows as resolved with an "agent default" hint |
| `PlanCallout.tsx` | `[NEW]` | GitHub-style alert: thin rail, icon, label. Note/Tip/Important/Warning/Caution map to the info/success/accent/warning/danger tokens |
| `PlanAskCard.tsx` | `[NEW]` | Agent `--ask` questions moved out of the footer into a card pinned at the top of the doc |
| `PlanReviewBar.tsx` (was `PlanFooter.tsx`) | `[MODIFY]`/rename | Auto-growing 1→6-row comment (Ctrl+Enter = Request changes) · progress chip (jumps to the next open decision) · notes chip (popover list with delete and jump) · ghost **Request changes** · split **Approve ▾** with an accessible menu (Esc, click-outside, arrow keys). Includes the state variants from §2 |
| `PlanOutline.tsx` | `[MODIFY]` | Flat H2/H3 list with active-heading highlight. Remove the broken chevrons and the collapse/expand-all buttons |
| `PlanSelectionPopover.tsx` | `[MODIFY]` | Two steps: a small **Comment** pill near the selection, which expands into a compact input. Saved notes stay highlighted via the CSS Custom Highlight API (Chromium/Electron) |
| `PlanActivitySidebar.tsx` | `[DELETE]` | Replaced by inline cards, the notes chip, and the agent-reply card (if D2 = Remove) |
| `plan.css` | `[MODIFY]` (rewrite) | Only defined tokens (`--text-*`, `--bg-app/card/elevated/input`, `--border-subtle/prominent`, `--accent-*`, `--success/warning/danger/info`, `--shadow-pop`, `--font-mono`). Reuse `ui-btn`, `ui-seg`, `ui-chip`. One radius scale (6/8px), no gradients or glows. Reading column 760px (comfortable) / 1040px (wide), body 14px / 1.7. Target ≤ 500 lines |

### 3.4 Skills & agent block
| File | Action | Change |
|---|---|---|
| `agent/skills/rich-plan-formatting/SKILL.md` | `[MODIFY]` (rewrite, ~90 lines) | Principles: scale to the task, a 30-second scan first, every element earns its place. A minimal single-view template (Goal · Approach · Decisions · Changes table · Verify). When to add SUMMARY/FULL (per D3). Decision rules: ≤ 3, each written **once**, only real trade-offs, always `(x)` the recommended option, format options as `**Name**: one-line why`. Callouts: ≤ 2, the five supported kinds only. Badges only in the Changes table. No H1 suffixes, emoji, or mermaid (use an indented tree or a table). A short anti-pattern list |
| `agent/skills/plan-previewer/SKILL.md` | `[MODIFY]` (~45 lines) | Correct the status set (`approved` / `changes_requested` / `answered`; drop the non-existent `questions_asked`). Describe the new **Send answers** flow. Remove the stale `pi-studio` name. Keep Rule Zero and the Phase A/B rules |
| `agent/AGENTS.block.md` | `[MODIFY]` (~10 lines) | A pointer only: "before executing any plan, load `plan-previewer`; never ask questions in chat while a review is open." The full protocol lives in the skill, which cuts always-on context |

Sync: the installed copies in `~/.pi/agent/skills/*` come from the module via `apps/desktop/src/main/modules/agent-assets.ts`, which skips files the user has modified. The installed `plan-previewer/SKILL.md` already differs from the source (probably line endings only), so check that the refresh actually lands and re-copy if it doesn't.

## 4. Risks
- **Splitting the markdown into segments** breaks blocks that span a decision, e.g. a list that continues after a CHOICE block. This is acceptable because authors put decisions between paragraphs. Covered by segmenter tests.
- **DOM post-pass** (heading ids, badges) runs after host `Markdown` renders. It must re-run whenever content changes and stay idempotent.
- **CSS Custom Highlight API** is a progressive enhancement. If it's unavailable, notes still work through the chip.
- **Old plans** written in the current dual-view style must still render correctly. De-dupe by title takes care of the doubled decisions.

## 5. Verification
1. `npx vitest run modules/plan-previewer` covering: segmenter (decisions, callouts, fenced-code safety, indented `>`), de-dupe across views, slugify parity, option label/detail split, store keying across a reorder.
2. Typecheck the desktop app (workspace `typecheck` script).
3. Add a fixture `modules/plan-previewer/fixtures/sample-plan.md` (dual view, 2 choices, 1 question, all 5 callouts, a file table with badges, a long outline), then run `plan-previewer fixtures/sample-plan.md` manually and walk through these states: review → `--ask` → Send answers → Request changes → live revision → Approve (Auto Edit / Manual). Check at tab widths of 800px and 1400px, in light and dark themes.
4. `grep` check: no `var(--` in `plan.css` that isn't defined in `apps/desktop/src/renderer/styles`.
5. Fresh-eyes `reviewer` pass on the diff before reporting done.
<!-- /FULL -->
