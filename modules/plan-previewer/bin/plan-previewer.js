#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";

function parseAskArg(raw) {
  if (!raw) return [];
  const text = String(raw).trim();
  if (text.startsWith("{") || text.startsWith("[")) {
    try {
      const parsed = JSON.parse(text);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {}
  }
  return [{ type: "text", title: "Agent Question", question: text }];
}

function parseAskFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, "utf8").trim();
    if (content.startsWith("{") || content.startsWith("[")) {
      const parsed = JSON.parse(content);
      return Array.isArray(parsed) ? parsed : [parsed];
    }
  } catch {}
  return [];
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    open: true,
    port: 3456,
    questions: [],
    waitTimeoutSec: 240,
  };

  let filePath = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--no-open") {
      options.open = false;
    } else if (arg.startsWith("--port=")) {
      options.port = parseInt(arg.split("=")[1], 10);
    } else if (arg === "-p" || arg === "--port") {
      options.port = parseInt(args[++i], 10);
    } else if (arg.startsWith("--wait-timeout=")) {
      const sec = parseInt(arg.split("=")[1], 10);
      if (!isNaN(sec) && sec > 0) options.waitTimeoutSec = sec;
    } else if (arg.startsWith("--context=")) {
      options.context = arg.split("=").slice(1).join("=");
    } else if (arg === "-c" || arg === "--context") {
      options.context = args[++i];
    } else if (arg.startsWith("--response=")) {
      options.response = arg.split("=").slice(1).join("=");
    } else if (arg === "-r" || arg === "--response") {
      options.response = args[++i];
    } else if (arg.startsWith("--ask=")) {
      options.questions.push(...parseAskArg(arg.split("=").slice(1).join("=")));
    } else if (arg === "--ask") {
      options.questions.push(...parseAskArg(args[++i]));
    } else if (arg.startsWith("--ask-file=")) {
      options.questions.push(...parseAskFile(arg.split("=").slice(1).join("=")));
    } else if (arg.startsWith("--response-file=")) {
      const rFile = arg.split("=").slice(1).join("=");
      try {
        if (fs.existsSync(rFile)) options.response = fs.readFileSync(rFile, "utf8").trim();
      } catch {}
    } else if (arg === "--help" || arg === "-h") {
      showHelp();
      process.exit(0);
    } else if (!arg.startsWith("-") && !filePath) {
      filePath = arg;
    }
  }

  if (!filePath) {
    const candidates = ["plan.md", "PLAN.md", "task_plan.md", "IMPLEMENTATION_PLAN.md"];
    for (const cand of candidates) {
      if (fs.existsSync(path.resolve(process.cwd(), cand))) {
        filePath = cand;
        break;
      }
    }
  }

  // Auto-pickup of .plan-response.md
  if (!options.response) {
    const planDir = filePath ? path.dirname(path.resolve(process.cwd(), filePath)) : process.cwd();
    const candidateFiles = [
      path.join(planDir, ".plan-response.md"),
      path.join(process.cwd(), ".plan-response.md"),
    ];
    for (const rf of candidateFiles) {
      if (fs.existsSync(rf)) {
        try {
          const text = fs.readFileSync(rf, "utf8").trim();
          if (text) {
            options.response = text;
            break;
          }
        } catch {}
      }
    }
  }

  // Auto-pickup of .plan-questions.json
  if (options.questions.length === 0) {
    const planDir = filePath ? path.dirname(path.resolve(process.cwd(), filePath)) : process.cwd();
    const candidateAskFiles = [
      path.join(planDir, ".plan-questions.json"),
      path.join(process.cwd(), ".plan-questions.json"),
    ];
    for (const af of candidateAskFiles) {
      if (fs.existsSync(af)) {
        try {
          const parsed = parseAskFile(af);
          if (parsed.length) {
            options.questions = parsed;
            options.consumedAskFile = af;
            break;
          }
        } catch {}
      }
    }
  }

  return { filePath, options };
}

function showHelp() {
  console.log(`
Hive Plan Previewer - Native Workbench Visual Markdown Plan Review System

Usage:
  plan-previewer [path-to-plan.md] [options]

Options:
  -c, --context="<text>"        Brief task/plan summary shown in Hive tab header
  -r, --response="<text>"       Explain changes made in response to user requests
  --response-file="<path>"      Read change response notes from a markdown file
  --ask="<question>"            Ask user questions INSIDE the Hive plan tab (repeatable)
  --ask-file="<path>"           Read questions from JSON file
  -p, --port=<number>           Specify Hive Plan daemon port (default: 3456)
  --wait-timeout=<seconds>      Max time to wait for a decision before exit (default: 240)
  -h, --help                    Show this help message
`);
}

