/**
 * Static module metadata. Lives in each module's package.json under the `"hive"` key and is copied into the
 * generated manifest index by scripts/gen-modules.mjs, so core knows about every module (including disabled
 * ones) without importing any module code.
 */

export type ModuleTier = "core" | "recommended" | "bonus";

export const MODULE_TIERS: readonly ModuleTier[] = ["core", "recommended", "bonus"];

/** Agent assets installed into Pi's agent dir while the module is enabled (see main/modules/agent-assets.ts). */
export interface ModuleAgentAssets {
  /**
   * Skill directories, relative to the module root. A trailing `/*` means "every sub-directory"
   * (e.g. `agent/skills/*`); otherwise the path names one skill directory. Each lands in
   * `<piAgentDir>/skills/<dir name>/`.
   */
  skills?: string[];
  /** Markdown inserted into `<piAgentDir>/AGENTS.md` between `<!-- BEGIN <id> managed block -->` markers. */
  agentsMd?: string;
  /** CLI name → script path (relative to the module root). A shim is written to Hive's managed bin dir. */
  bin?: Record<string, string>;
}

/** A command declared statically so core can offer it (and its shortcut) even while the module is disabled. */
export interface StaticCommandDeclaration {
  id: string;
  title: string;
  /** Default chords, same syntax as core commands (e.g. "Mod+Shift+G"). */
  keys?: string[];
  category?: string;
}

/**
 * Contribution ids known without loading the module. Used to keep persisted layout/tabs that belong to a
 * disabled module (rendered as an "Enable X" placeholder) and for just-in-time install prompts.
 */
export interface StaticContributions {
  leftPanels?: string[];
  rightPanels?: string[];
  tabKinds?: string[];
  commands?: StaticCommandDeclaration[];
}

export interface ModuleManifest {
  /** Stable, kebab-case. Also the folder name under modules/ and the IPC namespace (`mod:<id>:…`). */
  id: string;
  title: string;
  description: string;
  tier: ModuleTier;
  /** Hard dependencies, enabled together (transitively). */
  requires?: string[];
  /** Used when present; never auto-enabled. */
  optionalDeps?: string[];
  /** lucide icon name (informational). */
  icon?: string;
  category?: string;
  agent?: ModuleAgentAssets;
  contributes?: StaticContributions;
  /** Filled in by the code generator: whether src/main.ts / src/renderer.tsx exist. */
  hasMain?: boolean;
  hasRenderer?: boolean;
}

/** Module state as reported by main to the renderer. */
export interface ModuleListEntry {
  manifest: ModuleManifest;
  enabled: boolean;
  /** Main-side activation failed (module stays enabled; its UI may still load). */
  error?: string;
}

export interface ModulesSnapshot {
  modules: ModuleListEntry[];
  enabled: string[];
  onboarded: boolean;
  /** Directory where CLI shims of enabled modules are written (add it to PATH to use them). */
  binDir: string;
}

export interface SetModulesEnabledResult {
  enabled: string[];
  /** Human-readable notes, e.g. "kept skill X because you edited it". */
  notices: string[];
}

const ID_RE = /^[a-z][a-z0-9-]*$/;

/** Returns a list of problems with a manifest (empty when valid). Shared by codegen and the main host. */
export function validateManifest(m: Partial<ModuleManifest> | null | undefined): string[] {
  const errors: string[] = [];
  if (!m || typeof m !== "object") return ["manifest is missing"];
  if (typeof m.id !== "string" || !ID_RE.test(m.id)) errors.push(`invalid id ${JSON.stringify(m.id)}`);
  if (typeof m.title !== "string" || !m.title) errors.push("title is required");
  if (typeof m.description !== "string") errors.push("description is required");
  if (!MODULE_TIERS.includes(m.tier as ModuleTier)) errors.push(`invalid tier ${JSON.stringify(m.tier)}`);
  for (const key of ["requires", "optionalDeps"] as const) {
    const v = m[key];
    if (v !== undefined && (!Array.isArray(v) || v.some((x) => typeof x !== "string"))) errors.push(`${key} must be a string array`);
  }
  return errors;
}
