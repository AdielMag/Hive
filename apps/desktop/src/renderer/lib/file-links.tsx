import React from "react";
import { visit } from "unist-util-visit";
import type { Root, Text, Link, PhrasingContent } from "mdast";
import { useSessionStore } from "../store/session-store.ts";
import { COMMANDS_BY_ID } from "../features/commands/registry.ts";

export const FILE_EXTENSIONS = new Set([
  // Web & Scripting
  "ts", "tsx", "js", "jsx", "mjs", "cjs", "json", "jsonc", "json5", "jsonl",
  "html", "htm", "css", "scss", "sass", "less", "svg", "xml",
  // Documents & Markup
  "md", "markdown", "mdx", "txt", "pdf", "rst", "adoc", "tex",
  // Configs & Data
  "yaml", "yml", "toml", "ini", "cfg", "conf", "env", "sql", "graphql", "gql", "proto",
  // Backend / Systems
  "py", "rs", "go", "java", "kt", "kts", "c", "cpp", "cc", "cxx", "h", "hpp",
  "cs", "php", "rb", "swift", "lua", "zig", "dart", "scala", "r", "sh", "bash", "zsh", "fish", "ps1", "bat", "cmd",
  // Frontend frameworks
  "vue", "svelte", "astro",
  // Media & Images
  "png", "jpg", "jpeg", "webp", "gif", "bmp", "ico", "avif", "mp4", "webm", "mp3", "wav",
  // Shaders & Build
  "lock", "wasm", "cmake", "make", "dockerfile", "diff", "patch",
]);

export const EXACT_FILENAMES = new Set([
  "dockerfile", "makefile", "procfile", "gemfile", "rakefile", "vagrantfile",
  ".gitignore", ".gitattributes", ".gitmodules",
  ".env", ".env.local", ".env.development", ".env.production", ".env.test", ".env.example",
  ".editorconfig", ".prettierrc", ".eslintrc", ".npmignore", ".dockerignore",
  "package.json", "tsconfig.json", "cargo.toml", "go.mod", "go.sum",
  "requirements.txt", "gemfile.lock", "package-lock.json", "pnpm-lock.yaml", "yarn.lock",
  "readme.md", "license", "licence", "changelog.md",
]);

export const TECH_NAMES = new Set([
  "node.js", "next.js", "vue.js", "react.js", "nuxt.js", "nest.js", "deno.js", "bun.js",
  "three.js", "socket.io", "express.js", "d3.js", "chart.js", "electron.js",
]);

/** Matches potential file paths within plain text. Lookbehind prevents quadratic token scanning. */
export const FILE_PATH_REGEX =
  /(?<![\w./\\@:])(?:(?:[a-zA-Z]:[/\\]|~[/\\]|\.\.?[/\\]|\/|[a-zA-Z0-9_.-]+[/\\])[a-zA-Z0-9_./\\-]+(?:\.[a-zA-Z0-9]+)+(?::\d+(?::\d+)?)?|[a-zA-Z0-9_.-]+\.(?:json[c5]?|tsx?|jsx?|mjs|cjs|html?|css|scss|md|markdown|py|rs|go|yaml|yml|toml|sh|bash|sql|png|jpe?g|svg|webp|ico)\b(?::\d+(?::\d+)?)?|\b(?:Dockerfile|Makefile|\.gitignore|\.env(?:\.[a-zA-Z0-9_-]+)?)\b)/gi;

/**
 * Checks whether a given string is a recognizable file path.
 */
