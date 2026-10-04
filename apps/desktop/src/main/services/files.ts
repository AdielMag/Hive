import { readdirSync, statSync, readFileSync, existsSync } from "node:fs";
import { join, extname, relative } from "node:path";

export interface FileNode {
  name: string;
  path: string;
  relativePath: string;
  isDirectory: boolean;
  size?: number;
  extension?: string;
  children?: FileNode[];
}

export interface FileContentResult {
  path: string;
  content: string;
  language: string;
  size: number;
}

const IGNORED_DIRS = new Set([".git", "node_modules", "dist", "out", ".pi-node", "build"]);

export function listDirectory(dirPath: string, rootPath: string = dirPath, depth = 0, maxDepth = 4): FileNode[] {
  if (!existsSync(dirPath) || depth > maxDepth) return [];
  try {
    const entries = readdirSync(dirPath, { withFileTypes: true });
    const nodes: FileNode[] = [];

    // Sort: directories first, then alphabetical
    const sorted = entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

    for (const entry of sorted) {
      if (IGNORED_DIRS.has(entry.name)) continue;

      const fullPath = join(dirPath, entry.name);
      const isDir = entry.isDirectory();
      const ext = extname(entry.name).toLowerCase();

      const node: FileNode = {
        name: entry.name,
        path: fullPath.replace(/\\/g, "/"),
        relativePath: relative(rootPath, fullPath).replace(/\\/g, "/"),
        isDirectory: isDir,
        extension: ext,
      };

      if (isDir) {
        if (depth < maxDepth) {
          node.children = listDirectory(fullPath, rootPath, depth + 1, maxDepth);
        }
      } else {
        try {
          node.size = statSync(fullPath).size;
        } catch {}
      }

      nodes.push(node);
    }
    return nodes;
  } catch {
    return [];
  }
}

export function detectLanguage(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  switch (ext) {
    case ".ts":
    case ".tsx":
      return "typescript";
    case ".js":
    case ".jsx":
    case ".mjs":
    case ".cjs":
      return "javascript";
    case ".py":
      return "python";
    case ".rs":
      return "rust";
    case ".go":
      return "go";
    case ".json":
      return "json";
    case ".md":
      return "markdown";
    case ".html":
      return "html";
    case ".css":
      return "css";
    case ".sh":
    case ".bash":
      return "shell";
    case ".ps1":
      return "powershell";
    case ".sql":
      return "sql";
    case ".yaml":
    case ".yml":
      return "yaml";
    default:
      return "text";
  }
}

export function detectMimeType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  switch (ext) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".svg":
      return "image/svg+xml";
    case ".bmp":
      return "image/bmp";
    case ".pdf":
      return "application/pdf";
    case ".json":
      return "application/json";
    default:
      return "application/octet-stream";
  }
}

export function readMediaFile(filePath: string): { data: string; mimeType: string; size: number; name: string } {
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const stat = statSync(filePath);
  if (stat.size > 20 * 1024 * 1024) {
    throw new Error(`File too large (${(stat.size / 1024 / 1024).toFixed(1)}MB) to attach`);
  }
  const buffer = readFileSync(filePath);
  const data = buffer.toString("base64");
  const fileName = filePath.split(/[/\\]/).pop() || "file";
  return {
    data,
    mimeType: detectMimeType(filePath),
    size: stat.size,
    name: fileName,
  };
}

export function readFileContent(filePath: string): FileContentResult {
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const stat = statSync(filePath);
  if (stat.size > 2 * 1024 * 1024) {
    throw new Error(`File too large (${(stat.size / 1024 / 1024).toFixed(1)}MB) to view inline`);
  }
  const content = readFileSync(filePath, "utf8");
  return {
    path: filePath.replace(/\\/g, "/"),
    content,
    language: detectLanguage(filePath),
    size: stat.size,
  };
}
