import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface GitFileStatus {
  path: string;
  origPath?: string;
  staged: boolean;
  status: "modified" | "added" | "deleted" | "renamed" | "untracked";
}

export interface GitRepoStatus {
  isRepo: boolean;
  branch: string;
  upstream?: string;
  ahead: number;
  behind: number;
  staged: GitFileStatus[];
  unstaged: GitFileStatus[];
  untracked: GitFileStatus[];
}

export async function runGit(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-c", "core.quotepath=false", ...args], {
    cwd,
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout.trim();
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

export async function discardFile(cwd: string, filePath: string): Promise<void> {
  try {
    await runGit(["restore", "--", filePath], cwd);
  } catch {
    // If untracked, remove file
    await runGit(["clean", "-f", "--", filePath], cwd);
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
