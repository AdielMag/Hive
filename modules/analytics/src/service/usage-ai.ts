import { spawn } from "node:child_process";
import type { PiInstallInfo } from "@hive/protocol";

export async function generateAiUsageInsights(
  summaryText: string,
  piInfo: PiInstallInfo,
  model?: string,
): Promise<string> {
  const prompt = `You are an AI efficiency and telemetry analyst reviewing LLM usage metrics.
Review the following metrics and provide:
1. A concise, 2-sentence executive summary highlighting key observations about spend velocity and prompt cache efficiency.
2. Two high-impact, actionable recommendations to optimize cost or latency.

Format clearly with short bullet points. Do not include markdown code fences or conversational greetings.

Usage telemetry summary:
${summaryText}`;

  const args = [
    piInfo.cliPath,
    "-p",
    "--no-session",
    "--no-tools",
    "--no-context-files",
  ];
  if (model) {
    args.push("--model", model);
  }

  return new Promise<string>((resolve, reject) => {
    const child = spawn(piInfo.nodePath, args, {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {}
      reject(new Error("AI usage insights generation timed out"));
    }, 25_000);

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`Failed to spawn Pi CLI: ${err.message}`));
    });

    child.stdin.on("error", () => {
      // Ignore broken pipe errors if process exits before or while writing
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(stderr.trim() || `Pi CLI exited with code ${code}`));
        return;
      }

      let msg = stdout.trim();
      if (msg.startsWith("```")) {
        msg = msg.replace(/^```[a-zA-Z]*\r?\n/, "").replace(/\r?\n```$/, "").trim();
      }
      resolve(msg);
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });
}
