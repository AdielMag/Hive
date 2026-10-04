import React from "react";
import {
  X,
  File,
  FileText,
  FileCode,
  FileBraces,
  FileSpreadsheet,
  FileArchive,
  FileMusic,
  FileVideoCamera,
  FileTerminal,
  FileCog,
  FileImage,
  type LucideIcon,
} from "lucide-react";
import type { AttachedItem } from "@hive/protocol";
import { useImagePreview } from "../store/image-preview-store.ts";

const EXT_GROUPS: Array<[LucideIcon, string[]]> = [
  [FileBraces, ["json", "jsonc", "json5", "yaml", "yml", "toml", "xml"]],
  [FileCode, ["ts", "tsx", "js", "jsx", "mjs", "cjs", "py", "rs", "go", "java", "kt", "c", "h", "cpp", "hpp", "cs", "rb", "php", "swift", "html", "css", "scss", "vue", "svelte", "sql", "lua", "dart"]],
  [FileTerminal, ["sh", "bash", "zsh", "ps1", "bat", "cmd", "fish"]],
  [FileSpreadsheet, ["csv", "tsv", "xls", "xlsx", "ods"]],
  [FileArchive, ["zip", "tar", "gz", "tgz", "rar", "7z", "bz2", "xz"]],
  [FileMusic, ["mp3", "wav", "flac", "ogg", "m4a", "aac"]],
  [FileVideoCamera, ["mp4", "mov", "webm", "mkv", "avi"]],
  [FileCog, ["env", "ini", "cfg", "conf", "lock", "gitignore", "editorconfig"]],
  [FileImage, ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico"]],
  [FileText, ["md", "mdx", "txt", "log", "rst", "pdf", "doc", "docx", "rtf"]],
];

function extOf(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? name;
  const dot = base.lastIndexOf(".");
  return dot >= 0 ? base.slice(dot + 1).toLowerCase() : "";
}

function iconFor(ext: string): LucideIcon {
  for (const [Icon, exts] of EXT_GROUPS) {
    if (exts.includes(ext)) return Icon;
  }
  return File;
}

interface AttachmentTrayProps {
  attachments: AttachedItem[];
  onRemove: (id: string) => void;
}

/** Compact tile previews for composer attachments: image thumbnails or file-type icons. */
export const AttachmentTray: React.FC<AttachmentTrayProps> = ({ attachments, onRemove }) => {
  const openPreview = useImagePreview((s) => s.openPreview);
  if (attachments.length === 0) return null;

  return (
    <div className="attach-tray">
      {attachments.map((att) => {
        const isImage = att.kind === "image" && !!att.previewUrl;
        const ext = extOf(att.name);
        const Icon = iconFor(ext);
        return (
          <div
            key={att.id}
            className={`attach-tile ${isImage ? "attach-tile--image" : "attach-tile--file"}`}
            title={att.name}
          >
            {isImage ? (
              <img
                src={att.previewUrl}
                alt={att.name}
                draggable={false}
                onClick={() => openPreview({ src: att.previewUrl!, alt: att.name, title: att.name })}
              />
            ) : (
              <div className="attach-tile__file">
                <Icon size={20} strokeWidth={1.6} />
                {ext && <span className="attach-tile__ext">{ext.slice(0, 5)}</span>}
              </div>
            )}
            <button
              type="button"
              className="attach-tile__remove"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(att.id);
              }}
              aria-label={`Remove ${att.name}`}
              title="Remove"
            >
              <X size={10} strokeWidth={2.5} />
            </button>
          </div>
        );
      })}
    </div>
  );
};
