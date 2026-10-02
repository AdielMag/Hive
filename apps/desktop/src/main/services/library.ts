/**
 * Skills & subagents library: discovers Pi skills and pi-subagents agent definitions for a project and
 * globally, parses their frontmatter + markdown sections, and performs minimal in-place frontmatter
 * edits (one key at a time) that preserve every other line of the file.
 *
 * Discovery mirrors Pi (dist/core/package-manager.js collectSkillEntries) and pi-subagents' agent
 * lookup. Settings-declared `skills` paths and Pi packages are not scanned.
 */
import { existsSync, readdirSync, realpathSync, statSync } from "node:fs";
import { readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { parse as parseYaml, parseDocument, stringify as stringifyYaml } from "yaml";
import type {
  LibraryEntry,
  LibraryKind,
  LibraryScope,
  LibrarySection,
  LibrarySnapshot,
  LibraryFieldValue,
  LibrarySetFieldResult,
} from "@pi-studio/protocol";

export interface LibraryRootOptions {
  /** Pi agent dir (defaults to PI_CODING_AGENT_DIR or ~/.pi/agent). */
  agentDir?: string;
  /** Home dir used for ~/.agents/skills (defaults to os.homedir()). */
  homeDir?: string;
}

interface Root {
  dir: string;
  kind: LibraryKind;
  scope: Exclude<LibraryScope, "builtin">;
  /** Pi's "pi" mode treats top-level *.md as skills; "agents" mode treats nested loose *.md as skills. */
  mode: "pi" | "agents";
}

const MAX_DEPTH = 6;
const MAX_SUPPORTING_FILES = 50;

/** pi-subagents built-in agent types (README "Default Agent Types"). */
const BUILTIN_AGENTS: Array<{ name: string; description: string; tools: string; model: string; promptMode: string; body: string }> = [
  {
    name: "general-purpose",
    description: "Parent twin — inherits the parent's full system prompt (same rules, AGENTS.md / CLAUDE.md, project conventions).",
    tools: "all 7",
    model: "inherit",
    promptMode: "append",
    body: "Built-in pi-subagents agent. Inherits the parent's full system prompt plus a sub-agent context bridge, so it follows the same rules the parent does.\n\nCreate `.pi/agents/general-purpose.md` (or `~/.pi/agent/agents/general-purpose.md`) to override it, or set `enabled: false` there to hide it.",
  },
  {
    name: "Explore",
    description: "Fast codebase exploration (read-only).",
    tools: "read, bash, grep, find, ls",
    model: "haiku (falls back to inherit)",
    promptMode: "replace",
    body: "Built-in pi-subagents agent with a standalone, read-only exploration prompt.\n\nCreate `.pi/agents/Explore.md` to override it, or set `enabled: false` there to hide it.",
  },
  {
    name: "Plan",
    description: "Software architect for implementation planning (read-only).",
    tools: "read, bash, grep, find, ls",
    model: "inherit",
    promptMode: "replace",
    body: "Built-in pi-subagents agent with a standalone, read-only planning prompt.\n\nCreate `.pi/agents/Plan.md` to override it, or set `enabled: false` there to hide it.",
  },
];

// ---------------------------------------------------------------------------------------------
// Roots
// ---------------------------------------------------------------------------------------------

function defaultAgentDir(): string {
  return process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
}

function findGitRoot(start: string): string | null {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, ".git"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** `.agents/skills` in cwd and each ancestor, stopping at the git repo root (like Pi). */
function ancestorAgentsSkillDirs(cwd: string): string[] {
  const out: string[] = [];
  const start = resolve(cwd);
  const gitRoot = findGitRoot(start);
  let dir = start;
  for (;;) {
    out.push(join(dir, ".agents", "skills"));
    if (gitRoot && dir === gitRoot) break;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return out;
}

/** Discovery roots in priority order (first wins on name collisions). */
export function libraryRoots(cwd: string | undefined, opts: LibraryRootOptions = {}): Root[] {
  const agentDir = opts.agentDir ?? defaultAgentDir();
  const home = opts.homeDir ?? homedir();
  const roots: Root[] = [];
  if (cwd) {
    roots.push({ dir: join(cwd, ".pi", "skills"), kind: "skill", scope: "project", mode: "pi" });
    for (const d of ancestorAgentsSkillDirs(cwd)) roots.push({ dir: d, kind: "skill", scope: "project", mode: "agents" });
  }
  roots.push({ dir: join(agentDir, "skills"), kind: "skill", scope: "global", mode: "pi" });
  roots.push({ dir: join(home, ".agents", "skills"), kind: "skill", scope: "global", mode: "agents" });
  if (cwd) {
    roots.push({ dir: join(cwd, ".pi", "agents"), kind: "agent", scope: "project", mode: "pi" });
    roots.push({ dir: join(cwd, ".agents", "agents"), kind: "agent", scope: "project", mode: "pi" });
  }
  roots.push({ dir: join(agentDir, "agents"), kind: "agent", scope: "global", mode: "pi" });
  // Dedupe (e.g. cwd === home makes ~/.agents/skills appear twice); keep the first (project) one.
  const seen = new Set<string>();
  return roots.filter((r) => {
    const key = normPath(r.dir);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normPath(p: string): string {
  const r = resolve(p);
  return process.platform === "win32" ? r.toLowerCase() : r;
}

export function isInside(child: string, parent: string): boolean {
  const rel = relative(normPath(parent), normPath(child));
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

function safeReaddir(dir: string) {
  try {
    return readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  } catch {
    return [];
  }
}

function entryType(dir: string, e: { name: string; isFile(): boolean; isDirectory(): boolean; isSymbolicLink(): boolean }): { isFile: boolean; isDir: boolean } {
  if (!e.isSymbolicLink()) return { isFile: e.isFile(), isDir: e.isDirectory() };
  try {
    const s = statSync(join(dir, e.name));
    return { isFile: s.isFile(), isDir: s.isDirectory() };
  } catch {
    return { isFile: false, isDir: false };
  }
}

/** Mirrors Pi's collectSkillEntries: a dir with SKILL.md is one skill (no descent); loose *.md per mode. */
function collectSkillFiles(dir: string, root: string, mode: "pi" | "agents", depth = 0): string[] {
  if (depth > MAX_DEPTH) return [];
  const entries = safeReaddir(dir);
  for (const e of entries) {
    if (e.name !== "SKILL.md") continue;
    if (entryType(dir, e).isFile) return [join(dir, e.name)];
  }
  const out: string[] = [];
  for (const e of entries) {
    if (e.name.startsWith(".") || e.name === "node_modules") continue;
    const { isFile, isDir } = entryType(dir, e);
    const full = join(dir, e.name);
    if (isFile && e.name.endsWith(".md") && ((mode === "pi" && dir === root) || (mode === "agents" && dir !== root))) {
      out.push(full);
      continue;
    }
    if (isDir) out.push(...collectSkillFiles(full, root, mode, depth + 1));
  }
  return out;
}

function collectAgentFiles(dir: string): string[] {
  return safeReaddir(dir)
    .filter((e) => e.name.endsWith(".md") && !e.name.startsWith(".") && entryType(dir, e).isFile)
    .map((e) => join(dir, e.name));
}

function collectSupportingFiles(skillDir: string): { files: string[]; truncated: boolean } {
  const files: string[] = [];
  let truncated = false;
  const walk = (dir: string, depth: number) => {
    if (depth > 4 || truncated) return;
    for (const e of safeReaddir(dir)) {
      if (e.name.startsWith(".") || e.name === "node_modules") continue;
      const full = join(dir, e.name);
      const { isFile, isDir } = entryType(dir, e);
      if (isFile) {
        if (depth === 0 && e.name === "SKILL.md") continue;
        if (files.length >= MAX_SUPPORTING_FILES) {
          truncated = true;
          return;
        }
        files.push(relative(skillDir, full).split(sep).join("/"));
      } else if (isDir) walk(full, depth + 1);
    }
  };
  walk(skillDir, 0);
  return { files, truncated };
}

// ---------------------------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------------------------

export interface ParsedMarkdown {
  frontmatter: Record<string, unknown>;
  hasFrontmatter: boolean;
  body: string;
  parseError?: string;
}

const FM_OPEN = /^---[ \t]*$/;

/** Split `---` frontmatter from the body. Never throws; errors are reported in parseError. */
export function parseFrontmatter(raw: string): ParsedMarkdown {
  const text = raw.replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/);
  if (!FM_OPEN.test(lines[0] ?? "")) return { frontmatter: {}, hasFrontmatter: false, body: text };
  const close = lines.findIndex((l, i) => i > 0 && FM_OPEN.test(l));
  if (close < 0) {
    return { frontmatter: {}, hasFrontmatter: false, body: text, parseError: "Frontmatter is not closed (missing a second `---` line)." };
  }
  const yamlText = lines.slice(1, close).join("\n");
  const body = lines.slice(close + 1).join("\n");
  try {
    const parsed = yamlText.trim() ? parseYaml(yamlText) : {};
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { frontmatter: parsed as Record<string, unknown>, hasFrontmatter: true, body };
    }
    return { frontmatter: {}, hasFrontmatter: true, body, parseError: "Frontmatter is not a key/value mapping." };
  } catch (err) {
    return { frontmatter: {}, hasFrontmatter: true, body, parseError: `Invalid YAML frontmatter: ${err instanceof Error ? err.message : String(err)}` };
  }
}

const HEADING = /^ {0,3}(#{1,6})[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[`*_~[\]()<>]/g, "")
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "") || "section"
  );
}

/**
 * Split a markdown body into sections. Headings inside fenced code blocks are ignored. Splits at the
 * shallowest heading level; if that level occurs only once (a document title), it also splits at the
 * next level so a `# Title` + `## Part` file yields one card per part. Deeper headings stay inside the
 * section content. Text before the first heading becomes an "Overview" section (level 0).
 */
export function splitSections(body: string): LibrarySection[] {
  const lines = body.split(/\r?\n/);
  const headings: Array<{ line: number; level: number; title: string }> = [];
  let fence: { ch: string; len: number } | null = null;
  lines.forEach((line, i) => {
    const f = FENCE.exec(line);
    if (f) {
      const marker = f[1]!;
      if (!fence) fence = { ch: marker[0]!, len: marker.length };
      else if (marker[0] === fence.ch && marker.length >= fence.len && line.trim() === marker) fence = null;
      return;
    }
    if (fence) return;
    const h = HEADING.exec(line);
    if (h) headings.push({ line: i, level: h[1]!.length, title: h[2]!.trim() });
  });

  const levels = [...new Set(headings.map((h) => h.level))].sort((a, b) => a - b);
  let splitAt = levels[0] ?? 0;
  if (levels.length > 1 && headings.filter((h) => h.level === levels[0]).length === 1) splitAt = levels[1]!;
  const splitters = headings.filter((h) => h.level <= splitAt);

  const sections: LibrarySection[] = [];
  const used = new Map<string, number>();
  const push = (level: number, title: string, content: string) => {
    const base = slugify(title);
    const n = used.get(base) ?? 0;
    used.set(base, n + 1);
    sections.push({ level, title, slug: n ? `${base}-${n}` : base, content });
  };
  const firstLine = splitters[0]?.line ?? lines.length;
  const intro = lines.slice(0, firstLine).join("\n").trim();
  if (intro) push(0, "Overview", intro);
  splitters.forEach((h, idx) => {
    const end = splitters[idx + 1]?.line ?? lines.length;
    push(h.level, h.title, lines.slice(h.line + 1, end).join("\n").replace(/^\s*\n/, "").trimEnd());
  });
  return sections;
}

const asString = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : undefined);

const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function buildEntry(path: string, root: Root, raw: string, mtimeMs: number): LibraryEntry {
  const parsed = parseFrontmatter(raw);
  const fm = parsed.frontmatter;
  const isSkillDir = root.kind === "skill" && basename(path) === "SKILL.md";
  const fallbackName = isSkillDir ? basename(dirname(path)) : basename(path, extname(path));
  const name = asString(fm.name) ?? fallbackName;
  const warnings: string[] = [];
  if (root.kind === "skill") {
    if (!asString(fm.description)) warnings.push("No description — Pi will not load this skill.");
    if (asString(fm.name) && (!SKILL_NAME.test(name) || name.length > 64)) {
      warnings.push("Name should be lowercase letters, numbers and single hyphens (max 64 chars).");
    }
    const d = asString(fm.description);
    if (d && d.length > 1024) warnings.push("Description is longer than 1024 characters.");
  } else if (name.includes(":")) {
    warnings.push("Agent names containing ':' are skipped by pi-subagents.");
  }
  const entry: LibraryEntry = {
    id: path,
    kind: root.kind,
    scope: root.scope,
    path,
    sourceDir: root.dir,
    name,
    displayName: asString(fm.display_name),
    description: asString(fm.description),
    color: asString(fm.color),
    frontmatter: fm,
    raw,
    body: parsed.body,
    sections: splitSections(parsed.body),
    mtimeMs,
    readOnly: false,
    shadowed: false,
    warnings,
    ...(parsed.parseError ? { parseError: parsed.parseError } : {}),
  };
  if (isSkillDir) {
    const { files, truncated } = collectSupportingFiles(dirname(path));
    entry.supportingFiles = files;
    if (truncated) entry.supportingFilesTruncated = true;
  }
  return entry;
}

function builtinEntry(b: (typeof BUILTIN_AGENTS)[number]): LibraryEntry {
  const fm = { name: b.name, description: b.description, tools: b.tools, model: b.model, prompt_mode: b.promptMode };
  return {
    id: `builtin:${b.name}`,
    kind: "agent",
    scope: "builtin",
    path: null,
    sourceDir: null,
    name: b.name,
    description: b.description,
    frontmatter: fm,
    raw: "",
    body: b.body,
    sections: splitSections(b.body),
    mtimeMs: 0,
    readOnly: true,
    shadowed: false,
    warnings: [],
  };
}

// ---------------------------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------------------------

async function loadFile(path: string, root: Root): Promise<LibraryEntry | null> {
  try {
    const [raw, st] = await Promise.all([readFile(path, "utf8"), stat(path)]);
    return buildEntry(path, root, raw, st.mtimeMs);
  } catch {
    return null;
  }
}

/** Discover every skill and agent visible from `cwd` (project) plus the global locations. */
export async function listLibrary(cwd?: string, opts: LibraryRootOptions = {}): Promise<LibrarySnapshot> {
  const started = Date.now();
  const roots = libraryRoots(cwd || undefined, opts);
  const jobs: Array<Promise<LibraryEntry | null>> = [];
  for (const root of roots) {
    if (!existsSync(root.dir)) continue;
    const files = root.kind === "skill" ? collectSkillFiles(root.dir, root.dir, root.mode) : collectAgentFiles(root.dir);
    for (const f of files) jobs.push(loadFile(f, root));
  }
  const loaded = (await Promise.all(jobs)).filter((e): e is LibraryEntry => e !== null);

  // Priority = discovery order (roots are already ordered project → global). First wins.
  const winners = new Map<string, LibraryEntry>();
  for (const e of loaded) {
    const key = `${e.kind}:${e.name}`;
    const win = winners.get(key);
    if (!win) winners.set(key, e);
    else {
      e.shadowed = true;
      e.overriddenBy = win.path ?? undefined;
    }
  }
  const entries = [...loaded];
  for (const b of BUILTIN_AGENTS) {
    const be = builtinEntry(b);
    const win = winners.get(`agent:${b.name}`);
    if (win) {
      be.shadowed = true;
      be.overriddenBy = win.path ?? undefined;
      win.overridesBuiltin = true;
    }
    entries.push(be);
  }
  return {
    cwd: cwd || null,
    roots: roots.map((r) => ({ dir: r.dir, kind: r.kind, scope: r.scope, exists: existsSync(r.dir) })),
    entries,
    scannedAt: Date.now(),
    scanMs: Date.now() - started,
  };
}

// ---------------------------------------------------------------------------------------------
// Frontmatter editing
// ---------------------------------------------------------------------------------------------

const KEY_RE = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** `key: value` lines for one scalar, using YAML quoting rules (never line-folded). */
function formatField(key: string, value: Exclude<LibraryFieldValue, null>): string[] {
  const text = stringifyYaml({ [key]: value }, { lineWidth: 0 }).replace(/\n$/, "");
  return text.split("\n");
}

function isContinuation(line: string): boolean {
  return /^[ \t]+\S/.test(line) || /^-(?:[ \t]|$)/.test(line);
}

/**
 * Pure transform: set (or remove when value is null) one top-level frontmatter key, touching only that
 * key's line(s). Falls back to a YAML document round-trip when the existing value spans multiple lines.
 */
export function applyFrontmatterEdit(raw: string, key: string, value: LibraryFieldValue): string {
  const bom = raw.startsWith("\uFEFF") ? "\uFEFF" : "";
  const text = bom ? raw.slice(1) : raw;
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);

  if (!FM_OPEN.test(lines[0] ?? "")) {
    if (value === null) return raw;
    return bom + ["---", ...formatField(key, value), "---", ...lines].join(eol);
  }
  const close = lines.findIndex((l, i) => i > 0 && FM_OPEN.test(l));
  if (close < 0) throw new FrontmatterError("invalid", "Frontmatter is not closed (missing a second `---` line).");

  const keyRe = new RegExp(`^(?:${escapeRe(key)}|"${escapeRe(key)}"|'${escapeRe(key)}')[ \\t]*:(?:[ \\t]|$)`);
  const start = lines.findIndex((l, i) => i > 0 && i < close && keyRe.test(l));
  let out: string[];
  if (start < 0) {
    if (value === null) return raw;
    out = [...lines.slice(0, close), ...formatField(key, value), ...lines.slice(close)];
  } else {
    let end = start + 1; // exclusive
    let probe = start + 1;
    while (probe < close) {
      const l = lines[probe]!;
      if (isContinuation(l)) end = probe + 1;
      else if (l.trim() !== "") break;
      probe++;
    }
    const inline = lines[start]!.replace(keyRe, "").trim();
    const blockScalar = /^[|>]/.test(inline);
    if (end - start > 1 || blockScalar) return bom + roundTrip(lines, close, key, value, eol);
    const replacement = value === null ? [] : formatField(key, value);
    out = [...lines.slice(0, start), ...replacement, ...lines.slice(end)];
  }
  const result = bom + out.join(eol);
  // Guard: the edit must parse and produce exactly the requested value; otherwise use the YAML library.
  const check = parseFrontmatter(result);
  if (check.parseError || !sameValue(check.frontmatter[key], value)) return bom + roundTrip(lines, close, key, value, eol);
  return result;
}

function sameValue(actual: unknown, wanted: LibraryFieldValue): boolean {
  return wanted === null ? actual === undefined : actual === wanted;
}

function roundTrip(lines: string[], close: number, key: string, value: LibraryFieldValue, eol: string): string {
  const doc = parseDocument(lines.slice(1, close).join("\n"));
  if (doc.errors.length) throw new FrontmatterError("invalid", `Invalid YAML frontmatter: ${doc.errors[0]!.message}`);
  if (value === null) doc.delete(key);
  else doc.set(key, value);
  const fmText = doc.toString({ lineWidth: 0 }).replace(/\n$/, "");
  const fmLines = fmText === "{}" || fmText === "" ? [] : fmText.split("\n");
  return ["---", ...fmLines, ...lines.slice(close)].join(eol);
}

export class FrontmatterError extends Error {
  constructor(
    readonly code: "conflict" | "not-allowed" | "io" | "invalid",
    message: string,
  ) {
    super(message);
  }
}

function realOrResolved(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return resolve(p);
  }
}

