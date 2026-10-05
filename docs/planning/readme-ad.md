# Hive README ad video

Build a fast-paced, Apple-style promo (about 20s) from the real Hive screenshots, cut with AI-generated developers at their desks. No Higgsfield MCP is installed here, so this plan uses `generate_image` for the people and `ffmpeg` for motion and editing.

## Approach
- Script about 16 beats of roughly 1.2s each: big white kinetic type on black, then a push-in from a person at a laptop to the real full-screen UI.
- Generate about 6 stills with `generate_image` (diverse developers, moody key light, laptop glow, 16:9). The Hive UI is never AI-generated, so no garbled text.
- Use the real 2880x1800 shots in `docs/screenshots/` (workbench, limits, usage, git, context, appearance) with Ken Burns zooms and hard cuts on the beat.
- Render with `ffmpeg` to `docs/screenshots/hive-ad.mp4` plus a README-sized `hive-ad.gif`, and embed it in `README.md`.
- Add a royalty-free or generated music bed only if you want sound. The README embed is silent.

## Decisions

> [!CHOICE] Video tooling
> **Question**: How do we make the video?
> - (x) **ffmpeg + generate_image**: works today, real UI stays pixel-perfect [Recommended]
> - ( ) **Wait for Higgsfield MCP**: true AI video clips, but needs the MCP server added to Pi first
> - ( ) **Higgsfield web app**: I write prompts and a shot list, you generate the clips and send them back

> [!CHOICE] People in the ad
> **Question**: Who appears on screen?
> - (x) **AI-generated developers**: cinematic, no real-person rights issues, disclosed in the README [Recommended]
> - ( ) **No people**: pure typography and UI, fastest to make
> - ( ) **Your own footage**: you supply real clips or photos of real users

> [!CHOICE] Length
> **Question**: How long should the cut be?
> - (x) **About 20s, 16:9**: fits a README hero, small GIF [Recommended]
> - ( ) **About 30s plus a 9:16 cut**: also usable on social, double the work

> [!WARNING]
> "Real users" can only be real if you supply their footage or quotes. I will not invent testimonials. AI people will be labeled as such.

<!-- MORE -->

## Shot list (about 20s)

| Beat | Visual | On-screen text |
|---|---|---|
| 1 | Black, single honeycomb cell draws in | Meet Hive. |
| 2-3 | Dev at night, laptop glow, push-in to `workbench.png` | One agent. Then five. |
| 4 | Tabs fan out, `workbench.png` pan | Every session. Every project. |
| 5-6 | Dev checks phone/laptop, push-in to `limits.png` meters | Know your limits. |
| 7-8 | Spend counter rolls, `usage.png` chart wipe | See every token. |
| 9-10 | Dev reviews diff, `git.png` then `context.png` gauge | Review. Commit. Compact. |
| 11-12 | Palette pad spins, `appearance.png` recolors frame | Make it yours. |
| 13-14 | Fast montage of all screens, 0.3s each | Local. Private. Fast. |
| 15-16 | Logo on black, hold | Hive. The workbench for Pi. |

## Changes
| File | Change |
|---|---|
| `docs/screenshots/people/*.png` | `[NEW]` AI stills of developers |
| `scripts/ad/build-ad.mjs` | `[NEW]` ffmpeg timeline (zooms, cuts, type) |
| `docs/screenshots/hive-ad.mp4` | `[NEW]` final video |
| `docs/screenshots/hive-ad.gif` | `[NEW]` README embed, under about 8 MB |
| `README.md` | `[MODIFY]` add ad below the hero, note AI-generated people |

## Risks
- AI faces and hands can look off. I will regenerate stills until they hold up at 1-second shows.
- A GIF of 20s at 900px can get big. I will cap size and link the mp4 for full quality.
- `scripts/ad/` is extra repo weight. I can keep it out of git if you prefer.

## Verify
- Play `hive-ad.mp4` and check the text is readable and the cuts land.
- Check `hive-ad.gif` size and that it renders on the GitHub README preview.
- Check `README.md` still stays short.
