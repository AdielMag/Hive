<!-- SUMMARY -->
# Hive Showcase Film for the README

A ~52 second Apple-style launch film for Hive, produced with Higgsfield (Seedance 2.5 clips, Sonilo music) and assembled with ffmpeg. It replaces the hero GIF in `README.md` and ships as a 1080p MP4, a GIF preview and a poster. Estimated spend is about 630 credits of the 900 available.

The film is told from a developer's point of view: "agents write the code, and Hive is where you watch them work". Real Hive screenshots (demo data, already in `docs/screenshots/`) are the start frames, so the UI is real and the generation only adds camera, light and atmosphere.

## Approach
- Dark, minimal, typographic: black negative space, one line of big type per scene, slow camera pushes, no voiceover.
- Nine scenes: cold open, logo reveal, then one scene per README feature (workspaces, transcript, limits, usage, git, themes), then the outro.
- UI scenes: Seedance image-to-video from the real screenshot. Hero scenes (open, logo, outro) are pure generated.
- All on-screen text is drawn by ffmpeg, never by the video model, so type stays crisp and correct.
- Cheap draft pass first (about 3 credits per second), then final renders only for approved shots.
- Everything is scripted and rerunnable: `docs/video/shots.json` is the shot manifest, `scripts/video/render.mjs` does the assembly.

## Decisions

> [!CHOICE] How the UI scenes are made
> **Question**: How do we show the app without the video model garbling UI text?
> - (x) **Hybrid**: real screenshot as the start frame, Seedance adds camera and light, with an ffmpeg Ken Burns fallback per shot if text morphs [Recommended]
> - ( ) **Fully generated**: Seedance invents the UI from a description; looks cinematic but shows UI that does not exist
> - ( ) **Deterministic only**: ffmpeg pans and zooms on screenshots, no Seedance; perfectly faithful but flat, not "Apple"

> [!CHOICE] Runtime
> **Question**: How long should the film be?
> - (x) **About 52s**: nine scenes, room for every README feature [Recommended]
> - ( ) **About 30s**: open, logo, three features, outro; cheaper and punchier, drops usage and git
> - ( ) **About 90s**: adds a walkthrough of context, terminal and MCP marketplace; needs new screenshots and about 1000 credits

> [!CHOICE] README embedding
> **Question**: How is the film shown on GitHub?
> - (x) **GIF poster linking to MP4**: commit `hive-showcase.mp4` and a looping GIF in `docs/`; the hero GIF links to the MP4; fully automated [Recommended]
> - ( ) **GitHub-hosted video**: you drag the MP4 into the README editor on github.com to get a `user-attachments` URL and an inline player; one manual step
> - ( ) **Keep the current hero**: put the film further down under a "Watch" section

## Milestones
1. Brief and assets locked: fonts, brand colors, screenshot prep, manifest.
2. Draft pass of all nine shots, review, re-roll the weak ones.
3. Final renders, music and sound effects.
4. Assembly, QC against the checklist, README update.

> [!WARNING]
> Generative video can smear small UI text. The mitigation is the start-frame approach plus a per-shot ffmpeg fallback, and a hard review gate after the draft pass before any final credits are spent.

> [!IMPORTANT]
> Screenshots contain demo data only and account e-mails are blurred by `scripts/capture-screenshots.mjs`. Do not feed any new capture of a real session into Higgsfield.
<!-- /SUMMARY -->

<!-- FULL -->
# Hive Showcase Film for the README

Details for the plan in the Summary tab. Decisions are as chosen in *How the UI scenes are made*, *Runtime* and *README embedding*.

## 1. Creative concept

**Premise.** A launch film in the style of an Apple product video, from the point of view of someone who uses Hive every day. The tension: coding agents are now doing the work, but the terminal is a poor place to supervise them. Hive is the calm, beautiful place where you see everything.

**Tone.** Quiet confidence. Short declarative lines. Lots of black. Motion is slow and deliberate; every cut lands on a beat of the music.

**Look.**

