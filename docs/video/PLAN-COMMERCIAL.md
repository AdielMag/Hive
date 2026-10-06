# Hive Cinematic Showcase Commercial

Produce a 35-second live-action tech commercial featuring real software engineers in aesthetic developer workspaces, transitioning into Hive's multi-agent orchestration and the approved amber glass emblem. Replaces the rejected flat screenshot camera drifts with photorealistic Kling 3.0 cinematography, punchy Inter typography, and synchronized cinematic audio.

## Approach
- Generate 4 live-action developer shots via Kling 3.0 Turbo (macro typing, late-night focus, over-the-shoulder monitor tracking, relaxed payoff).
- Integrate the approved S2 amber glass icon render (`docs/video/work/drafts/S2.mp4`) as the hero centerpiece and outro reveal.
- Cut and pace to the existing 100 BPM cinematic score (`docs/video/work/audio/music.mp3`) with crisp kinetic typography.
- Assemble final 1080p master (`docs/video/hive-showcase.mp4`), poster image, and preview GIF using FFmpeg.

## Decisions

> [!CHOICE] Audio & Narration Format
> **Question**: Should the commercial use an AI voiceover narrator or music-driven kinetic typography?
> - (x) **Music + Kinetic Typography**: Clean, modern Linear/Apple style, punchy sound effects, no synthetic voice fatigue [Recommended]
> - ( ) **AI Voiceover Narration**: Deep dramatic voiceover narrating the problem and solution via ElevenLabs/Qwen

<!-- MORE -->

## Shot List & Narrative Structure (35 seconds total)

| Shot | Time | Visual | Copy Overlay | Source / Model |
|---|---|---|---|---|
| **S1: The Late Night** | 0:00–0:04 | Macro close-up of developer hands typing fast on mechanical keyboard, shallow depth of field | *"Building with agents..."* | Kling 3.0 (`test-macro.mp4`) |
| **S2: The Overwhelm** | 0:04–0:09 | Developer at dark desk, ultrawide screen glow, looking up with intense focus | *"Too many tabs. Lost context."* | Kling 3.0 (Close-up face / monitor reflection) |
| **S3: The Spark (Hero Emblem)** | 0:09–0:14 | Approved S2 3D amber-honey glass emblem floating with liquid caustics and warm light | *"Hive."* | Existing S2 render (`S2.mp4`) |
| **S4: Autonomous Flow** | 0:14–0:21 | Over-the-shoulder push into physical monitor showing Hive orchestrating multiple workspaces simultaneously | *"Parallel agents. One workbench."* | Kling 3.0 + Screen composite |
| **S5: The Relief** | 0:21–0:27 | Developer leans back, hands off keyboard, smiling with quiet confidence, sipping coffee | *"You direct. Hive delivers."* | Kling 3.0 (`test-kling.mp4`) |
| **S6: Outro & Lockup** | 0:27–0:35 | Hero amber emblem resolves with golden embers into clean title: *"Hive — The workbench for Pi."* | *"Free. Local. Open source."* | S2 loop + kinetic typography |

## Changes
| File | Action | Description |
|---|---|---|
| `docs/video/PLAN-COMMERCIAL.md` | `[NEW]` | Commercial production plan and shot breakdown |
| `scripts/video/assemble-commercial.mjs` | `[NEW]` | Video assembly pipeline for live-action shots + typography + audio |
| `docs/video/work/shots/` | `[NEW]` | Directory for rendered Kling 3.0 live-action clips |
| `docs/video/hive-showcase.mp4` | `[MODIFY]` | Output master 1080p commercial video |
| `docs/video/hive-showcase-poster.jpg` | `[MODIFY]` | High-res commercial poster frame |
| `docs/video/hive-showcase.gif` | `[MODIFY]` | GitHub README preview GIF |

## Budget & Resources
- Total account balance: **712.18 credits** remaining.
- Cost per Kling 3.0 Turbo clip: **7.5 credits**.
- Estimated cost for 4 generation runs: **~30 credits** (well under 5% of balance).

## Verification
- Verify all generated video clips for photorealism, natural motion, and lighting consistency.
- Inspect contact sheets and frame extracts at every stage.
- Run `node scripts/video/assemble-commercial.mjs` to render master video.
- Verify playback duration, audio synchronization, typography readability, and seamless loop.
