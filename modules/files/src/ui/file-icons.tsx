import React from "react";
import {
  FileText,
  FileCode2,
  FileJson,
  FileImage,
  Folder,
  FolderOpen,
  Terminal,
  FileArchive,
  Database,
  Lock,
  GitBranch,
  Settings,
  Flame,
  Globe,
  Palette,
  FileQuestion,
  FileAudio,
  FileSpreadsheet,
} from "lucide-react";

interface FileIconProps {
  name: string;
  isDirectory?: boolean;
  isOpen?: boolean;
  size?: number;
}

export const FileIcon: React.FC<FileIconProps> = ({
  name,
  isDirectory = false,
  isOpen = false,
  size = 14,
}) => {
  if (isDirectory) {
    return isOpen ? (
      <FolderOpen size={size} color="var(--accent-base)" style={{ flexShrink: 0 }} />
    ) : (
      <Folder size={size} color="var(--accent-base)" style={{ flexShrink: 0 }} />
    );
  }

  const lower = name.toLowerCase();

  // Special exact filenames
  if (lower === ".gitignore" || lower === ".gitmodules" || lower === ".gitattributes") {
    return <GitBranch size={size} color="#f97316" style={{ flexShrink: 0 }} />;
  }
  if (lower === "package.json" || lower === "pnpm-workspace.yaml" || lower.endsWith(".lock")) {
    return <Lock size={size} color="#eab308" style={{ flexShrink: 0 }} />;
  }
  if (lower.startsWith(".env")) {
    return <Settings size={size} color="#10b981" style={{ flexShrink: 0 }} />;
  }
  if (lower === "dockerfile" || lower.startsWith("docker-compose")) {
    return <Flame size={size} color="#38bdf8" style={{ flexShrink: 0 }} />;
  }

  const dotIdx = lower.lastIndexOf(".");
  const ext = dotIdx >= 0 ? lower.slice(dotIdx) : "";

  switch (ext) {
    // TypeScript / JavaScript
    case ".ts":
    case ".tsx":
      return <FileCode2 size={size} color="#3b82f6" style={{ flexShrink: 0 }} />;
    case ".js":
    case ".jsx":
    case ".mjs":
    case ".cjs":
      return <FileCode2 size={size} color="#eab308" style={{ flexShrink: 0 }} />;

    // Web & Styles
    case ".html":
    case ".htm":
      return <Globe size={size} color="#f97316" style={{ flexShrink: 0 }} />;
    case ".css":
    case ".scss":
    case ".sass":
    case ".less":
      return <Palette size={size} color="#38bdf8" style={{ flexShrink: 0 }} />;

    // Data / Config
    case ".json":
    case ".jsonc":
      return <FileJson size={size} color="#fbbf24" style={{ flexShrink: 0 }} />;
    case ".yaml":
    case ".yml":
    case ".toml":
    case ".xml":
    case ".ini":
    case ".conf":
      return <Settings size={size} color="#a3a3a3" style={{ flexShrink: 0 }} />;

    // Documentation
    case ".md":
    case ".mdx":
    case ".txt":
    case ".rtf":
      return <FileText size={size} color="#60a5fa" style={{ flexShrink: 0 }} />;

    // Shell & Scripts
    case ".sh":
    case ".bash":
    case ".zsh":
    case ".ps1":
    case ".bat":
    case ".cmd":
      return <Terminal size={size} color="#22c55e" style={{ flexShrink: 0 }} />;

    // Python / Backend languages
    case ".py":
    case ".pyw":
      return <FileCode2 size={size} color="#0284c7" style={{ flexShrink: 0 }} />;
    case ".rs":
      return <FileCode2 size={size} color="#ea580c" style={{ flexShrink: 0 }} />;
    case ".go":
      return <FileCode2 size={size} color="#06b6d4" style={{ flexShrink: 0 }} />;
    case ".c":
    case ".cpp":
    case ".h":
    case ".hpp":
      return <FileCode2 size={size} color="#6366f1" style={{ flexShrink: 0 }} />;
    case ".java":
    case ".kt":
      return <FileCode2 size={size} color="#f43f5e" style={{ flexShrink: 0 }} />;
    case ".rb":
    case ".php":
    case ".swift":
      return <FileCode2 size={size} color="#ec4899" style={{ flexShrink: 0 }} />;

    // Database
    case ".sql":
    case ".prisma":
    case ".sqlite":
    case ".db":
      return <Database size={size} color="#06b6d4" style={{ flexShrink: 0 }} />;

    // Media
    case ".png":
    case ".jpg":
    case ".jpeg":
    case ".gif":
    case ".svg":
    case ".webp":
    case ".ico":
      return <FileImage size={size} color="#10b981" style={{ flexShrink: 0 }} />;
    case ".mp3":
    case ".wav":
    case ".ogg":
    case ".flac":
      return <FileAudio size={size} color="#ec4899" style={{ flexShrink: 0 }} />;
    case ".csv":
    case ".tsv":
    case ".xlsx":
      return <FileSpreadsheet size={size} color="#10b981" style={{ flexShrink: 0 }} />;

    // Archives
    case ".zip":
    case ".tar":
    case ".gz":
    case ".rar":
    case ".7z":
      return <FileArchive size={size} color="#a855f7" style={{ flexShrink: 0 }} />;

    default:
      return <FileQuestion size={size} color="var(--text-muted)" style={{ flexShrink: 0 }} />;
  }
};
