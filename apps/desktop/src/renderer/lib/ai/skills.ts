import type { Timeline } from "@pi-studio/pi-adapter";
import type { SessionRegistry } from "@pi-studio/protocol";
import { isUnder, normPath, type PathContext } from "./paths.ts";

export interface SkillLoad {
  name: string;
  description?: string;
  body: string;
  baseDir: string;
  filePath: string;
  source: "read" | "/skill";
}

export interface SkillFrontmatter {
  name?: string;
  description?: string;
  body: string;
}

/**
 * Parses YAML frontmatter from a markdown file (delimited by `---`).
 */
export function parseFrontmatter(text: string): SkillFrontmatter {
  if (!text || typeof text !== "string") return { body: "" };

  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { body: text };

  const yaml = match[1] ?? "";
  const body = match[2] ?? "";

  let name: string | undefined;
  let description: string | undefined;

  const lines = yaml.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const nameMatch = line.match(/^name:\s*(.+)$/);
    if (nameMatch) {
      name = stripQuotes(nameMatch[1]!.trim());
      continue;
    }

    const descMatch = line.match(/^description:\s*(.*)$/);
    if (descMatch) {
      const rest = descMatch[1]!.trim();
      if (rest === ">" || rest === "|" || rest === ">-" || rest === "|-") {
        // Multiline folded or literal block
        const blockLines: string[] = [];
        let j = i + 1;
        while (j < lines.length && /^\s+/.test(lines[j]!)) {
          blockLines.push(lines[j]!.trim());
          j++;
        }
        i = j - 1;
        description = blockLines.join(" ");
      } else {
        description = stripQuotes(rest);
      }
    }
  }

  return { name, description, body };
}

function stripQuotes(str: string): string {
  if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
    return str.slice(1, -1);
  }
  return str;
}

/**
 * Extracts the parent directory of a path (forward-slash normalized).
 */
function getDirname(filePath: string): string {
  const norm = filePath.replace(/\\/g, "/");
  const idx = norm.lastIndexOf("/");
  if (idx <= 0) return "/";
  return norm.slice(0, idx);
}

/**
 * Detects if a tool call was reading a `SKILL.md` file, extracting skill metadata.
 */
export function detectSkillRead(
  name: string,
  args?: Record<string, unknown>,
  resultText?: string,
  registry?: SessionRegistry | null,
  ctx?: PathContext,
): SkillLoad | null {
  if (name !== "read") return null;
  const rawPath = typeof args?.path === "string" ? args.path : "";
  if (!/(?:^|[\\/])skill\.md$/i.test(rawPath)) return null;

  const pCtx = ctx ?? { cwd: "", homeDir: "" };
  const normalizedFilePath = normPath(rawPath, pCtx);
  const baseDir = getDirname(normalizedFilePath);

  // Look for match in session registry
  const regSkill = registry?.skills.find(
    (s) => normPath(s.filePath, pCtx) === normalizedFilePath || normPath(s.baseDir, pCtx) === baseDir,
  );

  const { name: fmName, description: fmDesc, body } = parseFrontmatter(resultText ?? "");

  // Resolve skill name: frontmatter > registry > directory name
  const dirSegments = baseDir.split("/").filter(Boolean);
  const fallbackDirName = dirSegments[dirSegments.length - 1] ?? "skill";
  const skillName = fmName || regSkill?.name || fallbackDirName;
  const description = fmDesc || regSkill?.description;

  return {
    name: skillName,
    description,
    body,
    baseDir,
    filePath: normalizedFilePath,
    source: "read",
  };
}

const SKILL_BLOCK_REGEX = /^<skill name="([^"]+)" location="([^"]+)">\n([\s\S]*?)\n<\/skill>(?:\n\n([\s\S]+))?$/;

/**
 * Parses Pi's interactive `/skill:<name>` user message format.
 */
export function parseSkillBlock(
  userText: string,
): { name: string; location: string; body: string; rest?: string } | null {
  if (!userText || typeof userText !== "string") return null;
  const match = userText.match(SKILL_BLOCK_REGEX);
  if (!match) return null;
  return {
    name: match[1]!,
    location: match[2]!,
    body: match[3]!,
    rest: match[4] || undefined,
  };
}

/**
 * Checks if a tool call is accessing files under a known skill directory.
 */
export function skillForToolCall(
  name: string,
  args: Record<string, unknown> | undefined,
  skillDirs: Map<string, string>,
  ctx: PathContext,
): string | null {
  if (skillDirs.size === 0) return null;

  // Path-based file inspection tools
  if (["read", "write", "edit", "grep", "find", "ls"].includes(name)) {
    const rawPath = typeof args?.path === "string" ? args.path : "";
    if (rawPath) {
      const norm = normPath(rawPath, ctx);
      for (const [dir, skillName] of skillDirs.entries()) {
        if (isUnder(norm, dir)) return skillName;
      }
    }
  }

  // Shell command execution
  if (name === "bash") {
    const command = typeof args?.command === "string" ? args.command : "";
    if (command) {
      const lowerCmd = command.toLowerCase().replace(/\\/g, "/");
      for (const [dir, skillName] of skillDirs.entries()) {
        if (lowerCmd.includes(dir.toLowerCase())) {
          return skillName;
        }
      }
    }
  }

  return null;
}

export interface SkillIndex {
  loads: Map<string, SkillLoad>;
  usedBy: Map<string, string>;
}

/**
 * Indexes all skill loads and usages across the transcript timeline.
 */
export function indexSkills(
  timeline: Timeline,
  registry: SessionRegistry | null | undefined,
  ctx: PathContext,
): SkillIndex {
  const loads = new Map<string, SkillLoad>();
  const usedBy = new Map<string, string>();
  const activeSkillDirs = new Map<string, string>();

  // If registry has skills, index their base dirs
  if (registry?.skills) {
    for (const skill of registry.skills) {
      const normDir = normPath(skill.baseDir, ctx);
      activeSkillDirs.set(normDir, skill.name);
    }
  }

  for (const item of timeline.items) {
    if (item.kind === "user") {
      const parsed = parseSkillBlock(item.text);
      if (parsed) {
        const normLoc = normPath(parsed.location, ctx);
        const baseDir = getDirname(normLoc);
        activeSkillDirs.set(baseDir, parsed.name);
        loads.set(item.key, {
          name: parsed.name,
          body: parsed.body,
          baseDir,
          filePath: normLoc,
          source: "/skill",
        });
      }
    } else if (item.kind === "assistant") {
      for (const block of item.blocks) {
        if (block.type === "toolCall") {
          const res = timeline.toolResults[block.id];
          const detected = detectSkillRead(block.name, block.arguments, res?.text, registry, ctx);
          if (detected) {
            loads.set(block.id, detected);
            activeSkillDirs.set(detected.baseDir, detected.name);
          } else {
            const skillName = skillForToolCall(block.name, block.arguments, activeSkillDirs, ctx);
            if (skillName) {
              usedBy.set(block.id, skillName);
            }
          }
        }
      }
    }
  }

  return { loads, usedBy };
}