| Element | Decision |
|---|---|
| Palette | Near-black `#07080C` background, white type, accent taken from the Hive icon (honey amber) used only for the logo glow and one highlighted word per scene |
| Type | Inter (OFL license), Semibold for headlines, Regular for sublines, tight tracking, centered |
| Camera | Slow dolly or push-in, shallow depth of field, soft bloom on screen glow, no handheld shake |
| Surface | The app floats in a dark void with a faint reflection, never inside a laptop mockup |
| Format | 16:9, 1920x1080, 24 fps, H.264, stereo AAC |

**Why no voiceover.** Higgsfield has no TTS (Seed Audio is for effects and music), and Apple-style kinetic type reads well muted, which matters because GitHub plays video muted by default.

## 2. Storyboard

Total runtime 53.0s. Hard cuts, with a 0.4s dip to black between S2/S3 and S8/S9.

| # | Time | Scene | Source | On-screen text (ffmpeg) |
|---|---|---|---|---|
| S1 | 0.0 - 5.0 | Cold open: a dark desk, a dozen terminal windows glowing and stacking up out of focus | Generated, 1080p | "Agents write the code." |
| S2 | 5.0 - 10.0 | Logo reveal: hex cells ignite, assemble into the Hive icon, glow settles | Generated from `apps/desktop/build/icon.png`, 1080p | "Now watch them work." then wordmark "Hive" |
| S3 | 10.0 - 17.0 | Workspaces: camera pushes into the sidebar of the workbench, project colors catch the light | `workbench.png` start frame, 720p | "Every project. One hive." |
| S4 | 17.0 - 24.0 | Transcript: slow rise up the conversation to the Reviewer subagent card marked COMPLETED | `workbench.png` start frame (lower crop), 720p | "Every thought. Every tool. Every diff." |
| S5 | 24.0 - 30.0 | Limits: the right panel with 5h and weekly meters, countdown bars fill | `limits.png`, 720p | "Know your limits before you hit them." |
| S6 | 30.0 - 36.0 | Usage: the analytics dashboard, chart lines draw in | `usage.png`, 720p | "Know every cent." subline "Computed locally. Zero telemetry." |
| S7 | 36.0 - 42.0 | Git and context: staged files, an AI commit message, context meter | `git.png`, 720p | "Commit with a sentence." |
| S8 | 42.0 - 47.0 | Themes: the palette pad is dragged, the whole UI shifts hue | `appearance.png`, 720p | "Make it yours." |
| S9 | 47.0 - 53.0 | Outro: the hive icon on black, slow pull-back, URL fades in | Generated from `icon.png`, 1080p | "Hive" / "The workbench for Pi." / "Free. Local. Open source." / `github.com/AdielMag/Hive` |

Lines are kept to one breath and at most 6 words where possible. The sublines in S6 and S9 echo README claims (local, zero telemetry, open source) and must stay true to the README text.

## 3. Shot specs and prompts

Model for all clips: `seedance_2_5`, `--mode omni_reference`, `--generate-audio false` (audio comes from the music track), `--aspect_ratio 16:9`. Start frame is passed with `--start-image`. Shared style suffix appended to every prompt:

> Cinematic product film, near-black environment, soft volumetric light, shallow depth of field, subtle bloom on screen glow, smooth slow camera motion, premium Apple keynote aesthetic, no text overlays, no watermarks, no extra UI elements.

Shot prompts (the manifest in `docs/video/shots.json` is the source of truth; these are the drafts):

