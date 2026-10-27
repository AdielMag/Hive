import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join, normalize, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface ShadowRepoOptions {
  /** Project directory (working tree). */
  cwd: string;
  /** Storage root for shadow git repos (typically <userData>/checkpoints). */
  storageDir: string;
  /** File size limit in bytes (defaults to 8MB). Larger files are skipped and mark snapshot partial. */
  maxFileSizeBytes?: number;
  /** Max files to add in one snapshot (defaults to 10,000). Excess marks snapshot partial. */
  maxFileCount?: number;
}

export interface SnapshotResult {
  tree: string;
  commit: string;
  fileCount: number;
  partial: boolean;
  skippedFiles: string[];
}

export interface ChangedFile {
  path: string;
  status: "added" | "modified" | "deleted";
}

export interface RestorePlan {
  filesToRestore: string[];
  filesToDelete: string[];
  /** Files absent from the target tree that were never snapshotted (or are skippable); left untouched. */
  filesKept: string[];
  conflicts: string[];
}

export interface RestoreResult {
  restored: string[];
  deleted: string[];
  errors: { path: string; error: string }[];
}

/** Known binary media / package extensions skipped to avoid blowing up shadow git repos */
const DEFAULT_IGNORED_EXTENSIONS = new Set([
  ".zip", ".tar", ".gz", ".tgz", ".7z", ".rar",
  ".mp4", ".mov", ".avi", ".mkv", ".webm",
  ".mp3", ".wav", ".flac", ".ogg",
  ".iso", ".bin", ".exe", ".dll", ".so", ".dylib",
  ".parquet", ".h5", ".onnx", ".pt", ".bin", ".safetensors"
]);

export class ShadowRepo {
  readonly cwd: string;
  readonly gitDir: string;
  readonly maxFileSizeBytes: number;
  readonly maxFileCount: number;

  constructor(opts: ShadowRepoOptions) {
    this.cwd = resolve(opts.cwd);
    const hash = createHash("sha1").update(normalize(this.cwd).toLowerCase()).digest("hex");
    this.gitDir = join(opts.storageDir, `${hash}.git`);
    this.maxFileSizeBytes = opts.maxFileSizeBytes ?? 8 * 1024 * 1024;
    this.maxFileCount = opts.maxFileCount ?? 10_000;
  }

  /** Run git pointing to this shadow repo and project work tree. */
  async runGit(args: string[], extraEnv?: NodeJS.ProcessEnv): Promise<string> {
    const isBareInit = args[0] === "init" && args.includes("--bare");
    const defaultArgs = [
      "-c", "core.autocrlf=false",
      "-c", "core.safecrlf=false",
      "-c", "core.longpaths=true",
      "-c", "core.quotepath=false",
      "-c", "gc.auto=0",
      "-c", "user.name=Hive",
      "-c", "user.email=hive@local",
    ];

    if (!isBareInit) {
      defaultArgs.unshift(`--git-dir=${this.gitDir}`, `--work-tree=${this.cwd}`);
    }

    try {
      const { stdout } = await execFileAsync("git", [...defaultArgs, ...args], {
        cwd: isBareInit ? this.gitDir : this.cwd,
        windowsHide: true,
        maxBuffer: 25 * 1024 * 1024,
        timeout: 60_000,
        env: {
          ...process.env,
          ...(isBareInit ? {} : { GIT_DIR: this.gitDir, GIT_WORK_TREE: this.cwd }),
          GIT_TERMINAL_PROMPT: "0",
          ...extraEnv,
        },
      });
      return stdout.trim();
    } catch (err: any) {
      const msg = String(err?.stderr || err?.stdout || err?.message || "").trim();
      throw new Error(`Git shadow execution failed: ${msg}`);
    }
  }

  /** Initializes the shadow bare git repo if it doesn't already exist. */
  async init(): Promise<void> {
    if (!existsSync(this.gitDir)) {
      mkdirSync(this.gitDir, { recursive: true });
      await this.runGit(["init", "--bare"]);
      // Configure default ignore patterns for the shadow repo
      const infoDir = join(this.gitDir, "info");
      mkdirSync(infoDir, { recursive: true });
      const excludeFile = join(infoDir, "exclude");
      
      const customExcludes = [
        ".git/",
        "node_modules/",
        ".venv/",
        "dist/",
        "build/",
        "out/",
        "target/",
        ".next/",
        ".nuxt/",
        ".cache/",
        ".turbo/",
      ].join("\n") + "\n";

      // If user repo has info/exclude, copy it over
      let userExcludes = "";
      const userExcludePath = join(this.cwd, ".git", "info", "exclude");
      if (existsSync(userExcludePath)) {
        try {
          userExcludes = readFileSync(userExcludePath, "utf8") + "\n";
        } catch {}
      }

      const { writeFileSync } = await import("node:fs");
      writeFileSync(excludeFile, customExcludes + userExcludes, "utf8");
    }
  }

