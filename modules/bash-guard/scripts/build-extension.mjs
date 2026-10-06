#!/usr/bin/env node
/**
 * Generates agent/extensions/bash-guard.ts: a single self-contained file that bundles
 * src/extension/hook.ts together with src/engine/* and src/jev.ts. Pi copies extension
 * files verbatim, so the extension cannot import siblings.
 *
 * Usage:
 *   node scripts/build-extension.mjs           write the file
 *   node scripts/build-extension.mjs --check   exit 1 if the committed file is stale
 *
 * Uses esbuild (hoisted from the repo root node_modules).
 */
import { buildSync } from "esbuild";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MODULE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const ENTRY = join(MODULE_ROOT, "src", "extension", "hook.ts");
export const OUTPUT = join(MODULE_ROOT, "agent", "extensions", "bash-guard.ts");

const HEADER = `/**
 * GENERATED - do not edit.
 *
 * Source: modules/bash-guard/src/extension/hook.ts (+ src/engine/*, src/jev.ts).
 * Regenerate: npm run build:extension -w @hive-module/bash-guard
 * A vitest check fails when this file is stale.
 */
`;

/** Returns the generated extension source (LF line endings). */
export function buildExtensionSource() {
  const result = buildSync({
    entryPoints: [ENTRY],
    absWorkingDir: MODULE_ROOT,
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    target: "node22",
    charset: "utf8",
    legalComments: "none",
    logLevel: "silent",
    // Only type-only imports of the Pi package exist; they are erased. Keep it external regardless.
    external: ["@earendil-works/pi-coding-agent"],
    tsconfigRaw: { compilerOptions: { verbatimModuleSyntax: true } },
  });
  const out = result.outputFiles[0]?.text;
  if (!out) throw new Error("esbuild produced no output");
  return (HEADER + out).replace(/\r\n/g, "\n");
}

function main() {
  const check = process.argv.includes("--check");
  const next = buildExtensionSource();
  const current = existsSync(OUTPUT) ? readFileSync(OUTPUT, "utf8").replace(/\r\n/g, "\n") : null;
  if (check) {
    if (current !== next) {
      console.error("bash-guard: agent/extensions/bash-guard.ts is stale. Run: npm run build:extension -w @hive-module/bash-guard");
      process.exit(1);
    }
    console.log("bash-guard: extension is up to date");
    return;
  }
  if (current === next) {
    console.log("bash-guard: extension already up to date");
    return;
  }
  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, next, "utf8");
  console.log(`bash-guard: wrote ${OUTPUT} (${next.length} bytes)`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