| Shot | Prompt core | Notes |
|---|---|---|
| S1 | "A dim developer desk at night seen from behind. Terminal windows with scrolling green and white text multiply and overlap across a wide monitor, a sense of overwhelm. Slow push-in, focus drifts." | `t2v`, no reference. Keep text illegible by design. |
| S2 | "Glowing amber hexagonal cells drift in darkness, snap together into the hive logo, bright core then soft settle. Slow dolly in." | Start frame is `icon.png` on black, used as the end frame so the logo lands exactly. `--end-image`. |
| S3 | "The app window floats in a dark void. Camera slowly pushes toward the left sidebar, the colored project badges glow gently, UI stays perfectly still and sharp." | Keep UI static, move only the camera. |
| S4 | "Camera slowly tilts up along the conversation, settling on the green COMPLETED badge on the subagent card, gentle depth of field." | Use a crop of the lower half as start frame. |
| S5 | "Slow push toward the limits panel, the progress bars glow, light sweeps across the surface." | |
| S6 | "Gentle parallax over the analytics dashboard, chart lines glow, camera drifts right." | |
| S7 | "Slow rack focus across the commit panel, the commit message field glows softly." | |
| S8 | "The app UI subtly shifts color temperature from cool blue to warm amber while the camera eases back." | Fallback: render hue shift in ffmpeg (`hue` filter) which is exact. |
| S9 | "The glowing hive icon centered on black, slow pull-back, faint reflective floor, embers drift." | Start frame `icon.png`. |

**Passing the screenshots.** The source PNGs are 2880x1800 (16:10). Crop each to 16:9 (2880x1620) with ffmpeg before upload so the model does not letterbox or invent edges. Crops are saved in `docs/video/work/frames/` and are not committed.

## 4. Audio

| Track | Model | Spec |
|---|---|---|
| Music bed | Sonilo Music (`sonilo_music`) | `--duration 53`, prompt: "Minimal modern cinematic score, soft felt piano and warm analog synth pad, slow build, one clean swell at 0:05 for the logo, steady pulse through the middle, resolves to a single sustained note at the end. No vocals." Sonilo caps per-call duration, so if needed generate 2 segments and crossfade 2s. |
| Sound design | Seed Audio 1.0 (`seed_audio`) | 4 short one-shots: deep low "boom" for the logo ignite, soft UI "tick" for text lines, airy whoosh for cuts, final shimmer. 1-3s each. |

Mix in ffmpeg: music at -14 LUFS integrated target, one-shots 6 dB under the music peak, 1s fade in, 2s fade out. Even if viewers watch muted, picture and type carry the story.

## 5. Production pipeline

```
screenshots (2880x1800) -> crop 16:9 -> Seedance DRAFT (3 cr/s) -> review
        -> approve/re-roll -> Seedance FINAL (720p UI, 1080p hero)
Sonilo music + Seed Audio SFX
        -> ffmpeg: scale to 1080p, cut, dip-to-black, drawtext, mix audio
        -> hive-showcase.mp4 -> gif preview + poster -> README
```

Steps:

1. **Preflight.** `higgsfield account status` (done: plus plan, 900 credits). Install ffmpeg (`winget install Gyan.FFmpeg`), which is missing on this machine. Download Inter into `docs/video/work/fonts/`.
2. **Frames.** Script crops the screenshots and creates `icon-on-black.png` (1920x1080) into `docs/video/work/frames/`.
3. **Drafts.** For each shot: `higgsfield generate create seedance_2_5 --draft true ... --wait`. Record job id and draft URL in `docs/video/work/jobs.json`.
4. **Review gate (you).** Look at the nine drafts in a contact sheet. For each: keep, re-roll with an edited prompt, or switch to the ffmpeg fallback. No final credits are spent before this gate.
5. **Finals.** For kept shots: `--draft_job_id <id>` with `--resolution 1080p` for S1, S2, S9 and `720p` for UI scenes. Remaining credits upgrade the best UI scenes to 1080p.
6. **Audio.** Generate music and SFX, trim to length.
7. **Assemble.** `node scripts/video/render.mjs`: for each scene in order, scale and trim to its slot, burn text with `drawtext` (Inter, fade in 0.4s, hold, fade out 0.3s), concatenate, add audio, encode.
8. **QC.** Run the checklist in section 8, then Virality Predictor (`brain_activity`) on the final MP4 as a bonus read on hook strength in the first 3 seconds; adjust S1 text if the hook scores low.
9. **README.** Update per *README embedding* and open a PR.

