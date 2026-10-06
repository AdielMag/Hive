// Assembly stage of the showcase film: scale and trim every shot, burn the captions with ffmpeg, dip to black
// at the two section breaks, mix the audio and encode. Uses the newest final render of a shot, else its newest
// draft (always the case for `--preview`, which writes work/preview.mp4 and never touches the deliverable).
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";

const W = 1920;
const H = 1080;
const DIP = 0.4;

/** Escape a string for a drawtext `text=` value inside a single-quoted filtergraph option. */
const esc = (s) => s.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\u2019").replace(/%/g, "\\%");

function pickClip(jobs, id, preview) {
  const done = jobs.filter((j) => j.shot === id && j.status === "completed" && existsSync(j.file));
  const finals = done.filter((j) => j.kind === "final");
  const pool = preview ? done : finals.length ? finals : done;
  return pool.at(-1);
}

function textY(pos, size) {
  switch (pos) {
    case "top": return 120;
    case "top2": return 120 + 130;
    case "bottom": return H - 210;
    case "bottom2": return H - 150;
    default: return H - 150 - size / 2;
  }
}

function captionFilters(shot, manifest) {
  return (shot.text ?? []).map((t) => {
    const font = t.sub ? manifest.fontRegular : manifest.fontSemiBold;
    const a = t.at;
    const b = t.to;
    const alpha = `if(lt(t,${a}),0,if(lt(t,${a + 0.45}),(t-${a})/0.45,if(lt(t,${b - 0.35}),1,if(lt(t,${b}),(${b}-t)/0.35,0))))`;
    const color = t.sub ? "white@0.78" : "white";
    return `drawtext=fontfile='${font}':text='${esc(t.t)}':fontsize=${t.size}:fontcolor=${color}:x=(w-text_w)/2:y=${textY(t.y, t.size)}:shadowcolor=black@0.55:shadowx=0:shadowy=3:alpha='${alpha}'`;
  });
}

export async function assemble({ root, work, video, manifest, jobs }) {
  const preview = process.argv.includes("--preview");
  const ff = (args) => {
    const r = spawnSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...args], { cwd: root, stdio: "inherit" });
    if (r.status !== 0) throw new Error(`ffmpeg failed: ${args.slice(0, 6).join(" ")} ...`);
  };
  mkdirSync(work, { recursive: true });

  // Bottom scrim so captions stay legible over UI-heavy shots.
  const scrim = join(work, "scrim.png");
  if (!existsSync(scrim)) {
    ff(["-f", "lavfi", "-i", `color=c=black:s=${W}x${H},format=rgba`, "-vf",
      `geq=r=0:g=0:b=0:a='255*0.88*pow(max(0,(Y-${H * 0.55})/${H * 0.45}),1.4)'`, "-frames:v", "1", scrim]);
  }

  const inputs = [];
  const chains = [];
  const labels = [];
const scrims = [];
  let total = 0;
  manifest.shots.forEach((shot, i) => {
    const clip = pickClip(jobs, shot.id, preview);
    const still = shot.startImage ? join(work, "frames", shot.startImage) : undefined;
    if (!clip && !(preview && still)) throw new Error(`${shot.id}: no rendered clip yet`);
    const ui = !["S1", "S2", "S9"].includes(shot.id);
    // A shot without a render yet shows its still in previews so timing and captions can be checked early.
    if (clip) inputs.push("-i", clip.file);
    else inputs.push("-loop", "1", "-framerate", String(manifest.fps), "-t", String(shot.duration), "-i", still);
    let chain = `[${i}:v]scale=${W}:${H}:flags=lanczos,setsar=1,fps=${manifest.fps},trim=duration=${shot.duration},setpts=PTS-STARTPTS,format=yuv420p`;
    if (shot.id === "S2" || shot.id === "S8") chain += `,fade=t=out:st=${shot.duration - DIP}:d=${DIP}`;
    if (shot.id === "S3" || shot.id === "S9") chain += `,fade=t=in:st=0:d=${DIP}`;
    const caps = captionFilters(shot, manifest);
    if (ui) {
      // Scrim sits under the captions. Each scene gets its own looped input: sharing one looping still between
      // several overlays stalls ffmpeg's frame sync and freezes the output.
      scrims.push({ shot: shot.id, label: `[SCRIM_${shot.id}]` });
      chain = `${chain}[b${i}];[b${i}]SCRIM_${shot.id}overlay=0:0:format=auto,format=yuv420p`;
    }
    chain += caps.length ? `,${caps.join(",")}` : "";
    chains.push(`${chain}[v${i}]`);
    labels.push(`[v${i}]`);
    total += shot.duration;
  });

  let next = manifest.shots.length;
  let graph = chains.join(";");
  for (const sc of scrims) {
    const dur = manifest.shots.find((x) => x.id === sc.shot).duration;
    inputs.push("-loop", "1", "-framerate", String(manifest.fps), "-t", String(dur), "-i", scrim);
    graph = graph.replace(`SCRIM_${sc.shot}overlay`, `[${next}:v]overlay`);
    next += 1;
  }
  graph += `;${labels.join("")}concat=n=${labels.length}:v=1:a=0[vout]`;

  // Audio: music bed (+ optional one-shot sfx placed from the manifest) normalised to -14 LUFS.
  const music = join(work, "audio/music.mp3");
  const audio = [];
  let amap = [];
  if (existsSync(music)) {
    const base = next;
    audio.push("-i", music);
    let g = `;[${base}:a]atrim=duration=${total},afade=t=in:d=1,afade=t=out:st=${total - 2}:d=2[mus]`;
    const sfx = (manifest.sfx ?? []).filter((s) => existsSync(join(work, "audio", s.file)));
    sfx.forEach((s, k) => {
      audio.push("-i", join(work, "audio", s.file));
      g += `;[${base + 1 + k}:a]adelay=${Math.round(s.at * 1000)}|${Math.round(s.at * 1000)},volume=${s.gain ?? 0.5}[sx${k}]`;
    });
    g += `;[mus]${sfx.map((_, k) => `[sx${k}]`).join("")}amix=inputs=${1 + sfx.length}:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11[aout]`;
    amap = ["-map", "[aout]"];
    ff([...inputs, ...audio, "-filter_complex", graph + g, "-map", "[vout]", ...amap, ...encode(preview), "-t", String(total), preview ? join(work, "preview.mp4") : join(video, "hive-showcase.mp4")]);
  } else {
    ff([...inputs, "-filter_complex", graph, "-map", "[vout]", ...encode(preview), "-t", String(total), preview ? join(work, "preview.mp4") : join(video, "hive-showcase.mp4")]);
  }
  console.log(`${preview ? "preview" : "film"} written (${total}s, ${readdirSync(preview ? work : video).length} files in dir)`);
}

function encode(preview) {
  return [
    "-c:v", "libx264", "-crf", preview ? "26" : "18", "-preset", preview ? "veryfast" : "slow",
    "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-r", "24",
    "-c:a", "aac", "-b:a", "192k",
  ];
}
