#!/usr/bin/env node
// Regenerates the animated docs/screenshots/*.gif tours from the built app (run `npm run build` first).
// Each storyboard = ordered frames; every frame is one capture-hook launch (HIVE_CAPTURE*), then ffmpeg
// stitches the frames into a cross-faded GIF. Needs `ffmpeg` on PATH.
// Usage: node scripts/capture-gifs.mjs [storyboard…]
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const desktop = join(root, "apps/desktop");
const out = join(root, "docs/screenshots");
mkdirSync(out, { recursive: true });
const electron = createRequire(join(desktop, "package.json"))("electron");

// Runs around every frame: blur account e-mails, dismiss first-run hints.
const PREP = `(() => {
  const s = document.createElement("style");
  s.textContent = ".quota-card__account,.settings__account .ui-row__hint{filter:blur(5px)}";
  document.head.appendChild(s);
  for (const b of document.querySelectorAll("button")) if (b.textContent.trim() === "Got it") b.click();
})();`;
const ui = (code) => `window.useUi.getState().${code}`;
const session = (code) => `window.useSessionStore.getState().${code}`;
const reset = `${ui("showLeft(null)")};${ui("showRight(null)")};${ui("showBottom(null)")}`;

// seconds = how long the frame stays on screen. `script` = live capture, `image` = file in docs/screenshots.
const storyboards = {
  "hive-tour": [
    { script: ui(`showLeft("projects")`), seconds: 2.2 },
    { script: ui(`showLeft("files")`), seconds: 2.2 },
    { script: ui(`showLeft("git")`), seconds: 2.2 },
    { script: ui(`showLeft("actions")`), seconds: 2.2 },
    { script: `${ui(`showLeft("projects")`)};${ui(`showBottom("branches")`)}`, seconds: 2.4 },
    { script: `${ui(`showLeft("projects")`)};${ui(`showBottom("terminal")`)}`, seconds: 2.4 },
  ],
  // Data-heavy views reuse the vetted PNGs from `npm run screenshots` (a clean profile has no usage data).
  "hive-insights": [
    { image: "limits.png", seconds: 2.4 },
    { image: "usage.png", seconds: 2.6 },
    { image: "context.png", seconds: 2.4 },
    { image: "git.png", seconds: 2.4 },
  ],
  "hive-customize": [
    { script: `${reset};${session("openLibraryTab()")}`, seconds: 2.6 },
    {
      script: `${ui(`openSettings("appearance")`)};setTimeout(()=>{for(const b of document.querySelectorAll("button"))if(b.textContent.trim()==="Marketplace")b.click()},1500)`,
      seconds: 2.6,
      delay: 24_000,
    },
    { script: ui(`openSettings("appearance")`), seconds: 2.6 },
  ],
};

const FRAME_W = 1000;
const FADE = 0.45;

// The app can linger after writing the PNG, so wait for the file, then kill the whole process tree.
async function captureFrame(file, script, profile, delay = 10_000) {
  const child = spawn(electron, [join(desktop, "out/main/index.js")], {
    cwd: desktop,
    stdio: "ignore",
    env: {
      ...process.env,
      HIVE_USER_DATA: profile, // separate profile → no single-instance clash with a running Hive
      HIVE_PROJECT: root,
      HIVE_CAPTURE: file,
      HIVE_CAPTURE_DELAY: String(delay),
      HIVE_CAPTURE_SCRIPT: `${PREP};${script};setTimeout(()=>{${PREP}},2500)`,
    },
  });
  const deadline = Date.now() + delay + 80_000;
  while (!existsSync(file) && child.exitCode === null && Date.now() < deadline) await sleep(500);
  await sleep(1500); // let the PNG finish flushing
  if (child.exitCode === null) {
    if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    else child.kill("SIGKILL");
  }
  if (!existsSync(file)) throw new Error(`capture failed: ${file}`);
}

function stitch(frames, outFile) {
  const args = ["-y", "-loglevel", "error"];
  for (const f of frames) args.push("-loop", "1", "-t", String(f.seconds + FADE), "-i", f.file);
  const parts = frames.map((_, i) => `[${i}:v]scale=${FRAME_W}:-2:flags=lanczos,fps=15,format=yuv420p[v${i}]`);
  let last = "v0";
  let offset = 0;
  for (let i = 1; i < frames.length; i++) {
    offset += frames[i - 1].seconds;
    parts.push(`[${last}][v${i}]xfade=transition=fade:duration=${FADE}:offset=${offset.toFixed(2)}[x${i}]`);
    last = `x${i}`;
  }
  parts.push(`[${last}]split[a][b];[a]palettegen=max_colors=160:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4[o]`);
  args.push("-filter_complex", parts.join(";"), "-map", "[o]", "-loop", "0", outFile);
  const r = spawnSync("ffmpeg", args, { stdio: "inherit" });
  if (r.status !== 0) throw new Error(`ffmpeg failed for ${outFile}`);
}

// A fresh profile opens a "Choose your setup" dialog; pick "Everything" once so every module shows up.
const SETUP = `(() => {
  const click = (re, root = document) => [...root.querySelectorAll("button,[role=button],div")].filter((e) => re.test(e.textContent.trim()) && e.children.length < 4).pop()?.click();
  click(/^Everything/);
  setTimeout(() => click(/^Continue$/), 400);
})();`;

const only = process.argv.slice(2);
const tmp = mkdtempSync(join(tmpdir(), "hive-gifs-"));
const profile = join(tmp, "profile");
try {
  console.log("warm-up: choosing module preset…");
  await captureFrame(join(tmp, "warmup.png"), SETUP, profile);
  for (const [name, steps] of Object.entries(storyboards)) {
    if (only.length && !only.includes(name)) continue;
    const frames = steps.map((s, i) => ({ ...s, file: s.image ? join(out, s.image) : join(tmp, `${name}-${i}.png`) }));
    for (const [i, f] of frames.entries()) {
      if (f.image) continue;
      console.log(`${name}: frame ${i + 1}/${frames.length}…`);
      await captureFrame(f.file, f.script, profile, f.delay);
    }
    stitch(frames, join(out, `${name}.gif`));
    console.log(`wrote ${name}.gif`);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