export function isFilePath(raw: string | undefined | null): boolean {
  if (!raw || typeof raw !== "string") return false;
  let str = raw.trim().replace(/^[`'"]+|[`'"]+$/g, "");
  if (!str || str.startsWith("http://") || str.startsWith("https://") || str.startsWith("mailto:")) return false;

  // Strip trailing line/column indicator (e.g. :42 or :42:15 or #L42)
  str = str.replace(/:\d+(?::\d+)?$/, "").replace(/#L\d+$/, "");
  // Strip trailing punctuation
  str = str.replace(/[.,;:)]+$/, "");
  if (!str) return false;

  const base = str.split(/[/\\]/).pop()?.toLowerCase() || "";
  if (EXACT_FILENAMES.has(base)) return true;
  if (TECH_NAMES.has(base)) return false;

  const hasSep = str.includes("/") || str.includes("\\");
  const extMatch = /\.([a-zA-Z0-9]+)$/.exec(base);
  if (extMatch && extMatch[1]) {
    const ext = extMatch[1].toLowerCase();
    if (FILE_EXTENSIONS.has(ext)) {
      if (!hasSep && /^\d+\.\d+/.test(base)) return false;
      return true;
    }
  }

  if (hasSep && (str.startsWith("./") || str.startsWith("../") || str.startsWith("/") || /^[a-zA-Z]:[/\\]/.test(str))) {
    return extMatch !== null || base.includes(".");
  }

  return false;
}

export interface ParsedFilePath {
  path: string;
  line?: number;
  column?: number;
}

/**
 * Parses raw file path input, extracting the clean file path and optional line/column numbers.
 */
export function parseFilePath(raw: string): ParsedFilePath {
  let cleaned = raw.trim().replace(/^[`'"]+|[`'"]+$/g, "").trim();

  // Strip file:// prefix
  if (cleaned.startsWith("file:///")) {
    cleaned = cleaned.slice(7); // leaves /path or C:/path
  } else if (cleaned.startsWith("file://")) {
    cleaned = cleaned.slice(7);
  }

  let line: number | undefined;
  let column: number | undefined;

  const hashMatch = /^(.*?)#L(\d+)$/.exec(cleaned);
  if (hashMatch && hashMatch[1] && hashMatch[2]) {
    cleaned = hashMatch[1];
    line = parseInt(hashMatch[2], 10);
  } else {
    const lineMatch = /^(.*?):(\d+)(?::(\d+))?$/.exec(cleaned);
    if (lineMatch && lineMatch[1] && lineMatch[2]) {
      cleaned = lineMatch[1];
      line = parseInt(lineMatch[2], 10);
      if (lineMatch[3]) {
        column = parseInt(lineMatch[3], 10);
      }
    }
  }

  // Strip trailing punctuation from path
  cleaned = cleaned.replace(/[.,;:)]+$/, "");

  return { path: cleaned, line, column };
}

/**
 * Opens a file path in another tab (via the file.open command or session store module tab).
 */
export async function openFileInTab(rawPath: string, options?: { projectId?: string; line?: number }): Promise<void> {
  const { path: cleanPath, line: parsedLine, column } = parseFilePath(rawPath);
  if (!cleanPath) return;

  const line = options?.line ?? parsedLine;
  const isAbsolute =
    cleanPath.startsWith("/") ||
    /^[a-zA-Z]:[/\\]/.test(cleanPath) ||
    cleanPath.startsWith("\\\\");

  const sessionStore = useSessionStore.getState();
  const activeProject = options?.projectId
    ? sessionStore.projects.find((p) => p.id === options.projectId) ?? sessionStore.activeProject
    : sessionStore.activeProject;

  let fullPath = cleanPath;
  if (!isAbsolute && activeProject?.path) {
    const base = activeProject.path.replace(/[/\\]+$/, "");
    const rel = cleanPath.replace(/^[/\\]+/, "");
    fullPath = `${base}/${rel}`;
  }

  const fileName = cleanPath.split(/[/\\]/).pop() || cleanPath;

  const fileOpenCmd = COMMANDS_BY_ID.get("file.open");
  if (fileOpenCmd) {
    await fileOpenCmd.run({
      path: fullPath,
      projectId: activeProject?.id,
      name: fileName,
      line,
      column,
    });
  } else {
    sessionStore.openModuleTab({
      kind: "file",
      filePath: fullPath,
      title: fileName,
      projectId: activeProject?.id,
      data: { line, column },
    });
  }
}

/**
 * Remark plugin that converts plain-text file paths in markdown into clickable links.
 */
export function remarkFileLinks() {
  return (tree: Root) => {
    visit(tree, "text", (node: Text, index, parent) => {
      if (!parent || index === undefined) return;
      const pType = (parent as { type?: string }).type;
      if (
        pType === "link" ||
        pType === "code" ||
        pType === "inlineCode" ||
        pType === "html"
      ) {
        return;
      }

      const text = node.value;
      if (!text || text.length < 3 || text.length > 50000) return;

      const matches = Array.from(text.matchAll(FILE_PATH_REGEX));
      if (matches.length === 0) return;

      const newChildren: PhrasingContent[] = [];
      let lastIndex = 0;

      for (const match of matches) {
        const matchText = match[0];
        const matchIndex = match.index;
        if (matchIndex === undefined) continue;

        // Skip if preceded by url scheme
        const preceding = text.slice(Math.max(0, matchIndex - 8), matchIndex);
        if (preceding.includes("://") || preceding.endsWith("@")) continue;

        // Verify with isFilePath
        if (!isFilePath(matchText)) continue;

        // Push text preceding the match
        if (matchIndex > lastIndex) {
          newChildren.push({
            type: "text",
            value: text.slice(lastIndex, matchIndex),
          });
        }

        // Push file link
        const linkNode: Link = {
          type: "link",
          url: matchText,
          title: `Open ${matchText} in new tab`,
          children: [{ type: "text", value: matchText }],
          data: {
            hProperties: {
              className: ["md-file-link"],
            },
          },
        };
        newChildren.push(linkNode);

        lastIndex = matchIndex + matchText.length;
      }

      if (lastIndex < text.length) {
        newChildren.push({
          type: "text",
          value: text.slice(lastIndex),
        });
      }

      if (newChildren.length > 0) {
        (parent.children as any[]).splice(index, 1, ...newChildren);
      }
    });
  };
}

/**
 * Renders plain text (e.g. in user messages) with clickable file paths.
 */
export function renderTextWithFileLinks(text: string): React.ReactNode {
  if (!text || text.length > 50000) return text;

  const matches = Array.from(text.matchAll(FILE_PATH_REGEX));
  if (matches.length === 0) return text;

  const elements: React.ReactNode[] = [];
  let lastIndex = 0;

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    if (!match) continue;
    const matchText = match[0];
    const matchIndex = match.index;
    if (matchIndex === undefined) continue;

    // Skip if preceded by url scheme
    const preceding = text.slice(Math.max(0, matchIndex - 8), matchIndex);
    if (preceding.includes("://") || preceding.endsWith("@")) continue;

    if (!isFilePath(matchText)) continue;

    if (matchIndex > lastIndex) {
      elements.push(text.slice(lastIndex, matchIndex));
    }

    elements.push(
      <span
        key={`file-${matchIndex}-${i}`}
        className="md-code-file"
        role="button"
        tabIndex={0}
        title={`Open ${matchText} in new tab`}
        onClick={(e) => {
          e.stopPropagation();
          void openFileInTab(matchText);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            void openFileInTab(matchText);
          }
        }}
      >
        {matchText}
      </span>,
    );

    lastIndex = matchIndex + matchText.length;
  }

  if (lastIndex < text.length) {
    elements.push(text.slice(lastIndex));
  }

  return elements.length > 0 ? <>{elements}</> : text;
}
