import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import type { PiRuntimeInfo } from "@hive/module-sdk/main";
import type { GitBranchDetail, GitCommitLog, GitFileStatus, GitGraphCommit, GitRepoStatus } from "./shared.ts";

export type { GitFileStatus, GitRepoStatus, GitCommitLog };

const execFileAsync = promisify(execFile);

export async function runGit(
  args: string[],
  cwd: string,
  options?: { env?: NodeJS.ProcessEnv; timeout?: number },
): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-c", "core.quotepath=false", ...args], {
    cwd,
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
    ...(options?.env ? { env: options.env } : {}),
    ...(options?.timeout ? { timeout: options.timeout } : {}),
  });
  return stdout.trim();
}

/** Network operations must never block on an interactive credential prompt. */
const NETWORK_OPTIONS = {
  env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  timeout: 120_000,
};

async function runGitNetwork(args: string[], cwd: string): Promise<string> {
  try {
    return await runGit(args, cwd, NETWORK_OPTIONS);
  } catch (err: any) {
    const detail = String(err?.stderr || "").trim();
    throw new Error(detail || err?.message || String(err));
  }
}

export async function gitFetch(cwd: string): Promise<string> {
  return runGitNetwork(["fetch", "--all", "--prune"], cwd);
}

export async function gitPull(cwd: string): Promise<string> {
  return runGitNetwork(["pull", "--no-edit"], cwd);
}

export async function gitPush(cwd: string): Promise<string> {
  const { upstream, branch } = await getGitStatus(cwd);
  // No upstream yet: publish the current branch to origin and track it.
  if (!upstream && branch && branch !== "detached HEAD") {
    return runGitNetwork(["push", "--set-upstream", "origin", "HEAD"], cwd);
  }
  return runGitNetwork(["push"], cwd);
}

export async function getGitStatus(cwd: string): Promise<GitRepoStatus> {
  try {
    const raw = await runGit(["status", "--porcelain=v2", "--branch"], cwd);
    const lines = raw.split("\n").filter(Boolean);

    let branch = "HEAD";
    let upstream: string | undefined;
    let ahead = 0;
    let behind = 0;

    const staged: GitFileStatus[] = [];
    const unstaged: GitFileStatus[] = [];
    const untracked: GitFileStatus[] = [];

    for (const line of lines) {
      if (line.startsWith("# branch.head ")) {
        branch = line.slice(14);
      } else if (line.startsWith("# branch.upstream ")) {
        upstream = line.slice(18);
      } else if (line.startsWith("# branch.ab ")) {
        const parts = line.slice(12).split(" ");
        ahead = parseInt(parts[0]?.slice(1) ?? "0", 10) || 0;
        behind = parseInt(parts[1]?.slice(1) ?? "0", 10) || 0;
      } else if (line.startsWith("1 ") || line.startsWith("2 ")) {
        // Tracked changed file
        // 1 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>
        const parts = line.split(" ");
        const xy = parts[1] ?? "..";
        const stagedCode = xy[0];
        const unstagedCode = xy[1];
        const filePath = parts.slice(8).join(" ");

        if (stagedCode && stagedCode !== ".") {
          staged.push({
            path: filePath,
            staged: true,
            status: stagedCode === "A" ? "added" : stagedCode === "D" ? "deleted" : "modified",
          });
        }
        if (unstagedCode && unstagedCode !== ".") {
          unstaged.push({
            path: filePath,
            staged: false,
            status: unstagedCode === "D" ? "deleted" : "modified",
          });
        }
      } else if (line.startsWith("? ")) {
        // Untracked file
        const filePath = line.slice(2);
        untracked.push({
          path: filePath,
          staged: false,
          status: "untracked",
        });
      }
    }

    return {
      isRepo: true,
      branch: branch === "(detached)" ? "detached HEAD" : branch,
      upstream,
      ahead,
      behind,
      staged,
      unstaged,
      untracked,
    };
  } catch {
    return {
      isRepo: false,
      branch: "",
      ahead: 0,
      behind: 0,
      staged: [],
      unstaged: [],
      untracked: [],
    };
  }
}