function probePort(port, planFile) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/api/status`, { timeout: 1500 }, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          const data = JSON.parse(body);
          resolve({ running: Boolean(data.running), port });
        } catch {
          resolve({ running: false, port });
        }
      });
    });
    req.on("error", () => resolve({ running: false, port }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ running: false, port });
    });
  });
}

async function findActivePort(preferredPort, planFile) {
  // 1. Probe preferred port
  const probe = await probePort(preferredPort, planFile);
  if (probe.running) return probe.port;

  // 2. Check session marker file
  if (planFile) {
    try {
      const dir = path.dirname(path.resolve(planFile));
      const base = path.basename(planFile);
      const markerPath = path.join(dir, `.plan-previewer-${base}.session.json`);
      if (fs.existsSync(markerPath)) {
        const marker = JSON.parse(fs.readFileSync(markerPath, "utf8"));
        if (marker.port && marker.port !== preferredPort) {
          const markerProbe = await probePort(marker.port, planFile);
          if (markerProbe.running) return markerProbe.port;
        }
      }
    } catch {}
  }

  return preferredPort;
}

function notifyHive(port, payload) {
  return new Promise((resolve) => {
    const data = JSON.stringify(payload);
    const req = http.request(
      `http://127.0.0.1:${port}/api/notify`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
        },
        timeout: 4000,
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch {
            resolve(null);
          }
        });
      },
    );
    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
    req.write(data);
    req.end();
  });
}

function waitForFeedback(port, timeoutSec, planFile) {
  return new Promise((resolve) => {
    const query = `timeout=${timeoutSec}&planFile=${encodeURIComponent(planFile)}`;
    const req = http.get(
      `http://127.0.0.1:${port}/api/wait-feedback?${query}`,
      { agent: false },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch {
            resolve(null);
          }
        });
      },
    );
    req.on("error", () => resolve(null));
  });
}

async function main() {
  const { filePath, options } = parseArgs();

  if (!filePath) {
    console.error("Error: No markdown plan file provided or found in directory.");
    showHelp();
    process.exit(1);
  }

  const absolutePath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(absolutePath)) {
    console.error(`Error: Target plan file does not exist at "${absolutePath}"`);
    process.exit(1);
  }

  const port = await findActivePort(options.port, absolutePath);
  const probe = await probePort(port, absolutePath);

  if (!probe.running) {
    console.log(`\nHive Plan Previewer: Hive desktop daemon is not reachable on port ${port}.`);
    console.log("Please ensure Hive is running to review plans in the native workbench tab.");
    console.log(`Target plan file: ${absolutePath}\n`);
    // Wait briefly in case Hive is starting up
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const retry = await probePort(port, absolutePath);
      if (retry.running) break;
    }
  }

  // Send notify request to Hive
  const notifyRes = await notifyHive(port, {
    filePath: absolutePath,
    context: options.context,
    response: options.response,
    questions: options.questions,
  });

  if (notifyRes && notifyRes.success) {
    console.log(`\n📋 Plan Previewer Connected (Hive Workbench Tab Active on port ${port})`);
    console.log(`Target Plan: ${absolutePath}\n`);

    if (options.questions.length > 0) {
      console.log(
        `Sent ${options.questions.length} question(s) to the Hive Plan tab. ` +
          "Waiting for the user to answer them there (do NOT ask in chat).\n",
      );
      if (options.consumedAskFile) {
        try {
          fs.unlinkSync(options.consumedAskFile);
        } catch {}
      }
    }
  } else {
    console.log(`\n📋 Plan Previewer: Target plan: ${absolutePath}`);
    console.log("Waiting for user feedback on plan...\n");
  }

  // Block synchronously waiting for user decision in Hive
  const data = await waitForFeedback(port, options.waitTimeoutSec, absolutePath);

  if (data && data.feedback) {
    const fb = data.feedback;
    const modeStr = fb.executionMode ? ` | mode=${String(fb.executionMode).toUpperCase()}` : "";
    console.log(
      `\n[PLAN-REVIEW]: status=${String(fb.status).toUpperCase()}${modeStr} | comment="${fb.comment || "None"}" | saved=.plan-feedback.json\n`,
    );

    if (Array.isArray(fb.answers) && fb.answers.length > 0) {
      console.log("[PLAN-ANSWERS]: user answered your questions in the previewer:");
      fb.answers.forEach((a, i) => {
        const val = a.selected || a.answer || "(skipped)";
        console.log(`  ${i + 1}. ${a.title || a.question || a.id} -> ${val}`);
      });
      console.log("");
    }
  } else if (data && (data.closed || data.exit)) {
    console.log(
      `\n[PLAN-REVIEW]: Plan previewer was dismissed by the user without submitting changes.\n` +
        `To review the plan again, run: plan-previewer ${filePath}\n`,
    );
  } else {
    console.log(
      `\nPlan previewer wait timeout completed after ${options.waitTimeoutSec}s - no decision submitted yet.\n` +
        "This is normal: re-run the exact same command to keep waiting.",
    );
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Plan Previewer Error:", err);
  process.exit(1);
});
