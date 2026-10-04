/**
 * Generic installer for module agent assets (manifest `agent` block). No module-specific code lives here.
 *
 * - skills   → `<piAgentDir>/skills/<name>/` plus a `.hive-managed` marker (module id + content hash).
 * - agentsMd → upserted in place between `<!-- BEGIN <id> managed block -->` / `<!-- END <id> managed block -->`
 *              in `<piAgentDir>/AGENTS.md`.
 * - bin      → shims in Hive's managed bin dir (`<hive data>/bin`): `<name>.cmd` + an `sh` script on Windows,
 *              an executable `sh` script elsewhere. Hive never edits PATH; users add that dir themselves.
 *
 * Everything written is recorded (`InstalledAssets`, persisted in modules.json) and disabling removes only
 * recorded paths. A skill whose content changed since Hive wrote it (user edit) is kept, with a notice.
 */
import { createHash } from "node:crypto";
import { chmodSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import type { ModuleManifest } from "@hive/module-sdk";

export const MARKER_FILE = ".hive-managed";

export interface InstalledSkill {
  name: string;
  path: string;
  /** Content hash Hive wrote (also stored in the marker). */
  hash: string;
}

export interface InstalledExtension {
  name: string;
  path: string;
  /** Content hash Hive wrote (also stored in the marker). */
  hash: string;
}

export interface InstalledAssets {
  skills?: InstalledSkill[];
  extensions?: InstalledExtension[];
  /** AGENTS.md that holds this module's managed block. */
  agentsMd?: string;
  bin?: string[];
}

export interface AgentAssetOptions {
  piAgentDir: string;
  binDir: string;
  platform?: NodeJS.Platform;
}

export interface AssetResult {
  record: InstalledAssets;
  notices: string[];
}

interface Marker {
  managedBy: "hive";
  module: string;
  hash: string;
}

const beginMarker = (id: string) => `<!-- BEGIN ${id} managed block -->`;
const endMarker = (id: string) => `<!-- END ${id} managed block -->`;

/** Line endings are normalized so a CRLF git checkout hashes the same as an LF copy. */
export function hashFile(file: string): string {
  const h = createHash("sha256");
  h.update(readFileSync(file).toString("binary").replace(/\r\n/g, "\n"));
  return h.digest("hex");
}

export function hashDir(dir: string): string {
  const h = createHash("sha256");
  const walk = (d: string) => {
    for (const name of readdirSync(d).sort()) {
      if (name === MARKER_FILE) continue;
      const full = join(d, name);
      const rel = relative(dir, full).replace(/\\/g, "/");
      if (statSync(full).isDirectory()) walk(full);
      else {
        h.update(`${rel}\0`);
        h.update(readFileSync(full).toString("binary").replace(/\r\n/g, "\n"));
        h.update("\0");
      }
    }
  };
  walk(dir);
  return h.digest("hex");
}

function readMarker(dir: string): Marker | null {
  try {
    const m = JSON.parse(readFileSync(join(dir, MARKER_FILE), "utf8")) as Marker;
    return m && typeof m.module === "string" && typeof m.hash === "string" ? m : null;
  } catch {
    return null;
  }
}

function writeMarker(dir: string, moduleId: string, hash: string): void {
  const marker: Marker = { managedBy: "hive", module: moduleId, hash };
  writeFileSync(join(dir, MARKER_FILE), `${JSON.stringify(marker, null, 2)}\n`, "utf8");
}

/** Expands manifest skill entries (`dir` or `dir/*`) into absolute skill directories. */
export function resolveSkillDirs(moduleRoot: string, patterns: readonly string[]): string[] {
  const out: string[] = [];
  for (const pattern of patterns) {
    const clean = pattern.replace(/\\/g, "/").replace(/\/+$/, "");
    if (clean.endsWith("/*")) {
      const parent = resolve(moduleRoot, clean.slice(0, -2));
      if (!existsSync(parent)) continue;
      for (const name of readdirSync(parent).sort()) {
        const full = join(parent, name);
        if (statSync(full).isDirectory()) out.push(full);
      }
    } else {
      const full = resolve(moduleRoot, clean);
      if (existsSync(full) && statSync(full).isDirectory()) out.push(full);
    }
  }
  return out;
}

/** Inserts or replaces `id`'s managed block. Keeps the file's line-ending style; appends when missing. */
export function upsertManagedBlock(text: string, id: string, body: string): string {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lf = text.replace(/\r\n/g, "\n");
  const block = `${beginMarker(id)}\n${body.replace(/\r\n/g, "\n").replace(/\n+$/, "")}\n${endMarker(id)}`;
  const a = lf.indexOf(beginMarker(id));
  const b = a === -1 ? -1 : lf.indexOf(endMarker(id), a);
  let next: string;
  if (a !== -1 && b !== -1) {
    next = lf.slice(0, a) + block + lf.slice(b + endMarker(id).length);
  } else if (!lf.trim()) {
    next = `${block}\n`;
  } else {
    next = `${lf.replace(/\n*$/, "")}\n\n${block}\n`;
  }
  return eol === "\n" ? next : next.replace(/\n/g, "\r\n");
}

/** Removes `id`'s managed block (and the blank line that separated it). No-op when absent. */
export function removeManagedBlock(text: string, id: string): string {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lf = text.replace(/\r\n/g, "\n");
  const a = lf.indexOf(beginMarker(id));
  const b = a === -1 ? -1 : lf.indexOf(endMarker(id), a);
  if (a === -1 || b === -1) return text;
  const before = lf.slice(0, a).replace(/\n+$/, "");
  const after = lf.slice(b + endMarker(id).length).replace(/^\n+/, "");
  let next = before && after ? `${before}\n\n${after}` : before || after;
  if (next && !next.endsWith("\n")) next += "\n";
  return eol === "\n" ? next : next.replace(/\n/g, "\r\n");
}

function writeIfChanged(path: string, content: string): boolean {
  if (existsSync(path) && readFileSync(path, "utf8") === content) return false;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
  return true;
}

function shims(name: string, script: string, binDir: string, platform: NodeJS.Platform): Array<[string, string, boolean]> {
  const posix = script.replace(/\\/g, "/");
  const sh: [string, string, boolean] = [join(binDir, name), `#!/bin/sh\nexec node "${posix}" "$@"\n`, true];
  if (platform === "win32") return [[join(binDir, `${name}.cmd`), `@echo off\r\nnode "${script}" %*\r\n`, false], sh];
  return [sh];
}

/**
 * Installs (or re-syncs) a module's agent assets. Idempotent: unchanged files aren't rewritten.
 * `previous` is the record from the last install, used to drop shims/skills the module no longer ships.
 */
export function installAgentAssets(
  manifest: ModuleManifest,
  moduleRoot: string,
  opts: AgentAssetOptions,
  previous?: InstalledAssets,
): AssetResult {
  const agent = manifest.agent ?? {};
  const record: InstalledAssets = {};
  const notices: string[] = [];
  const id = manifest.id;

  // Skills
  if (agent.skills?.length) {
    const skills: InstalledSkill[] = [];
    for (const src of resolveSkillDirs(moduleRoot, agent.skills)) {
      const name = basename(src);
      const dest = join(opts.piAgentDir, "skills", name);
      const srcHash = hashDir(src);
      if (!existsSync(dest)) {
        mkdirSync(dirname(dest), { recursive: true });
        cpSync(src, dest, { recursive: true });
        writeMarker(dest, id, srcHash);
        skills.push({ name, path: dest, hash: srcHash });
        continue;
      }
      const marker = readMarker(dest);
      const destHash = hashDir(dest);
      if (marker && marker.module !== id) {
        notices.push(`Skill "${name}" is managed by the "${marker.module}" module; left untouched.`);
      } else if (marker) {
        if (destHash !== marker.hash) {
          notices.push(`Skill "${name}" was edited outside Hive; kept your version (${dest}).`);
          skills.push({ name, path: dest, hash: marker.hash });
        } else {
          if (destHash !== srcHash) {
            rmSync(dest, { recursive: true, force: true });
            cpSync(src, dest, { recursive: true });
            writeMarker(dest, id, srcHash);
          }
          skills.push({ name, path: dest, hash: srcHash });
        }
      } else if (destHash === srcHash) {
        // Identical hand-installed copy: adopt it.
        writeMarker(dest, id, srcHash);
        skills.push({ name, path: dest, hash: srcHash });
      } else {
        notices.push(`Skill "${name}" already exists and isn't managed by Hive; left untouched (${dest}).`);
      }
    }
    if (skills.length) record.skills = skills;
  }
  // Skills Hive installed before but the module no longer ships.
  for (const old of previous?.skills ?? []) {
    if (!record.skills?.some((s) => s.path === old.path)) notices.push(...removeSkill(old, id));
  }

  // Extensions
  if (agent.extensions?.length) {
    const extensions: InstalledExtension[] = [];
    const extDir = join(opts.piAgentDir, "extensions");
    for (const rel of agent.extensions) {
      const src = resolve(moduleRoot, rel);
      if (!existsSync(src)) {
        notices.push(`Extension source missing: ${src}`);
        continue;
      }
      const name = basename(src);
      const dest = join(extDir, name);
      const markerPath = join(extDir, `.${name}.hive-managed`);
      const srcHash = hashFile(src);

      if (!existsSync(dest)) {
        mkdirSync(extDir, { recursive: true });
        cpSync(src, dest);
        writeFileSync(markerPath, JSON.stringify({ managedBy: "hive", module: id, hash: srcHash }), "utf8");
        extensions.push({ name, path: dest, hash: srcHash });
        continue;
      }

      let marker: Marker | null = null;
      if (existsSync(markerPath)) {
        try {
          marker = JSON.parse(readFileSync(markerPath, "utf8")) as Marker;
        } catch {
          // ignore corrupted marker
        }
      }
      const destHash = hashFile(dest);

      if (marker && marker.module !== id) {
        notices.push(`Extension "${name}" is managed by the "${marker.module}" module; left untouched.`);
      } else if (marker) {
        if (destHash !== marker.hash) {
          notices.push(`Extension "${name}" was edited outside Hive; kept your version (${dest}).`);
          extensions.push({ name, path: dest, hash: marker.hash });
        } else {
          if (destHash !== srcHash) {
            cpSync(src, dest);
            writeFileSync(markerPath, JSON.stringify({ managedBy: "hive", module: id, hash: srcHash }), "utf8");
          }
          extensions.push({ name, path: dest, hash: srcHash });
        }
      } else if (destHash === srcHash) {
        writeFileSync(markerPath, JSON.stringify({ managedBy: "hive", module: id, hash: srcHash }), "utf8");
        extensions.push({ name, path: dest, hash: srcHash });
      } else {
        notices.push(`Extension "${name}" already exists and isn't managed by Hive; left untouched (${dest}).`);
      }
    }
    if (extensions.length) record.extensions = extensions;
  }
  for (const old of previous?.extensions ?? []) {
    if (!record.extensions?.some((e) => e.path === old.path)) notices.push(...removeExtension(old, id));
  }

  // AGENTS.md managed block
  const agentsPath = join(opts.piAgentDir, "AGENTS.md");
  if (agent.agentsMd) {
    const src = resolve(moduleRoot, agent.agentsMd);
    if (existsSync(src)) {
      const current = existsSync(agentsPath) ? readFileSync(agentsPath, "utf8") : "";
      const next = upsertManagedBlock(current, id, readFileSync(src, "utf8"));
      writeIfChanged(agentsPath, next);
      record.agentsMd = agentsPath;
    } else {
      notices.push(`AGENTS.md block source missing: ${src}`);
    }
  } else if (previous?.agentsMd) {
    removeBlockFrom(previous.agentsMd, id);
  }

  // CLI shims
  const platform = opts.platform ?? process.platform;
  const bin: string[] = [];
  for (const [name, rel] of Object.entries(agent.bin ?? {})) {
    const script = resolve(moduleRoot, rel);
    for (const [path, content, exec] of shims(name, script, opts.binDir, platform)) {
      writeIfChanged(path, content);
      if (exec) {
        try {
          chmodSync(path, 0o755);
        } catch {
          // best effort (Windows)
        }
      }
      bin.push(path);
    }
  }
  for (const old of previous?.bin ?? []) if (!bin.includes(old)) safeUnlink(old);
  if (bin.length) record.bin = bin;

  return { record, notices };
}

function removeSkill(skill: InstalledSkill, moduleId: string): string[] {
  if (!existsSync(skill.path)) return [];
  const marker = readMarker(skill.path);
  if (!marker || marker.module !== moduleId) return [`Skill "${skill.name}" is no longer managed by Hive; left in place.`];
  if (hashDir(skill.path) !== skill.hash) {
    return [`Kept skill "${skill.name}" because it was edited outside Hive (${skill.path}).`];
  }
  rmSync(skill.path, { recursive: true, force: true });
  return [];
}

function removeExtension(ext: InstalledExtension, moduleId: string): string[] {
  if (!existsSync(ext.path)) return [];
  const extDir = dirname(ext.path);
  const markerPath = join(extDir, `.${basename(ext.path)}.hive-managed`);
  let marker: Marker | null = null;
  if (existsSync(markerPath)) {
    try {
      marker = JSON.parse(readFileSync(markerPath, "utf8")) as Marker;
    } catch {
      // ignore corrupted marker
    }
  }
  if (!marker || marker.module !== moduleId) return [`Extension "${ext.name}" is no longer managed by Hive; left in place.`];
  if (hashFile(ext.path) !== ext.hash) {
    return [`Kept extension "${ext.name}" because it was edited outside Hive (${ext.path}).`];
  }
  safeUnlink(ext.path);
  safeUnlink(markerPath);
  return [];
}

function removeBlockFrom(agentsPath: string, id: string): void {
  if (!existsSync(agentsPath)) return;
  const current = readFileSync(agentsPath, "utf8");
  const next = removeManagedBlock(current, id);
  if (next !== current) writeFileSync(agentsPath, next, "utf8");
}

function safeUnlink(path: string): void {
  try {
    if (existsSync(path)) unlinkSync(path);
  } catch {
    // ignore
  }
}

/** Removes exactly what `record` says Hive installed for `moduleId`. Returns notices for kept files. */
export function removeAgentAssets(moduleId: string, record: InstalledAssets | undefined): string[] {
  if (!record) return [];
  const notices: string[] = [];
  for (const skill of record.skills ?? []) notices.push(...removeSkill(skill, moduleId));
  for (const ext of record.extensions ?? []) notices.push(...removeExtension(ext, moduleId));
  if (record.agentsMd) removeBlockFrom(record.agentsMd, moduleId);
  for (const path of record.bin ?? []) safeUnlink(path);
  return notices;
}

export function hasAgentAssets(manifest: ModuleManifest): boolean {
  const a = manifest.agent;
  return !!a && (!!a.skills?.length || !!a.agentsMd || Object.keys(a.bin ?? {}).length > 0 || !!a.extensions?.length);
}
