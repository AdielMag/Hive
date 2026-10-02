// Pure helpers for conventional-commit based versioning and changelog generation (no dependencies).

/** @typedef {{ hash: string, subject: string, body: string }} RawCommit */
/** @typedef {{ hash: string, type: string, scope: string | null, breaking: boolean, description: string }} ParsedCommit */

const HEADER = /^(?<type>[a-z]+)(?:\((?<scope>[^)]+)\))?(?<bang>!)?:\s*(?<description>.+)$/i;

/** @param {RawCommit} c @returns {ParsedCommit} */
export function parseCommit(c) {
  const m = HEADER.exec(c.subject.trim());
  const breakingFooter = /^BREAKING[ -]CHANGE:/m.test(c.body ?? "");
  if (!m?.groups) {
    return { hash: c.hash, type: "other", scope: null, breaking: breakingFooter, description: c.subject.trim() };
  }
  return {
    hash: c.hash,
    type: m.groups.type.toLowerCase(),
    scope: m.groups.scope ?? null,
    breaking: Boolean(m.groups.bang) || breakingFooter,
    description: m.groups.description.trim(),
  };
}

/** Commits produced by the release job itself never trigger another release. */
export function isReleaseCommit(c) {
  return /^chore\(release\):/i.test(c.subject) || /\[skip release\]/i.test(c.subject);
}

/**
 * Decide the bump. Every merge to main ships a release, so anything that isn't a feature or a breaking
 * change is a patch. Pre-1.0, breaking changes bump the minor (semver §4 convention).
 * @param {ParsedCommit[]} commits @param {string} current
 * @returns {"major" | "minor" | "patch" | null}
 */
export function decideBump(commits, current) {
  if (commits.length === 0) return null;
  const major = Number(current.split(".")[0]);
  if (commits.some((c) => c.breaking)) return major === 0 ? "minor" : "major";
  if (commits.some((c) => c.type === "feat")) return "minor";
  return "patch";
}

/** @param {string} version @param {"major" | "minor" | "patch"} bump */
export function bumpVersion(version, bump) {
  const [maj, min, pat] = version.replace(/^v/, "").split(/[.-]/).map(Number);
  if (bump === "major") return `${maj + 1}.0.0`;
  if (bump === "minor") return `${maj}.${min + 1}.0`;
  return `${maj}.${min}.${pat + 1}`;
}

const SECTIONS = [
  ["breaking", "⚠️ Breaking changes"],
  ["feat", "✨ Features"],
  ["fix", "🐛 Fixes"],
  ["perf", "⚡ Performance"],
  ["refactor", "♻️ Refactoring"],
  ["docs", "📝 Documentation"],
  ["ci", "🔧 CI / build"],
  ["other", "🧹 Other changes"],
];

const sectionOf = (c) => {
  if (c.breaking) return "breaking";
  if (["feat", "fix", "perf", "refactor", "docs"].includes(c.type)) return c.type;
  if (["ci", "build"].includes(c.type)) return "ci";
  return "other";
};

/**
 * @param {{ version: string, date: string, commits: ParsedCommit[], repoUrl?: string, previousTag?: string | null }} opts
 * @returns {string} markdown section (starts with "## ")
 */
export function renderChangelogSection({ version, date, commits, repoUrl, previousTag }) {
  const groups = new Map(SECTIONS.map(([k]) => [k, []]));
  for (const c of commits) groups.get(sectionOf(c)).push(c);
  const link = (hash) => (repoUrl ? `[\`${hash.slice(0, 7)}\`](${repoUrl}/commit/${hash})` : `\`${hash.slice(0, 7)}\``);
  const lines = [];
  const compare = repoUrl && previousTag ? ` · [diff](${repoUrl}/compare/${previousTag}...v${version})` : "";
  lines.push(`## v${version} — ${date}${compare}`, "");
  for (const [key, title] of SECTIONS) {
    const list = groups.get(key);
    if (!list.length) continue;
    lines.push(`### ${title}`, "");
    for (const c of list) lines.push(`- ${c.scope ? `**${c.scope}:** ` : ""}${c.description} (${link(c.hash)})`);
    lines.push("");
  }
  return lines.join("\n");
}

/** Insert a new section at the top of an existing CHANGELOG.md (below the title/preamble). */
export function prependChangelog(existing, section) {
  const title = "# Changelog\n\nAll notable changes to Hive are documented here. This file is generated on every merge to `main`.\n";
  if (!existing || !existing.trim()) return `${title}\n${section}`;
  const idx = existing.indexOf("\n## ");
  if (idx === -1) return `${existing.trimEnd()}\n\n${section}`;
  return `${existing.slice(0, idx + 1)}${section}\n${existing.slice(idx + 1)}`;
}
