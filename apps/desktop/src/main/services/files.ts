import { readdirSync, statSync, readFileSync, existsSync, mkdirSync, writeFileSync, unlinkSync, promises as fsPromises } from "node:fs";
import { tmpdir } from "node:os";
import { join, extname, relative } from "node:path";

export interface FileNode {
  name: string;
  path: string;
  relativePath: string;
  isDirectory: boolean;
  size?: number;
  extension?: string;
  children?: FileNode[];
  hasChildren?: boolean;
  lazy?: boolean;
  truncated?: boolean;
}

export interface FileContentResult {
  path: string;
  content: string;
  language: string;
  size: number;
  mimeType?: string;
  isBinary?: boolean;
  dataUrl?: string;
}

const IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  ".venv",
  "venv",
  "__pycache__",
  "target",
  "dist",
  "build",
  "out",
  ".next",
  ".nuxt",
  ".turbo",
  ".cache",
  "vendor",
  "coverage",
  ".gradle",
  ".idea",
  "Pods",
  "DerivedData",
  ".pi-node",
]);

const MAX_ENTRIES = 5000;

interface TraversalState {
  count: number;
  truncated: boolean;
}

export async function listDirectory(
  dirPath: string,
  rootPath: string = dirPath,
  depth = 0,
  maxDepth = 4,
  state: TraversalState = { count: 0, truncated: false },
): Promise<FileNode[]> {
  if (depth > maxDepth || state.count >= MAX_ENTRIES) return [];
  try {
    const entries = await fsPromises.readdir(dirPath, { withFileTypes: true });
    const nodes: FileNode[] = [];

    // Sort: directories first, then alphabetical
    const sorted = entries.sort((a, b) => {
      const aIsDir = a.isDirectory();
      const bIsDir = b.isDirectory();
      if (aIsDir && !bIsDir) return -1;
      if (!aIsDir && bIsDir) return 1;
      return a.name.localeCompare(b.name);
    });

    for (const entry of sorted) {
      if (state.count >= MAX_ENTRIES) {
        state.truncated = true;
        break;
      }
      if (IGNORED_DIRS.has(entry.name)) continue;

      state.count++;
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
          node.children = await listDirectory(fullPath, rootPath, depth + 1, maxDepth, state);
          if (state.truncated) node.truncated = true;
        } else {
          node.children = undefined;
          node.hasChildren = true;
          node.lazy = true;
        }
      } else {
        try {
          const st = await fsPromises.stat(fullPath);
          node.size = st.size;
        } catch {
          // best-effort stat
        }
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
    case ".png":
    case ".jpg":
    case ".jpeg":
    case ".webp":
    case ".gif":
    case ".bmp":
    case ".ico":
    case ".avif":
      return "image";
    case ".svg":
      return "xml";
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
    case ".ico":
      return "image/x-icon";
    case ".avif":
      return "image/avif";
    case ".mp4":
    case ".m4v":
      return "video/mp4";
    case ".mov":
      return "video/quicktime";
    case ".webm":
      return "video/webm";
    case ".mkv":
      return "video/x-matroska";
    case ".avi":
      return "video/x-msvideo";
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

const RASTER_IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".ico", ".avif"]);

export function isRasterImageFile(filePath: string): boolean {
  return RASTER_IMAGE_EXTS.has(extname(filePath).toLowerCase());
}

export function readFileContent(filePath: string): FileContentResult {
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const stat = statSync(filePath);
  const ext = extname(filePath).toLowerCase();
  const isRasterImg = RASTER_IMAGE_EXTS.has(ext);
  const isSvg = ext === ".svg";
  const maxSize = isRasterImg ? 20 * 1024 * 1024 : 2 * 1024 * 1024;
  if (stat.size > maxSize) {
    throw new Error(`File too large (${(stat.size / 1024 / 1024).toFixed(1)}MB) to view inline`);
  }

  const mimeType = detectMimeType(filePath);

  if (isRasterImg) {
    const buffer = readFileSync(filePath);
    const data = buffer.toString("base64");
    return {
      path: filePath.replace(/\\/g, "/"),
      content: "",
      language: "image",
      size: stat.size,
      mimeType,
      isBinary: true,
      dataUrl: `data:${mimeType};base64,${data}`,
    };
  }

  const content = readFileSync(filePath, "utf8");
  return {
    path: filePath.replace(/\\/g, "/"),
    content,
    language: detectLanguage(filePath),
    size: stat.size,
    mimeType,
    ...(isSvg ? { dataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(content)}` } : {}),
  };
}

const MAX_ATTACHMENT_BYTES = 500 * 1024 * 1024;
const ATTACHMENT_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Best-effort cleanup of attachment files older than 24 hours. */
export function cleanOldAttachments(dir = join(tmpdir(), "hive-attachments")): void {
  try {
    if (!existsSync(dir)) return;
    const now = Date.now();
    const files = readdirSync(dir);
    for (const file of files) {
      try {
        const fullPath = join(dir, file);
        const st = statSync(fullPath);
        if (now - st.mtimeMs > ATTACHMENT_MAX_AGE_MS) {
          unlinkSync(fullPath);
        }
      } catch {
        // best-effort per file
      }
    }
  } catch {
    // best-effort
  }
}

/** Write clipboard/drag bytes (videos have no path) to a temp file and return it, so the prompt can reference it. */
export function saveAttachmentFile(name: string, data: ArrayBuffer): { path: string; size: number } {
  const buf = Buffer.from(data);
  if (buf.length > MAX_ATTACHMENT_BYTES) {
    throw new Error(`File too large (${(buf.length / 1024 / 1024).toFixed(0)}MB) to attach`);
  }
  const dir = join(tmpdir(), "hive-attachments");
  cleanOldAttachments(dir);
  mkdirSync(dir, { recursive: true });
  const safe = (name.split(/[/\\]/).pop() || "attachment").replace(/[^\w.\- ]+/g, "_").slice(-120);
  const filePath = join(dir, `${Date.now().toString(36)}-${safe}`);
  writeFileSync(filePath, buf);
  return { path: filePath, size: buf.length };
}