  /**
   * Captures the current work tree state into a git tree and commit.
   * Honoring ignores, skipping large binaries, and capping file count.
   */
  async snapshot(message = "checkpoint"): Promise<SnapshotResult> {
    await this.init();

    // List all modified, added, untracked files respecting .gitignore and info/exclude
    const rawListing = await this.runGit([
      "ls-files",
      "-z",
      "--others",
      "--modified",
      "--exclude-standard",
    ]);

    const allFiles = rawListing ? rawListing.split("\0").filter(Boolean) : [];
    const validFiles: string[] = [];
    const skippedFiles: string[] = [];
    let isPartial = false;

    for (const rel of allFiles) {
      if (validFiles.length >= this.maxFileCount) {
        isPartial = true;
        skippedFiles.push(rel);
        continue;
      }

      const fullPath = join(this.cwd, rel);
      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory()) continue;

        const ext = rel.slice(rel.lastIndexOf(".")).toLowerCase();
        if (stat.size > this.maxFileSizeBytes || DEFAULT_IGNORED_EXTENSIONS.has(ext)) {
          isPartial = true;
          skippedFiles.push(rel);
          continue;
        }

        validFiles.push(rel);
      } catch {
        // File might have been deleted/moved in flight
      }
    }

    // Stage changes in shadow index
    if (validFiles.length > 0) {
      // Stage added / modified files via --pathspec-from-file to handle long lists safely
      const { writeFileSync, unlinkSync } = await import("node:fs");
      const listFile = join(this.gitDir, `stage-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`);
      try {
        writeFileSync(listFile, validFiles.join("\n"), "utf8");
        await this.runGit(["add", "--pathspec-from-file=" + listFile]);
      } finally {
        try { unlinkSync(listFile); } catch {}
      }
    }

    // Track deletions
    await this.runGit(["add", "-u"]);

    // Write tree
    const tree = await this.runGit(["write-tree"]);

    // Create a commit pointing to tree
    const commit = await this.runGit(["commit-tree", tree, "-m", message]);

    return {
      tree,
      commit,
      fileCount: validFiles.length,
      partial: isPartial,
      skippedFiles,
    };
  }

  /** Return list of changed files between two trees/commits. */
  async changedFiles(treeA: string, treeB: string): Promise<ChangedFile[]> {
    await this.init();
    if (!treeA || !treeB) return [];

    try {
      const output = await this.runGit([
        "diff-tree",
        "-r",
        "-z",
        "--no-renames",
        "--name-status",
        treeA,
        treeB,
      ]);

      if (!output) return [];

      const parts = output.split("\0").filter(Boolean);
      const changes: ChangedFile[] = [];

      for (let i = 0; i < parts.length; i += 2) {
        const statusLetter = parts[i];
        const filePath = parts[i + 1];
        if (!statusLetter || !filePath) continue;

        let status: ChangedFile["status"] = "modified";
        if (statusLetter.startsWith("A")) status = "added";
        else if (statusLetter.startsWith("D")) status = "deleted";

        changes.push({ path: filePath, status });
      }

      return changes;
    } catch {
      return [];
    }
  }

  /** Return unified diff between two trees/commits, optionally filtered to a specific path. */
  async diffText(treeA: string, treeB: string, filePath?: string): Promise<string> {
    await this.init();
    const args = ["diff", treeA, treeB];
    if (filePath) args.push("--", filePath);
    try {
      return await this.runGit(args);
    } catch {
      return "";
    }
  }

  /**
   * Plans restoration from a target tree.
   * Checks current working tree files to detect untracked edits or conflicts.
   */
  async planRestore(targetTree: string, pathsToRestore?: string[]): Promise<RestorePlan> {
    await this.init();

    // 1. Files present in targetTree
    const targetListing = await this.runGit([
      "ls-tree",
      "-r",
      "-z",
      "--name-only",
      targetTree,
    ]);
    const targetSet = new Set(targetListing ? targetListing.split("\0").filter(Boolean) : []);

    // 2. Untracked/modified files currently in work tree
    const currentListing = await this.runGit([
      "ls-files",
      "-z",
      "--others",
      "--modified",
      "--cached",
      "--exclude-standard",
    ]);
    const currentFiles = Array.from(new Set(currentListing ? currentListing.split("\0").filter(Boolean) : []));

    const filesToRestore: string[] = [];
    const filesToDelete: string[] = [];
    const filesKept: string[] = [];
    const conflicts: string[] = [];
    const allowedSet = pathsToRestore ? new Set(pathsToRestore) : null;

    // Only files the shadow repo has captured (tracked in its index) may be deleted.
    // Never-snapshotted files (too large, binary, over file cap) are user data: keep.
    const trackedListing = await this.runGit(["ls-files", "-z", "--cached"]);
    const trackedSet = new Set(
      (trackedListing ? trackedListing.split(" ").filter(Boolean) : []).map((f) => f.replaceAll("\\", "/")),
    );

    // Check files in working tree that weren't in targetTree
    for (const rel of currentFiles) {
      const normalizedRel = rel.replaceAll("\\", "/");
      if (allowedSet && !allowedSet.has(normalizedRel)) continue;
      if (!targetSet.has(normalizedRel)) {
        if (trackedSet.has(normalizedRel) && !this.wouldSkip(rel)) {
          filesToDelete.push(rel);
        } else {
          filesKept.push(rel);
        }
      }
    }

    // Check files that differ between target tree and working tree
    const diffStatus = await this.runGit([
      "diff-index",
      "-z",
      "--name-status",
      targetTree,
    ]);

    const parts = diffStatus ? diffStatus.split("\0").filter(Boolean) : [];
    for (let i = 0; i < parts.length; i += 2) {
      const statusLetter = parts[i];
      const relPath = parts[i + 1];
      if (!statusLetter || !relPath) continue;
      if (allowedSet && !allowedSet.has(relPath)) continue;

      if (statusLetter.startsWith("D")) {
        filesToRestore.push(relPath);
      } else if (statusLetter.startsWith("M")) {
        filesToRestore.push(relPath);
      }
    }

    return {
      filesToRestore,
      filesToDelete,
      filesKept,
      conflicts,
    };
  }

  /** True if snapshot() would skip this file (size/extension). Unreadable files count as skipped. */
  private wouldSkip(rel: string): boolean {
    try {
      const stat = statSync(join(this.cwd, rel));
      if (stat.isDirectory()) return false;
      const dot = rel.lastIndexOf(".");
      const ext = dot >= 0 ? rel.slice(dot).toLowerCase() : "";
      return stat.size > this.maxFileSizeBytes || DEFAULT_IGNORED_EXTENSIONS.has(ext);
    } catch {
      return false;
    }
  }

  /**
   * Restores files to match target tree.
   * Optionally takes a safety snapshot before modifying disk.
   */
  async restore(targetTree: string, paths?: string[]): Promise<RestoreResult> {
    await this.init();
    const plan = await this.planRestore(targetTree, paths);
    const restored: string[] = [];
    const deleted: string[] = [];
    const errors: { path: string; error: string }[] = [];

    // Restore modified & missing files from target tree
    if (plan.filesToRestore.length > 0) {
      try {
        const { writeFileSync, unlinkSync } = await import("node:fs");
        const listFile = join(this.gitDir, `restore-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`);
        try {
          writeFileSync(listFile, plan.filesToRestore.join("\n"), "utf8");
          await this.runGit([
            "checkout",
            targetTree,
            "--pathspec-from-file=" + listFile,
          ]);
          restored.push(...plan.filesToRestore);
        } finally {
          try { unlinkSync(listFile); } catch {}
        }
      } catch (err: any) {
        // Fall back to per-file restore if batch fails
        for (const file of plan.filesToRestore) {
          try {
            await this.runGit(["checkout", targetTree, "--", file]);
            restored.push(file);
          } catch (e: any) {
            errors.push({ path: file, error: String(e.message || e) });
          }
        }
      }
    }

    // Delete files that were created since target tree
    for (const rel of plan.filesToDelete) {
      const full = join(this.cwd, rel);
      try {
        if (existsSync(full)) {
          rmSync(full, { force: true, recursive: true, maxRetries: 3, retryDelay: 100 });
          deleted.push(rel);
        }
      } catch (err: any) {
        errors.push({ path: rel, error: String(err?.message || err) });
      }
    }

    return { restored, deleted, errors };
  }

  /** Checks if git is installed and reachable. */
  static async isGitAvailable(): Promise<boolean> {
    try {
      const { stdout } = await execFileAsync("git", ["--version"]);
      return stdout.toLowerCase().includes("git version");
    } catch {
      return false;
    }
  }
}
