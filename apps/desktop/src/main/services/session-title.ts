import { spawn } from "node:child_process";
import type { PiInstallInfo } from "@hive/protocol";

const TIMEOUT_MS = 20_000;
const MAX_PROMPT_CHARS = 2000;
const MAX_TITLE_CHARS = 50;

/** Normalize raw model output into a short single-line title ("" if unusable). */
export function cleanSessionTitle(raw: string): string {
  let t = raw.trim();
  if (t.startsWith("```")) t = t.replace(/^```[a-zA-Z]*\r?\n?/, "").replace(/\r?\n?```$/, "");
  t = (t.split(/\r?\n/).find((l) => l.trim()) ?? "").trim();
  t = t.replace(/^(title|name)\s*:\s*/i, "").replace(/^#+\s*/, "").replace(/[*_`]/g, "");
  t = t.replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").replace(/[.!?:;,\s]+$/, "").trim();
  if (t.length > MAX_TITLE_CHARS) t = `${t.slice(0, MAX_TITLE_CHARS - 1).trimEnd()}…`;
  return t;
}

/** One-shot Pi CLI call that names a session from its first prompt. Resolves "" on any failure. */
export function generateSessionTitle(
  pi: Pick<PiInstallInfo, "nodePath" | "cliPath">,
  cwd: string,
  prompt: string,
  model?: string,
): Promise<string> {
  const text = prompt.trim().slice(0, MAX_PROMPT_CHARS);
  if (!text) return Promise.resolve("");

  const instruction = `Write a short title (3 to 6 words) for a coding chat session that starts with the user message below.
Rules: output ONLY the title, in the same language as the message, no quotes, no markdown, no trailing punctuation.

User message:
${text}`;

  const args = [pi.cliPath, "-p", "--no-session", "--no-tools", "--no-context-files"];
  if (model) args.push("--model", model);

  return new Promise<string>((resolve) => {
    let settled = false;
    const done = (value: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const child = spawn(pi.nodePath, args, { cwd, windowsHide: true, stdio: ["pipe", "pipe", "ignore"] });
    const timer = setTimeout(() => {
      child.kill();
      done("");
    }, TIMEOUT_MS);

    let stdout = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.on("error", () => done(""));
    child.on("close", (code) => done(code === 0 ? cleanSessionTitle(stdout) : ""));
    child.stdin.on("error", () => {});
    child.stdin.write(instruction);
    child.stdin.end();
  });
}
