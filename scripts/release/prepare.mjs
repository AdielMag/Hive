#!/usr/bin/env node
// Computes the next version from conventional commits since the last v* tag, bumps package.json files,
// updates CHANGELOG.md and writes release notes. Designed for CI but safe to run locally (--dry-run).
//
// Outputs (to $GITHUB_OUTPUT when present): released=true|false, version, tag, notes_file
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { bumpVersion, decideBump, isReleaseCommit, parseCommit, prependChangelog, renderChangelogSection } from "./conventional.mjs";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const dryRun = process.argv.includes("--dry-run");
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();

function output(key, value) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
  console.log(`${key}=${value}`);
}

function lastTag() {
  try {
    return git("describe", "--tags", "--abbrev=0", "--match", "v[0-9]*");
  } catch {
    return null;
  }
}

function commitsSince(tag) {
  const SEP = "\u001e";
  const END = "\u001f";
  const raw = git("log", `--format=%H${SEP}%s${SEP}%b${END}`, ...(tag ? [`${tag}..HEAD`] : ["HEAD"]));
  return raw
    .split(END)
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r) => {
      const [hash, subject, body] = r.split(SEP);
      return { hash, subject: subject ?? "", body: body ?? "" };
    })
    .filter((c) => !isReleaseCommit(c));
}

const pkgPaths = [join(root, "package.json"), join(root, "apps/desktop/package.json")];
const rootPkg = JSON.parse(readFileSync(pkgPaths[0], "utf8"));
const tag = lastTag();
const base = (tag ?? `v${rootPkg.version}`).replace(/^v/, "");
const commits = commitsSince(tag).map(parseCommit);
const bump = decideBump(commits, base);

if (!bump) {
  console.log(`No new commits since ${tag ?? "the beginning"}; nothing to release.`);
  output("released", "false");
  process.exit(0);
}

let version = bumpVersion(base, bump);
// Never collide with an existing tag (e.g. manual tags).
while (git("tag", "--list", `v${version}`)) version = bumpVersion(version, "patch");

const repoUrl = (rootPkg.repository?.url ?? "").replace(/^git\+/, "").replace(/\.git$/, "") || undefined;
const date = new Date().toISOString().slice(0, 10);
const section = renderChangelogSection({ version, date, commits, repoUrl, previousTag: tag });
const notesFile = join(root, "RELEASE_NOTES.md");

console.log(`Releasing v${version} (${bump}) with ${commits.length} commit(s) since ${tag ?? "start"}\n`);
console.log(section);

if (!dryRun) {
  for (const p of pkgPaths) {
    const pkg = JSON.parse(readFileSync(p, "utf8"));
    pkg.version = version;
    writeFileSync(p, `${JSON.stringify(pkg, null, 2)}\n`);
  }
  const changelogPath = join(root, "CHANGELOG.md");
  const existing = existsSync(changelogPath) ? readFileSync(changelogPath, "utf8") : "";
  writeFileSync(changelogPath, prependChangelog(existing, section));
  writeFileSync(notesFile, section.replace(/^## .*\n+/, ""));
}

output("released", "true");
output("version", version);
output("tag", `v${version}`);
output("notes_file", notesFile);