/** True when `path` is a markdown file under one of the discovery roots for `cwd` (symlinks resolved). */
export function isEditableLibraryPath(path: string, cwd: string | undefined, opts: LibraryRootOptions = {}): boolean {
  if (typeof path !== "string" || !isAbsolute(path) || extname(path).toLowerCase() !== ".md") return false;
  const real = realOrResolved(path);
  return libraryRoots(cwd, opts).some((r) => isInside(path, r.dir) && isInside(real, realOrResolved(r.dir)));
}

/** Set (or remove, when value is null) a frontmatter key in a library file and return the refreshed entry. */
export async function setFrontmatterField(
  req: { cwd?: string; path: string; key: string; value: LibraryFieldValue; expectedMtimeMs?: number },
  opts: LibraryRootOptions = {},
): Promise<LibrarySetFieldResult> {
  const { path, key, value, expectedMtimeMs } = req;
  const cwd = req.cwd || undefined;
  try {
    if (!KEY_RE.test(key ?? "")) throw new FrontmatterError("not-allowed", `Invalid frontmatter key: ${String(key)}`);
    if (value !== null && !["string", "number", "boolean"].includes(typeof value)) {
      throw new FrontmatterError("not-allowed", "Only string, number, boolean or null values can be written.");
    }
    if (typeof value === "number" && !Number.isFinite(value)) throw new FrontmatterError("not-allowed", "Number must be finite.");
    if (!isEditableLibraryPath(path, cwd, opts)) throw new FrontmatterError("not-allowed", "Path is not a skill or agent file in a known location.");

    let raw: string;
    let st;
    try {
      [raw, st] = await Promise.all([readFile(path, "utf8"), stat(path)]);
    } catch (err) {
      throw new FrontmatterError("io", `Could not read ${path}: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (expectedMtimeMs !== undefined && Math.abs(st.mtimeMs - expectedMtimeMs) > 1) {
      throw new FrontmatterError("conflict", "The file changed on disk since it was loaded. Reload and try again.");
    }
    const next = applyFrontmatterEdit(raw, key, value);
    if (next !== raw) {
      const tmp = `${path}.${process.pid}.${Date.now().toString(36)}.tmp`;
      try {
        await writeFile(tmp, next, "utf8");
        await rename(tmp, path);
      } catch (err) {
        await unlink(tmp).catch(() => {});
        throw new FrontmatterError("io", `Could not write ${path}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    const snapshot = await listLibrary(cwd, opts);
    const entry = snapshot.entries.find((e) => e.path && normPath(e.path) === normPath(path));
    if (!entry) throw new FrontmatterError("io", "File was written but could not be re-read.");
    return { ok: true, entry };
  } catch (err) {
    if (err instanceof FrontmatterError) return { ok: false, code: err.code, error: err.message };
    return { ok: false, code: "io", error: err instanceof Error ? err.message : String(err) };
  }
}