export async function getGitBranches(cwd: string): Promise<string[]> {
  try {
    const raw = await runGit(["branch", "--list", "--format=%(refname:short)"], cwd);
    return raw.split("\n").map((b) => b.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export async function stageFile(cwd: string, filePath: string): Promise<void> {
  await runGit(["add", "--", filePath], cwd);
}

export async function stageAll(cwd: string): Promise<void> {
  await runGit(["add", "-A"], cwd);
}

export async function unstageFile(cwd: string, filePath: string): Promise<void> {
  await runGit(["restore", "--staged", "--", filePath], cwd);
}

export async function unstageAll(cwd: string): Promise<void> {
  try {
    await runGit(["restore", "--staged", "."], cwd);
  } catch {
    await runGit(["reset", "HEAD", "--", "."], cwd);
  }
}

export async function discardFile(cwd: string, filePath: string): Promise<void> {
  try {
    await runGit(["restore", "--", filePath], cwd);
  } catch {
    // If untracked, remove file
    await runGit(["clean", "-f", "--", filePath], cwd);
  }
}

export async function discardAll(cwd: string): Promise<void> {
  try {
    await runGit(["restore", "."], cwd);
  } catch {
    await runGit(["checkout", "--", "."], cwd);
  }
  try {
    await runGit(["clean", "-fd"], cwd);
  } catch {
    // Ignore clean failures
  }
}

export async function gitCommit(cwd: string, message: string, amend = false): Promise<string> {
  const args = ["commit", "-m", message];
  if (amend) args.push("--amend");
  return runGit(args, cwd);
}

export async function gitCheckout(cwd: string, branch: string): Promise<string> {
  return runGit(["checkout", branch], cwd);
}

export async function gitCreateBranch(cwd: string, branch: string): Promise<string> {
  return runGit(["checkout", "-b", branch], cwd);
}

export async function gitDeleteBranch(cwd: string, branch: string, force = false): Promise<string> {
  return runGit(["branch", force ? "-D" : "-d", branch], cwd);
}

export async function getGitLog(cwd: string, maxCount = 30): Promise<GitCommitLog[]> {
  try {
    const raw = await runGit(["log", "-n", String(maxCount), "--pretty=format:%h%x09%an%x09%ad%x09%s", "--date=relative"], cwd);
    if (!raw.trim()) return [];
    return raw.split("\n").filter(Boolean).map((line) => {
      const [hash = "", author = "", relativeDate = "", message = ""] = line.split("\t");
      return { hash, author, relativeDate, message };
    });
  } catch {
    return [];
  }
}

export async function getGitBranchDetails(cwd: string): Promise<GitBranchDetail[]> {
  try {
    const fmt = ["%(refname)", "%(objectname:short)", "%(upstream:short)", "%(upstream:track,nobracket)", "%(committerdate:relative)", "%(HEAD)", "%(subject)"].join("%00");
    const raw = await runGit(["for-each-ref", `--format=${fmt}`, "--sort=-committerdate", "refs/heads", "refs/remotes"], cwd);
    const out: GitBranchDetail[] = [];
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      const [ref = "", hash = "", upstream = "", track = "", relativeDate = "", head = "", subject = ""] = line.split("\0");
      const isRemote = ref.startsWith("refs/remotes/");
      const name = ref.replace(/^refs\/(heads|remotes)\//, "");
      if (isRemote && (name.endsWith("/HEAD") || !name.includes("/"))) continue;
      out.push({
        name,
        isRemote,
        ...(isRemote ? { remote: name.slice(0, name.indexOf("/")) } : {}),
        isCurrent: head.trim() === "*",
        hash,
        subject,
        relativeDate,
        ...(upstream ? { upstream } : {}),
        ahead: Number(/ahead (\d+)/.exec(track)?.[1] ?? 0),
        behind: Number(/behind (\d+)/.exec(track)?.[1] ?? 0),
        gone: track === "gone",
      });
    }
    return out;
  } catch {
    return [];
  }
}

export async function getGitGraph(cwd: string, maxCount = 120): Promise<GitGraphCommit[]> {
  try {
    const fmt = ["%H", "%h", "%P", "%an", "%ar", "%D", "%s"].join("%x00");
    const raw = await runGit(["log", "--all", "--date-order", "-n", String(maxCount), `--pretty=format:${fmt}`], cwd);
    if (!raw.trim()) return [];
    return raw.split("\n").filter(Boolean).map((line) => {
      const [hash = "", shortHash = "", parents = "", author = "", relativeDate = "", refs = "", message = ""] = line.split("\0");
      return {
        hash,
        shortHash,
        parents: parents.split(" ").filter(Boolean),
        author,
        relativeDate,
        message,
        refs: refs.split(",").map((r) => r.trim()).filter((r) => r && !r.endsWith("/HEAD")),
      };
    });
  } catch {
    return [];
  }
}

export async function getGitDiff(
  cwd: string,
  options?: { staged?: boolean; filePath?: string },
): Promise<string> {
  const args = ["diff"];
  if (options?.staged) {
    args.push("--staged");
  }
  if (options?.filePath) {
    args.push("--", options.filePath);
  }
  try {
    return await runGit(args, cwd);
  } catch {
    return "";
  }
}

export async function generateCommitMessage(
  cwd: string,
  piInfo: PiRuntimeInfo,
  model?: string,
): Promise<string> {
  const stagedDiff = await getGitDiff(cwd, { staged: true });
  if (!stagedDiff.trim()) {
    throw new Error("No staged changes found. Please stage files first.");
  }

  // Cap diff size at 80KB to keep within prompt bounds
  const MAX_DIFF_BYTES = 80 * 1024;
  let diffContent = stagedDiff;
  if (diffContent.length > MAX_DIFF_BYTES) {
    diffContent = diffContent.slice(0, MAX_DIFF_BYTES) + "\n\n[...diff truncated for length...]";
  }

  const prompt = `Generate a concise, high quality conventional git commit message (e.g. feat(...): ..., fix(...): ...) summarizing the following staged changes.
Follow these strict rules:
1. Provide a concise summary on the first line (maximum 72 characters).
2. If necessary, provide a brief bulleted description after a blank line.
3. Output ONLY the commit message text.
4. Do NOT output markdown code blocks (no \`\`\`), no backticks, no quotes around the whole message, and no pleasantries or explanatory chatter.

Staged diff:
${diffContent}`;

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
      cwd,
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

    child.on("error", (err) => {
      reject(new Error(`Failed to spawn Pi CLI: ${err.message}`));
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `Pi CLI exited with code ${code}`));
        return;
      }

      let msg = stdout.trim();
      // Strip markdown code fences if model wrapped the message in \`\`\`text ... \`\`\`
      if (msg.startsWith("```")) {
        msg = msg.replace(/^```[a-zA-Z]*\r?\n/, "").replace(/\r?\n```$/, "").trim();
      }
      // Strip outer quotes if any
      if ((msg.startsWith('"') && msg.endsWith('"')) || (msg.startsWith("'") && msg.endsWith("'"))) {
        msg = msg.slice(1, -1).trim();
      }

      resolve(msg);
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });
}
