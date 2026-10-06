#!/usr/bin/env node
// Hive showcase film pipeline (see docs/video/PLAN.md).
//   node scripts/video/render.mjs draft [S1 S2 ...]   Seedance 480p drafts of every (or the listed) shot
//   node scripts/video/render.mjs final [S1 S2 ...]   final renders (needs a draft of the shot; uses the newest one)
//   node scripts/video/render.mjs assemble            cut, caption, mix and encode docs/video/hive-showcase.mp4
// Everything lands in docs/video/work/ (git-ignored); jobs.json records every Higgsfield job so runs are resumable.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const video = join(root, "docs/video");
const work = join(video, "work");
const manifest = JSON.parse(readFileSync(join(video, "shots.json"), "utf8"));
const jobsFile = join(work, "jobs.json");
const jobs = existsSync(jobsFile) ? JSON.parse(readFileSync(jobsFile, "utf8")) : [];
const saveJobs = () => writeFileSync(jobsFile, JSON.stringify(jobs, null, 2));
const [cmd, ...rest] = process.argv.slice(2);
const only = rest.filter((a) => /^S\d+$/.test(a));
const shots = manifest.shots.filter((s) => !only.length || only.includes(s.id));
const CONCURRENCY = 4;

function latest(id, kind) {
  return [...jobs].reverse().find((j) => j.shot === id && j.kind === kind && j.status === "completed");
}

// On Windows `higgsfield` is an npm .cmd shim that Node cannot spawn without a shell (which would mangle the
// prompt's quoting), so run the CLI's entry point with node directly.
function higgsfieldCli() {
  const entry = process.env.APPDATA && join(process.env.APPDATA, "npm/node_modules/@higgsfield/cli/bin/higgsfield.js");
  return entry && existsSync(entry) ? [process.execPath, [entry]] : ["higgsfield", []];
}

function run(command, args) {
  return new Promise((res) => {
    const [bin, pre] = command === "higgsfield" ? higgsfieldCli() : [command, []];
    const p = spawn(bin, [...pre, ...args], { cwd: root, shell: false });
    p.on("error", (e) => res({ code: -1, out: "", err: String(e) }));
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => res({ code, out, err }));
  });
}

async function generate(shot, kind) {
  const draft = kind === "draft";
  const args = ["generate", "create", "seedance_2_5", "--prompt", `${shot.prompt} ${manifest.style}`,
    "--mode", shot.mode, "--duration", String(shot.duration), "--aspect_ratio", "16:9", "--generate_audio", "false"];
  const frames = join(work, "frames");
  if (shot.startImage) args.push("--start-image", join(frames, shot.startImage));
  if (shot.endImage) args.push("--end-image", join(frames, shot.endImage));
  if (draft) {
    args.push("--draft", "true", "--resolution", "1080p");
  } else {
    const d = latest(shot.id, "draft");
    if (!d) throw new Error(`${shot.id}: no completed draft to finalize`);
    args.push("--draft_job_id", d.id, "--resolution", shot.finalResolution);
  }
  args.push("--wait", "--wait-timeout", "30m", "--json");
  const { code, out, err } = await run("higgsfield", args);
  let job;
  try { job = JSON.parse(out)[0]; } catch { /* handled below */ }
  if (code !== 0 || !job) throw new Error(`${shot.id} ${kind} failed: ${(err || out).slice(0, 400)}`);
  const dir = join(work, draft ? "drafts" : "finals");
  mkdirSync(dir, { recursive: true });
  const n = jobs.filter((j) => j.shot === shot.id && j.kind === kind).length + 1;
  const file = join(dir, `${shot.id}-${n}.mp4`);
  if (job.result_url) {
    const r = await fetch(job.result_url);
    writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  }
  jobs.push({ shot: shot.id, kind, n, id: job.id, status: job.status, file, prompt: shot.prompt, at: new Date().toISOString() });
  saveJobs();
  console.log(`${shot.id} ${kind} #${n}: ${job.status} -> ${file}`);
}

async function pool(items, fn) {
  const queue = [...items];
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    for (let s = queue.shift(); s; s = queue.shift()) {
      try { await fn(s); } catch (e) { console.error(String(e.message ?? e)); }
    }
  }));
}

if (cmd === "draft" || cmd === "final") {
  mkdirSync(work, { recursive: true });
  await pool(shots, (s) => generate(s, cmd));
} else if (cmd === "assemble") {
  const m = await import("./assemble.mjs");
  await m.assemble({ root, work, video, manifest, jobs, only });
} else {
  console.log("usage: render.mjs draft|final|assemble [S1 S2 ...]");
  process.exit(cmd ? 1 : 0);
}