Encode settings: `-c:v libx264 -crf 18 -preset slow -pix_fmt yuv420p -movflags +faststart -r 24`, `-c:a aac -b:a 192k`. Target size under 25 MB. GIF preview: 960px wide, 12 fps, palette generated with `palettegen`/`paletteuse`, first 12 seconds (S1, S2 and the start of S3), under 8 MB.

## 6. Credit budget

Rates measured with `higgsfield generate cost` on this account: Seedance 2.5 is about 7 credits per second at 720p and 12 at 1080p; draft is about 3 per second; Sonilo is under 2 credits for 30 seconds.

| Item | Seconds | Credits (est.) |
|---|---|---|
| Drafts, 9 shots | 53 | 160 |
| Finals 720p, S3 to S8 | 37 | 260 |
| Finals 1080p, S1, S2, S9 | 16 | 195 |
| Music and SFX | - | 10 |
| **Planned total** | | **about 625** |
| Re-roll reserve | | up to 125 |
| **Hard cap** | | **750 (150 left unspent)** |

Exact quotes are fetched with `generate cost` before each batch, and the script aborts if the running total would pass the cap.

## 7. Files

| File | Change |
|---|---|
| `docs/video/PLAN.md` | `[NEW]` this plan |
| `docs/video/shots.json` | `[NEW]` manifest: shot id, prompt, start frame, duration, resolution, overlay text and timing |
| `docs/video/hive-showcase.mp4` | `[NEW]` final film, 1080p |
| `docs/video/hive-showcase.gif` | `[NEW]` looping preview for the README |
| `docs/video/hive-showcase-poster.jpg` | `[NEW]` poster frame |
| `scripts/video/render.mjs` | `[NEW]` crop, generate, assemble, encode; idempotent and resumable from `jobs.json` |
| `README.md` | `[MODIFY]` hero block links the GIF to the MP4 and adds a "Watch the film" line |
| `.gitignore` | `[MODIFY]` ignore `docs/video/work/` (frames, drafts, fonts, jobs) |

The existing `docs/screenshots/hive-overview.gif` and `.mp4` stay in place until you decide to retire them.

README hero (for the recommended option):

```html
<a href="docs/video/hive-showcase.mp4">
  <img src="docs/video/hive-showcase.gif" alt="Hive showcase film" width="900" />
</a>
<p align="center"><em>Watch the 52s film</em></p>
```

## 8. QC checklist

- Every on-screen string is correct, readable at 50% scale and in the GIF, and matches README wording.
- No garbled UI text or invented UI in S3 to S8 (pause and inspect frames at 0s, mid and end of each).
- No watermark, no stray text from the model, no logos other than Hive.
- Logo in S2 and S9 matches `icon.png` exactly (hex shape, colors).
- Cuts land on music beats; no clipping; loudness near -14 LUFS.
- Works with sound off: story is clear from picture and type alone.
- MP4 under 25 MB, GIF under 8 MB, plays in Chrome, Safari and the GitHub preview.
- No account e-mails, paths or real project names visible.

## 9. Risks and fallbacks

| Risk | Fallback |
|---|---|
| Seedance warps UI text in a UI scene | Re-roll with a stricter prompt ("UI remains perfectly static"), then switch that scene to ffmpeg `zoompan` on the original screenshot |
| Logo not faithful in S2 or S9 | Use `--end-image icon-on-black.png` and, if still off, composite the real icon over generated light in ffmpeg |
| Credits run out | Drop to the 30s cut: S1, S2, S3, S4, S5, S9 |
| Sonilo track too short or off-mood | Generate 2 segments and crossfade, or use Seed Audio for a music-like bed |
| ffmpeg install blocked | Use a portable ffmpeg build downloaded into `docs/video/work/bin/` |
| GitHub does not inline repo MP4s | Already handled: the README uses a GIF that links to the MP4 |

## 10. Out of scope

New app features, new screenshots of the transcript or terminal views, narration, a 9:16 social cut and a translated version. Any of these can be a follow-up using the same manifest.
<!-- /FULL -->
