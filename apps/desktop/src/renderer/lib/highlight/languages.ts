/**
 * Language registry for syntax highlighting. Each grammar is a separate lazily-loaded chunk so only the
 * languages actually displayed are ever downloaded/parsed.
 */
import type { LanguageRegistration } from "shiki/core";

type Loader = () => Promise<{ default: LanguageRegistration[] }>;

export const LANGUAGE_LOADERS: Record<string, Loader> = {
  typescript: () => import("@shikijs/langs/typescript"),
  tsx: () => import("@shikijs/langs/tsx"),
  javascript: () => import("@shikijs/langs/javascript"),
  jsx: () => import("@shikijs/langs/jsx"),
  json: () => import("@shikijs/langs/json"),
  jsonc: () => import("@shikijs/langs/jsonc"),
  jsonl: () => import("@shikijs/langs/jsonl"),
  css: () => import("@shikijs/langs/css"),
  scss: () => import("@shikijs/langs/scss"),
  html: () => import("@shikijs/langs/html"),
  xml: () => import("@shikijs/langs/xml"),
  markdown: () => import("@shikijs/langs/markdown"),
  python: () => import("@shikijs/langs/python"),
  rust: () => import("@shikijs/langs/rust"),
  go: () => import("@shikijs/langs/go"),
  shellscript: () => import("@shikijs/langs/shellscript"),
  powershell: () => import("@shikijs/langs/powershell"),
  bat: () => import("@shikijs/langs/bat"),
  yaml: () => import("@shikijs/langs/yaml"),
  toml: () => import("@shikijs/langs/toml"),
  ini: () => import("@shikijs/langs/ini"),
  c: () => import("@shikijs/langs/c"),
  cpp: () => import("@shikijs/langs/cpp"),
  csharp: () => import("@shikijs/langs/csharp"),
  java: () => import("@shikijs/langs/java"),
  kotlin: () => import("@shikijs/langs/kotlin"),
  swift: () => import("@shikijs/langs/swift"),
  php: () => import("@shikijs/langs/php"),
  ruby: () => import("@shikijs/langs/ruby"),
  lua: () => import("@shikijs/langs/lua"),
  sql: () => import("@shikijs/langs/sql"),
  graphql: () => import("@shikijs/langs/graphql"),
  dockerfile: () => import("@shikijs/langs/dockerfile"),
  diff: () => import("@shikijs/langs/diff"),
  vue: () => import("@shikijs/langs/vue"),
  svelte: () => import("@shikijs/langs/svelte"),
  dart: () => import("@shikijs/langs/dart"),
  hlsl: () => import("@shikijs/langs/hlsl"),
  glsl: () => import("@shikijs/langs/glsl"),
  razor: () => import("@shikijs/langs/razor"),
  make: () => import("@shikijs/langs/make"),
};

const ALIASES: Record<string, string> = {
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  node: "javascript",
  sh: "shellscript",
  bash: "shellscript",
  zsh: "shellscript",
  shell: "shellscript",
  console: "shellscript",
  terminal: "shellscript",
  ps: "powershell",
  ps1: "powershell",
  pwsh: "powershell",
  cmd: "bat",
  batch: "bat",
  yml: "yaml",
  py: "python",
  python3: "python",
  rs: "rust",
  golang: "go",
  cs: "csharp",
  "c#": "csharp",
  kt: "kotlin",
  kts: "kotlin",
  md: "markdown",
  mdx: "markdown",
  h: "c",
  hpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  "c++": "cpp",
  rb: "ruby",
  docker: "dockerfile",
  patch: "diff",
  htm: "html",
  svg: "xml",
  xaml: "xml",
  csproj: "xml",
  gql: "graphql",
  cshtml: "razor",
  makefile: "make",
  shader: "hlsl",
  hlsli: "hlsl",
  frag: "glsl",
  vert: "glsl",
  json5: "jsonc",
  ndjson: "jsonl",
  cfg: "ini",
  conf: "ini",
  env: "ini",
};

const PLAIN = new Set(["", "text", "txt", "plain", "plaintext", "output", "log"]);

/** Normalize a fence info string / language id to a registered grammar id (or null for plain text). */
export function resolveLanguage(lang: string | undefined | null): string | null {
  if (!lang) return null;
  const key = lang.trim().toLowerCase().split(/[\s{:]/)[0] ?? "";
  if (PLAIN.has(key)) return null;
  if (LANGUAGE_LOADERS[key]) return key;
  const alias = ALIASES[key];
  return alias && LANGUAGE_LOADERS[alias] ? alias : null;
}

/** Guess the grammar from a file name/path. */
export function languageFromPath(path: string | undefined | null): string | null {
  if (!path) return null;
  const name = path.split(/[\\/]/).pop()!.toLowerCase();
  if (name === "dockerfile" || name.startsWith("dockerfile.")) return "dockerfile";
  if (name === "makefile") return "make";
  if (name.startsWith(".env")) return "ini";
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1) : "";
  return resolveLanguage(ext);
}

/** Short label shown in code block headers. */
export function languageLabel(lang: string | null, raw?: string): string {
  if (!lang) return raw && !PLAIN.has(raw.toLowerCase()) ? raw : "text";
  const labels: Record<string, string> = {
    typescript: "TypeScript",
    tsx: "TSX",
    javascript: "JavaScript",
    jsx: "JSX",
    shellscript: "Shell",
    powershell: "PowerShell",
    csharp: "C#",
    cpp: "C++",
    json: "JSON",
    jsonc: "JSONC",
    yaml: "YAML",
    html: "HTML",
    css: "CSS",
    scss: "SCSS",
    sql: "SQL",
    xml: "XML",
    markdown: "Markdown",
  };
  return labels[lang] ?? lang.charAt(0).toUpperCase() + lang.slice(1);
}
