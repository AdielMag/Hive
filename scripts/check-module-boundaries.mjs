#!/usr/bin/env node
/**
 * Module boundary guardrail. Fails when:
 *   1. core (apps/desktop/src/**) imports module code: a relative path into `modules/` or `@hive-module/*`
 *      (only the two generated index files may);
 *   2. a module imports another module's internals (only `@hive-module/<other>/shared` is allowed);
 *   3. a module reaches into core by relative path (modules talk to core through `@hive/module-sdk`'s host).
 *
 * Usage: node scripts/check-module-boundaries.mjs
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_EXT = /\.(?:[cm]?[jt]sx?)$/;
const SKIP_DIRS = new Set(["node_modules", "out", "dist", "dist-release", ".git"]);
/** Generated index files are the single sanctioned bridge from core to module code. */
const GENERATED = new Set(["modules.generated.ts"]);

const SPECIFIER_RES = [
  /\b(?:import|export)\s+(?:type\s+)?(?:[^'"`;]*?\sfrom\s*)?["']([^"']+)["']/g,
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
];

function* walk(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (SOURCE_EXT.test(entry.name)) yield full;
  }
}

/** Strips comments so commented-out imports aren't flagged. */
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

export function specifiersOf(source) {
  const code = stripComments(source);
  const found = new Set();
  for (const re of SPECIFIER_RES) {
    re.lastIndex = 0;
    for (let m = re.exec(code); m; m = re.exec(code)) found.add(m[1]);
  }
  return [...found];
}

const isInside = (parent, child) => {
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !rel.includes(`..${sep}`) && resolve(parent, rel) === resolve(child));
};

/** @returns {Array<{file: string, specifier: string, rule: string}>} */
export function checkBoundaries(root = ROOT) {
  const violations = [];
  const modulesDir = join(root, "modules");
  const coreDir = join(root, "apps", "desktop", "src");

  for (const file of walk(coreDir)) {
    const base = file.split(sep).pop();
    if (GENERATED.has(base)) continue;
    for (const spec of specifiersOf(readFileSync(file, "utf8"))) {
      const hit = spec.startsWith("@hive-module/") || (spec.startsWith(".") && isInside(modulesDir, resolve(dirname(file), spec)));
      if (hit) violations.push({ file: relative(root, file), specifier: spec, rule: "core must not import module code (use the module registry)" });
    }
  }

  if (existsSync(modulesDir)) {
    for (const entry of readdirSync(modulesDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const own = join(modulesDir, entry.name);
      for (const file of walk(own)) {
        for (const spec of specifiersOf(readFileSync(file, "utf8"))) {
          if (spec.startsWith("@hive-module/")) {
            const [, id, ...rest] = spec.split("/");
            if (id !== entry.name && rest.join("/") !== "shared") {
              violations.push({ file: relative(root, file), specifier: spec, rule: `only "@hive-module/<other>/shared" may be imported from another module` });
            }
          } else if (spec.startsWith(".")) {
            const target = resolve(dirname(file), spec);
            if (isInside(own, target)) continue;
            const rule = isInside(modulesDir, target) ? "must not import another module's files by relative path" : "must not reach into core by relative path (use the ModuleHost)";
            violations.push({ file: relative(root, file), specifier: spec, rule });
          }
        }
      }
    }
  }
  return violations;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const violations = checkBoundaries();
  if (violations.length === 0) {
    console.log("module boundaries OK");
  } else {
    console.error(`${violations.length} module boundary violation(s):`);
    for (const v of violations) console.error(`  ${v.file}: "${v.specifier}" - ${v.rule}`);
    process.exit(1);
  }
}

