import { closeSync, fstatSync, openSync, readdirSync, readSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import type { SubagentLocateRequest, SubagentOutputChunk, SubagentOutputRef } from "@hive/protocol";

/**
 * Encodes a cwd path following pi-subagents conventions:
 * - Windows: "C:\Users\foo\project" -> "Users-foo-project"
 * - POSIX: "/home/user/project" -> "home-user-project"
 */
export function encodeCwd(cwd: string): string {
  return cwd
    .replace(/[/\\]/g, "-")
    .replace(/^[A-Za-z]:-/, "")
    .replace(/^-+/, "");
}

/** Root scratch directory where pi-subagents transcripts live. */
export function subagentRoot(): string {
  const uid = typeof process.getuid === "function" ? process.getuid() : 0;
  return join(tmpdir(), `pi-subagents-${uid}`);
}

/**
 * Validates that an output file path is safe to read:
 * - Must be an absolute, normalized path ending in `.output`
 * - Direct parent directory must be named `tasks`
 * - An ancestor directory must match the `pi-subagents-<uid>` sandbox pattern
 */
export function isAllowedOutputPath(filePath: string): boolean {
  if (!filePath || typeof filePath !== "string") return false;
  try {
    const resolved = resolve(filePath);
    if (!resolved.endsWith(".output")) return false;
    const parent = basename(dirname(resolved));
    if (parent !== "tasks") return false;

    // Check ancestor
    const parts = resolved.split(/[/\\]/);
    const hasSandbox = parts.some((part) => /^pi-subagents-\d+$/.test(part));
    if (!hasSandbox) return false;

    const st = statSync(resolved);
    return st.isFile();
  } catch {
    return false;
  }
}

/** Upper bound for a single JSONL line we are willing to buffer. */
const MAX_LINE_BYTES = 32_000_000;

/**
 * Reads a chunk of lines from a subagent `.output` JSONL file safely.
 */
export async function readChunk(
  filePath: string,
  fromOffset = 0,
  maxBytes = 1_000_000,
): Promise<SubagentOutputChunk> {
  if (!isAllowedOutputPath(filePath)) {
    throw new Error(`Access denied to subagent output path: ${filePath}`);
  }

  const fd = openSync(filePath, "r");
  let closed = false;
  try {
    const st = fstatSync(fd);
    const fileSize = st.size;
    if (fromOffset >= fileSize) {
      return { lines: [], nextOffset: fileSize, size: fileSize };
    }

    const bytesToRead = Math.min(maxBytes, fileSize - fromOffset);
    const buffer = Buffer.alloc(bytesToRead);
    const bytesRead = readSync(fd, buffer, 0, bytesToRead, fromOffset);

    // Find the last complete newline
    let lastNewline = -1;
    for (let i = bytesRead - 1; i >= 0; i--) {
      if (buffer[i] === 0x0a) { // '\n'
        lastNewline = i;
        break;
      }
    }

    // If no newline was found and we haven't reached EOF, wait for more data
    if (lastNewline === -1) {
      if (fromOffset + bytesRead >= fileSize) {
        // Last line without newline at EOF
        const lineStr = buffer.toString("utf8", 0, bytesRead).trim();
        const lines: unknown[] = [];
        if (lineStr) {
          try {
            lines.push(JSON.parse(lineStr));
          } catch {
            // ignore
          }
        }
        return { lines, nextOffset: fileSize, size: fileSize };
      }
      // A single line longer than the read window (e.g. a huge tool result). Grow the window so
      // the reader doesn't stall forever on it; past the cap, treat the line as unreadable.
      if (bytesRead >= maxBytes) {
        if (maxBytes < MAX_LINE_BYTES) {
          closeSync(fd);
          closed = true;
          return readChunk(filePath, fromOffset, Math.min(maxBytes * 4, MAX_LINE_BYTES));
        }
        return { lines: [], nextOffset: fromOffset + bytesRead, size: fileSize };
      }
      return { lines: [], nextOffset: fromOffset, size: fileSize };
    }

    const chunkStr = buffer.toString("utf8", 0, lastNewline);
    const nextOffset = fromOffset + lastNewline + 1;

    const lines: unknown[] = [];
    for (const rawLine of chunkStr.split("\n")) {
      const trimmed = rawLine.trim();
      if (!trimmed) continue;
      try {
        lines.push(JSON.parse(trimmed));
      } catch {
        // Skip malformed lines
      }
    }

    return { lines, nextOffset, size: fileSize };
  } finally {
    if (!closed) closeSync(fd);
  }
}

/**
 * Finds all candidate tasks directories matching a Pi session ID.
 */
export function findTaskDirs(root: string, sessionId: string): string[] {
  const results: string[] = [];
  try {
    const cwdDirs = readdirSync(root, { withFileTypes: true });
    for (const cwdDir of cwdDirs) {
      if (!cwdDir.isDirectory()) continue;
      const sessionPath = join(root, cwdDir.name, sessionId, "tasks");
      try {
        const st = statSync(sessionPath);
        if (st.isDirectory()) {
          results.push(sessionPath);
        }
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }
  return results;
}

/**
 * Locates a subagent transcript output file by outputFile, agentId, or prompt match.
 */
export async function locateSubagentOutput(
  req: SubagentLocateRequest,
  sessionId?: string | null,
): Promise<SubagentOutputRef | null> {
  // 1. Explicit output file
  if (req.outputFile && isAllowedOutputPath(req.outputFile)) {
    const name = basename(req.outputFile, ".output");
    return {
      agentId: req.agentId || name,
      path: req.outputFile,
    };
  }

  if (!sessionId) return null;
  const root = subagentRoot();
  const taskDirs = findTaskDirs(root, sessionId);
  if (taskDirs.length === 0) return null;

  // 2. Direct agentId match
  if (req.agentId) {
    for (const dir of taskDirs) {
      const candidate = join(dir, `${req.agentId}.output`);
      if (isAllowedOutputPath(candidate)) {
        return {
          agentId: req.agentId,
          path: candidate,
        };
      }
    }
  }

  // 3. Prompt match against line 1
  if (req.prompt) {
    let newestMatch: { agentId: string; path: string; mtime: number } | null = null;
    const excludes = new Set(req.excludeAgentIds ?? []);

    for (const dir of taskDirs) {
      let files: string[] = [];
      try {
        files = readdirSync(dir);
      } catch {
        continue;
      }

      for (const file of files) {
        if (!file.endsWith(".output")) continue;
        const agentId = basename(file, ".output");
        if (excludes.has(agentId)) continue;

        const fullPath = join(dir, file);
        if (!isAllowedOutputPath(fullPath)) continue;

        try {
          const st = statSync(fullPath);
          // Read first line to check prompt
          const fd = openSync(fullPath, "r");
          const buf = Buffer.alloc(2048);
          const bytesRead = readSync(fd, buf, 0, 2048, 0);
          closeSync(fd);

          const firstLine = buf.toString("utf8", 0, bytesRead).split("\n")[0]?.trim();
          if (!firstLine) continue;

          const parsed = JSON.parse(firstLine) as { message?: { content?: unknown } };
          if (parsed.message?.content === req.prompt) {
            if (!newestMatch || st.mtimeMs > newestMatch.mtime) {
              newestMatch = { agentId, path: fullPath, mtime: st.mtimeMs };
            }
          }
        } catch {
          // ignore read/parse errors
        }
      }
    }

    if (newestMatch) {
      return { agentId: newestMatch.agentId, path: newestMatch.path };
    }
  }

  return null;
}
